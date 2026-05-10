import { createTool } from '@inngest/agent-kit'
import * as Sentry from '@sentry/nextjs'
import z from 'zod'
import type { Tool } from '@inngest/agent-kit'
import { getSandbox } from '@/sandbox/sandboxManager'
import { makeEvent, type EventEmitterFn } from '@/streaming/events'

export interface AgentState {
  summary: string
  files: Record<string, string>
}

export interface ToolSet {
  terminal: ReturnType<typeof createTool>
  createOrUpdateFiles: ReturnType<typeof createTool>
  readFiles: ReturnType<typeof createTool>
  listFiles: ReturnType<typeof createTool>
}

export interface CreateToolsOptions {
  sandboxId: string
  allowedFiles?: string[]
  emit?: EventEmitterFn
}

export function createTools({ sandboxId, allowedFiles, emit }: CreateToolsOptions): ToolSet {

  /** Derive a human-readable description from a shell command */
  function describeCommand(command: string): string {
    const cmd = command.trim()
    // npm / pnpm installs
    const installMatch = cmd.match(/(?:npm|pnpm|yarn)\s+(?:install|add|i)\s+(.+?)(?:\s+--|$)/)
    if (installMatch) return `Installing ${installMatch[1].trim().split(/\s+/).slice(0, 3).join(', ')}…`
    // npx commands
    const npxMatch = cmd.match(/npx\s+(\S+)/)
    if (npxMatch) return `Running ${npxMatch[1]}…`
    // prisma
    if (cmd.includes('prisma migrate')) return 'Running Prisma migration…'
    if (cmd.includes('prisma generate')) return 'Generating Prisma client…'
    // build / check
    if (cmd.includes('next build') || cmd.includes('tsc')) return 'Type-checking project…'
    // generic fallback — trim to 60 chars
    return cmd.length > 60 ? cmd.slice(0, 57) + '…' : cmd
  }

  const terminal = createTool({
    name: 'terminal',
    description: 'Run a shell command in the sandbox',
    parameters: z.object({ command: z.string() }),
    handler: async ({ command }, { step: toolStep }) => {
      const description = describeCommand(command)
      emit?.(makeEvent('task_started', { data: { description, type: 'terminal' } }))

      return toolStep?.run('terminal', async () => {
        const buffers = { stdout: '', stderr: '' }
        try {
          const sandbox = await getSandbox(sandboxId)
          const result = await sandbox.commands.run(command, {
            onStdout: (data: string) => { buffers.stdout += data },
            onStderr: (data: string) => { buffers.stderr += data },
          })
          return result.stdout || '(no output)'
        } catch (err) {
          Sentry.captureException(err, {
            extra: { context: 'terminal tool', sandboxId, command: command.slice(0, 200) },
          })
          return `Command failed: ${err}\nstdout: ${buffers.stdout}\nstderr: ${buffers.stderr}`
        }
      })
    },
  })

  const createOrUpdateFiles = createTool({
    name: 'createOrUpdateFiles',
    description: 'Create or update files in the sandbox',
    parameters: z.object({
      files: z.array(z.object({ path: z.string(), content: z.string() })),
    }),
    handler: async (
      { files },
      { step: toolStep, network }: Tool.Options<AgentState>,
    ) => {
      const violatingFiles = allowedFiles
        ? files.filter((f) => !allowedFiles.includes(f.path))
        : []

      if (violatingFiles.length > 0) {
        const msg = `Scope violation: agent tried to write files outside task scope: ${violatingFiles.map((f) => f.path).join(', ')}`
        Sentry.captureMessage(msg, { level: 'warning', extra: { sandboxId, allowedFiles } })
        const allowed = allowedFiles
          ? files.filter((f) => allowedFiles.includes(f.path))
          : files
        if (allowed.length === 0) return `Blocked: no allowed files to write`
        files = allowed
      }

      const newFiles = await toolStep?.run('createOrUpdateFiles', async () => {
        try {
          const updatedFiles: Record<string, string> = {
            ...(network?.state?.data?.files ?? {}),
          }
          const sandbox = await getSandbox(sandboxId)

          for (const file of files) {
            await sandbox.files.write(file.path, file.content)
            updatedFiles[file.path] = file.content
            emit?.(makeEvent('file_updated', {
              data: {
                path: file.path,
                description: `Writing ${file.path}`,
              },
            }))
          }

          return updatedFiles
        } catch (err) {
          Sentry.captureException(err, { extra: { context: 'createOrUpdateFiles', sandboxId } })
          throw err
        }
      })

      if (newFiles && typeof newFiles === 'object' && network) {
        network.state.data.files = newFiles as Record<string, string>
      }
    },
  })

  const readFiles = createTool({
    name: 'readFiles',
    description: 'Read files from the sandbox',
    parameters: z.object({ files: z.array(z.string()) }),
    handler: async ({ files }, { step: toolStep }) => {
      return toolStep?.run('readFiles', async () => {
        try {
          const sandbox = await getSandbox(sandboxId)
          const contents: Array<{ path: string; content: string }> = []

          for (const file of files) {
            const content = await sandbox.files.read(file)
            contents.push({ path: file, content })
          }

          return JSON.stringify(contents)
        } catch (err) {
          Sentry.captureException(err, { extra: { context: 'readFiles', sandboxId } })
          throw err
        }
      })
    },
  })

  const listFiles = createTool({
    name: 'listFiles',
    description: 'List files and directories in the project. Use this to explore the codebase structure before reading or creating files. Always use this first if unsure whether a file or component already exists.',
    parameters: z.object({
      path:      z.string().optional().default('').describe('Relative path to list — e.g. "src/components". Leave empty for project root.'),
      recursive: z.boolean().optional().default(false).describe('List all files recursively. Use false (default) for a shallow overview.'),
      filter:    z.string().optional().describe('Optional filename filter — e.g. "*.tsx" or "*.ts"'),
    }),
    handler: async ({ path, recursive, filter }, { step: toolStep }) => {
      return toolStep?.run('listFiles', async () => {
        try {
          const sandbox    = await getSandbox(sandboxId)
          const basePath   = '/home/user'
          const targetPath = path
            ? `${basePath}/${path.replace(/^\/+/, '')}`
            : basePath

          let cmd = `find ${targetPath} -type f`
          cmd += ` ! -path '*/node_modules/*'`
          cmd += ` ! -path '*/.next/*'`
          cmd += ` ! -path '*/.git/*'`
          cmd += ` ! -path '*/dist/*'`
          cmd += ` ! -path '*/.cache/*'`
          cmd += ` ! -name '*.lock'`
          cmd += ` ! -name '*.ico'`
          cmd += ` ! -name '*.png'`
          cmd += ` ! -name '*.jpg'`
          cmd += ` ! -name '*.webp'`

          if (!recursive) cmd += ` -maxdepth 4`
          if (filter)     cmd += ` -name "${filter}"`

          cmd += ` | head -n 300 | sort`

          const result = await sandbox.commands.run(cmd, { timeoutMs: 10000 })
          const lines  = result.stdout
            .split('\n')
            .map((l: string) => l.trim())
            .filter(Boolean)

          if (lines.length === 0) {
            return `No files found in ${path || 'project root'}.`
          }

          // Group by directory for readability
          const grouped: Record<string, string[]> = {}
          for (const fullPath of lines) {
            const relative = fullPath.replace(`${basePath}/`, '')
            const parts    = relative.split('/')
            const fileName = parts.pop()!
            const dir      = parts.join('/') || '.'
            if (!grouped[dir]) grouped[dir] = []
            grouped[dir].push(fileName)
          }

          let output = `Found ${lines.length} file${lines.length !== 1 ? 's' : ''}:\n\n`
          for (const [dir, files] of Object.entries(grouped).sort()) {
            output += `${dir}/\n`
            for (const f of files.slice(0, 50)) output += `  - ${f}\n`
            if (files.length > 50) output += `  ... and ${files.length - 50} more\n`
          }

          return output
        } catch (err) {
          Sentry.captureException(err, {
            extra: { tool: 'listFiles', path, sandboxId },
          })
          return `Error listing files: ${err}`
        }
      })
    },
  })

  return { terminal, createOrUpdateFiles, readFiles, listFiles }
}
