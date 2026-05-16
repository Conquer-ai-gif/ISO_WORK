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
  terminal: any
  createOrUpdateFiles: any
  readFiles: any
  listFiles: any
}

export interface CreateToolsOptions {
  sandboxId: string
  allowedFiles?: string[]
  emit?: EventEmitterFn
  step?: any // Optional step context for durability
}

function describeCommand(command: string): string {
  const cmd = command.trim()
  const installMatch = cmd.match(/(?:npm|pnpm|yarn)\s+(?:install|add|i)\s+(.+?)(?:\s+--|$)/)
  if (installMatch) {
    return `Installing ${installMatch[1].trim().split(/\s+/).slice(0, 3).join(', ')}…`
  }
  const npxMatch = cmd.match(/npx\s+(\S+)/)
  if (npxMatch) return `Running ${npxMatch[1]}…`
  if (cmd.includes('prisma migrate')) return 'Running Prisma migration…'
  if (cmd.includes('prisma generate')) return 'Generating Prisma client…'
  if (cmd.includes('next build') || cmd.includes('tsc')) return 'Type-checking project…'
  return cmd.length > 60 ? cmd.slice(0, 57) + '…' : cmd
}

export function createTools({ sandboxId, allowedFiles, emit, step }: CreateToolsOptions): ToolSet {
  const terminal = createTool({
    name: 'terminal',
    description: 'Run a shell command in the sandbox',
    parameters: z.object({ command: z.string() }),
    handler: async ({ command }) => {
      const description = describeCommand(command)
      emit?.(makeEvent('task_started', { data: { description, type: 'terminal' } }))

      const executeCommand = async () => {
        const buffers = { stdout: '', stderr: '' }
        try {
          const sandbox = await getSandbox(sandboxId)
          const result = await sandbox.commands.run(command, {
            onStdout: (data: string) => { buffers.stdout += data },
            onStderr: (data: string) => { buffers.stderr += data },
            timeoutMs: 30000,
          })
          return result.stdout || '(no output)'
        } catch (err) {
          Sentry.captureException(err, {
            extra: { context: 'terminal tool', sandboxId, command: command.slice(0, 200) },
          })
          return `Command failed: ${err}\nstdout: ${buffers.stdout}\nstderr: ${buffers.stderr}`
        }
      }

      if (step) {
        return await step.run(`terminal-${Date.now()}`, executeCommand)
      }
      return executeCommand()
    },
  })

  const createOrUpdateFiles = createTool({
    name: 'createOrUpdateFiles',
    description: 'Create or update files in the sandbox',
    parameters: z.object({
      files: z.array(z.object({ path: z.string(), content: z.string() })),
    }),
    handler: async ({ files }, { network }: Tool.Options<AgentState>) => {
      const violatingFiles = allowedFiles ? files.filter(f => !allowedFiles.includes(f.path)) : []
      if (violatingFiles.length > 0) {
        const msg = `Scope violation: attempted to write disallowed files: ${violatingFiles.map(f => f.path).join(', ')}`
        Sentry.captureMessage(msg, { level: 'warning', extra: { sandboxId, allowedFiles } })
        const allowed = allowedFiles ? files.filter(f => allowedFiles.includes(f.path)) : files
        if (allowed.length === 0) return 'Blocked: no allowed files to write'
        files = allowed
      }

      const executeWrite = async () => {
        try {
          const updatedFiles: Record<string, string> = { ...(network?.state?.data?.files ?? {}) }
          const sandbox = await getSandbox(sandboxId)
          for (const file of files) {
            await sandbox.files.write(file.path, file.content)
            updatedFiles[file.path] = file.content
            emit?.(makeEvent('file_updated', { data: { path: file.path, description: `Writing ${file.path}` } }))
          }
          if (network) {
            network.state.data.files = updatedFiles as Record<string, string>
          }
          return `Wrote ${files.length} file${files.length !== 1 ? 's' : ''}`
        } catch (err) {
          Sentry.captureException(err, { extra: { context: 'createOrUpdateFiles', sandboxId } })
          throw err
        }
      }

      if (step) {
        return await step.run(`createOrUpdateFiles-${Date.now()}`, executeWrite)
      }
      return executeWrite()
    },
  })

  const readFiles = createTool({
    name: 'readFiles',
    description: 'Read files from the sandbox',
    parameters: z.object({ files: z.array(z.string()) }),
    handler: async ({ files }) => {
      const executeRead = async () => {
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
      }
      if (step) {
        return await step.run(`readFiles-${Date.now()}`, executeRead)
      }
      return executeRead()
    },
  })

  const listFiles = createTool({
    name: 'listFiles',
    description: 'List files and directories in the project. Use this to explore the codebase structure before reading or creating files.',
    parameters: z.object({
      path: z.string().optional().default('').describe('Relative path to list, e.g., "src/components"'),
      recursive: z.boolean().optional().default(false).describe('Whether to list recursively'),
      filter: z.string().optional().describe('Filename filter, e.g., "*.tsx"'),
    }),
    handler: async ({ path, recursive, filter }) => {
      const executeList = async () => {
        try {
          const sandbox = await getSandbox(sandboxId)
          const basePath = '/home/user'
          const targetPath = path ? `${basePath}/${path.replace(/^\/+/, '')}` : basePath
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
          if (!recursive) cmd += ' -maxdepth 4'
          if (filter) cmd += ` -name "${filter}"`
          cmd += ' | head -n 300 | sort'
          const result = await sandbox.commands.run(cmd, { timeoutMs: 10000 })
          const lines = result.stdout.split('\n').map(l => l.trim()).filter(Boolean)
          if (lines.length === 0) return `No files found in ${path || 'project root'}.`
          const grouped: Record<string, string[]> = {}
          for (const fullPath of lines) {
            const relative = fullPath.replace(`${basePath}/`, '')
            const parts = relative.split('/')
            const fileName = parts.pop()!
            const dir = parts.join('/') || '.'
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
          Sentry.captureException(err, { extra: { tool: 'listFiles', path, sandboxId } })
          return `Error listing files: ${err}`
        }
      }
      if (step) {
        return await step.run(`listFiles-${Date.now()}`, executeList)
      }
      return executeList()
    },
  })

  return { terminal, createOrUpdateFiles, readFiles, listFiles } as ToolSet
}





// import { createTool } from '@inngest/agent-kit'
// import * as Sentry from '@sentry/nextjs'
// import z from 'zod'
// import type { Tool } from '@inngest/agent-kit'
// import { getSandbox } from '@/sandbox/sandboxManager'
// import { makeEvent, type EventEmitterFn } from '@/streaming/events'

// // Exported state shape for agent consistency
// export interface AgentState {
//   summary: string
//   files: Record<string, string>
// }

// // ToolSet definition with proper type annotations
// export interface ToolSet {
//   terminal: ReturnType<typeof createTool>
//   createOrUpdateFiles: ReturnType<typeof createTool>
//   readFiles: ReturnType<typeof createTool>
//   listFiles: ReturnType<typeof createTool>
// }

// // Configuration for tool creation
// export interface CreateToolsOptions {
//   sandboxId: string
//   allowedFiles?: string[]
//   emit?: EventEmitterFn
//   step?: any // Optional Inngest step for durability
// }

// // Command description utility
// function describeCommand(command: string): string {
//   const cmd = command.trim()
//   // npm/pnpm/yarn install patterns
//   const installMatch = cmd.match(/(?:npm|pnpm|yarn)\s+(?:install|add|i)\s+(.+?)(?:\s+--|$)/)
//   if (installMatch) {
//     return `Installing ${installMatch[1].trim().split(/\s+/).slice(0, 3).join(', ')}…`
//   }
//   // npx command pattern
//   const npxMatch = cmd.match(/npx\s+(\S+)/)
//   if (npxMatch) return `Running ${npxMatch[1]}…`
//   // Prisma commands
//   if (cmd.includes('prisma migrate')) return 'Running Prisma migration…'
//   if (cmd.includes('prisma generate')) return 'Generating Prisma client…'
//   // Build/typecheck patterns
//   if (cmd.includes('next build') || cmd.includes('tsc')) return 'Type-checking project…'
//   // Fallback
//   return cmd.length > 60 ? cmd.slice(0, 57) + '…' : cmd
// }

// // Main tool factory
// export function createTools({ sandboxId, allowedFiles, emit, step }: CreateToolsOptions): ToolSet {
//   // Terminal tool for command execution
//   const terminal = createTool({
//     name: 'terminal',
//     description: 'Run a shell command in the sandbox',
//     parameters: z.object({ command: z.string() }),
//     handler: async ({ command }) => {
//       const description = describeCommand(command)
//       emit?.(makeEvent('task_started', { data: { description, type: 'terminal' } }))

//       const executeCommand = async () => {
//         const buffers = { stdout: '', stderr: '' }
//         try {
//           const sandbox = await getSandbox(sandboxId)
//           const result = await sandbox.commands.run(command, {
//             onStdout: (data: string) => { buffers.stdout += data },
//             onStderr: (data: string) => { buffers.stderr += data },
//           })
//           return result.stdout || '(no output)'
//         } catch (err) {
//           Sentry.captureException(err, {
//             extra: { context: 'terminal tool', sandboxId, command: command.slice(0, 200) },
//           })
//           return `Command failed: ${err}\nstdout: ${buffers.stdout}\nstderr: ${buffers.stderr}'
//         }
//       }

//       // Use Inngest step for durability if available
//       if (step) {
//         return await step.run(`terminal-${Date.now()}`, executeCommand)
//       }
//       return executeCommand()
//     },
//   })

//   // File manipulation tool
//   const createOrUpdateFiles = createTool({
//     name: 'createOrUpdateFiles',
//     description: 'Create or update files in the sandbox',
//     parameters: z.object({
//       files: z.array(z.object({ path: z.string(), content: z.string() })),
//     }),
//     handler: async ({ files }, { network }: Tool.Options<AgentState>) => {
//       // Validate file scope
//       const violatingFiles = allowedFiles
//         ? files.filter((f) => !allowedFiles.includes(f.path))
//         : []

//       if (violatingFiles.length > 0) {
//         const msg = `Scope violation: attempted to write disallowed files: ${violatingFiles.map((f) => f.path).join(', ')}`
//         Sentry.captureMessage(msg, { level: 'warning', extra: { sandboxId, allowedFiles } })
//         const allowed = allowedFiles
//           ? files.filter((f) => allowedFiles.includes(f.path))
//           : files
//         if (allowed.length === 0) return 'Blocked: no allowed files to write'
//         files = allowed
//       }

//       // Execute file writes
//       const executeWrite = async () => {
//         try {
//           const updatedFiles: Record<string, string> = {
//             ...(network?.state?.data?.files ?? {})
//           }
//           const sandbox = await getSandbox(sandboxId)

//           for (const file of files) {
//             await sandbox.files.write(file.path, file.content)
//             updatedFiles[file.path] = file.content
//             emit?.(makeEvent('file_updated', { data: { path: file.path, description: `Writing ${file.path}` } }))
//           }
//           if (network) {
//             network.state.data.files = updatedFiles as Record<string, string>
//           }
//           return `Wrote ${files.length} file${files.length !== 1 ? 's' : ''}`
//         } catch (err) {
//           Sentry.captureException(err, { extra: { context: 'createOrUpdateFiles', sandboxId } })
//           throw err
//         }
//       }

//       // Use Inngest step for durability if available
//       if (step) {
//         return await step.run(`createOrUpdateFiles-${Date.now()}`, executeWrite)
//       }
//       return executeWrite()
//     },
//   })

//   // File reading tool
//   const readFiles = createTool({
//     name: 'readFiles',
//     description: 'Read files from the sandbox',
//     parameters: z.object({ files: z.array(z.string()) }),
//     handler: async ({ files }) => {
//       const executeRead = async () => {
//         try {
//           const sandbox = await getSandbox(sandboxId)
//           const contents: Array<{ path: string; content: string }> = []
//           for (const file of files) {
//             const content = await sandbox.files.read(file)
//             contents.push({ path: file, content })
//           }
//           return JSON.stringify(contents)
//         } catch (err) {
//           Sentry.captureException(err, { extra: { context: 'readFiles', sandboxId } })
//           throw err
//         }
//       }

//       // Use Inngest step for durability if available
//       if (step) {
//         return await step.run(`readFiles-${Date.now()}`, executeRead)
//       }
//       return executeRead()
//     },
//   })

//   // File listing tool
//   const listFiles = createTool({
//     name: 'listFiles',
//     description: 'List files and directories in the project',
//     parameters: z.object({
//       path: z.string().optional().default('').describe('Relative path to list'),
//       recursive: z.boolean().optional().default(false).describe('Recursive listing'),
//       filter: z.string().optional().describe('Filename pattern filter')
//     }),
//     handler: async ({ path, recursive, filter }) => {
//       const executeList = async () => {
//         try {
//           const sandbox = await getSandbox(sandboxId)
//           const basePath = '/home/user'
//           const targetPath = path ? `${basePath}/${path.replace(/^\/+/, '')}` : basePath
//           let cmd = `find ${targetPath} -type f`
//           cmd += ` ! -path '*/node_modules/*'`
//           cmd += ` ! -path '*/.next/*'`
//           cmd += ` ! -path '*/.git/*'`
//           cmd += ` ! -path '*/dist/*'`
//           cmd += ` ! -path '*/.cache/*'`
//           cmd += ` ! -name '*.lock'`
//           cmd += ` ! -name '*.ico'`
//           cmd += ` ! -name '*.png'`
//           cmd += ` ! -name '*.jpg'`
//           cmd += ` ! -name '*.webp'`
//           if (!recursive) cmd += ' -maxdepth 4'
//           if (filter) cmd += ` -name "${filter}"`
//           cmd += ' | head -n 300 | sort'
//           const result = await sandbox.commands.run(cmd, { timeoutMs: 10000 })
//           const lines = result.stdout.split('\n').map(l => l.trim()).filter(Boolean)
//           if (lines.length === 0) return `No files found in ${path || 'project root'}.`
//           const grouped: Record<string, string[]> = {}
//           for (const fullPath of lines) {
//             const relative = fullPath.replace(`${basePath}/`, '')
//             const parts = relative.split('/')
//             const fileName = parts.pop()!
//             const dir = parts.join('/') || '.'
//             if (!grouped[dir]) grouped[dir] = []
//             grouped[dir].push(fileName)
//           }
//           let output = `Found ${lines.length} file${lines.length !== 1 ? 's' : ''}:
// \n`
//           for (const [dir, files] of Object.entries(grouped).sort()) {
//             output += `${dir}/\n`
//             for (const f of files.slice(0, 50)) output += `  - ${f}\n`
//             if (files.length > 50) output += `  ... and ${files.length - 50} more\n`
//           }
//           return output
//         } catch (err) {
//           Sentry.captureException(err, { extra: { tool: 'listFiles', path, sandboxId } })
//           return `Error listing files: ${err}`
//         }
//       }

//       // Use Inngest step for durability if available
//       if (step) {
//         return await step.run(`listFiles-${Date.now()}`, executeList)
//       }
//       return executeList()
//     },
//   })

//   // Return properly typed tool set
//   return { terminal, createOrUpdateFiles, readFiles, listFiles }

