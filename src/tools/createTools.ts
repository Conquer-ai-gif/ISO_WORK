/**
 * createTools.ts
 *
 * Defines the sandbox tools available to all code/fix agents.
 *
 * ── WHY step IS REMOVED FROM TOOLS ───────────────────────────────────────────
 * Previously, each tool handler wrapped its sandbox call in step.run() hoping
 * to get Inngest durability per-tool-call. This caused the following chain:
 *
 *   Inngest handler (AsyncLocalStorage context set ✅)
 *     → network.run()
 *       → agent inference
 *         → tool handler fires
 *           → step.run() ← creates a NEW nested async context ❌
 *             → next agent inference call
 *               → getAsyncCtx() returns undefined ← CRASH
 *                 "TypeError: Cannot read properties of undefined (reading 'step')"
 *
 * agent-kit reads `step` via Node's AsyncLocalStorage (getAsyncCtx from
 * "inngest/experimental"). Calling step.run() inside a tool handler creates a
 * nested async context that shadows the original, so getAsyncCtx() returns
 * undefined on every subsequent inference call — causing tools to run forever
 * or crash on the next LLM call.
 *
 * The fix: remove step.run() from all tool handlers. Sandbox calls are fast
 * enough that per-call durability is not needed. Inngest-level durability
 * (retry on crash) still applies at the function level.
 * ─────────────────────────────────────────────────────────────────────────────
 */

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
  // NOTE: `step` intentionally removed — see module docblock above.
  // Passing step into tools and calling step.run() inside a tool handler
  // breaks agent-kit's AsyncLocalStorage context, causing infinite loops
  // and "Cannot read properties of undefined (reading 'step')" crashes.
}

/**
 * Returns a human-readable description of a shell command for the UI event stream.
 * Used to show the user what the agent is doing in real time.
 */
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

/** Matches agent-kit safeParseOpenAIJson — free models embed backticks in tool args. */
function safeParseToolJson(str: string): unknown {
  const trimmed = str.replace(/^["']|["']$/g, '')
  try {
    return JSON.parse(trimmed)
  } catch {
    const withQuotes = trimmed.replace(
      /`([\s\S]*?)`/g,
      (_, content: string) => JSON.stringify(content),
    )
    return JSON.parse(withQuotes)
  }
}

/** Peel nested JSON string wrappers: "\"[{...}]\"" → "[{...}]" */
function peelJsonStringLayers(s: string, max = 3): string {
  let out = s.trim()
  for (let i = 0; i < max; i++) {
    if (
      (out.startsWith('"') && out.endsWith('"')) ||
      (out.startsWith("'") && out.endsWith("'"))
    ) {
      try {
        const inner = JSON.parse(out)
        if (typeof inner === 'string') {
          out = inner
          continue
        }
      } catch {
        break
      }
    }
    break
  }
  return out
}

function unescapeLiteralBackslashes(s: string): string {
  if (!s.includes('\\"')) return s
  return s
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
}

function normalizeFilesArgString(raw: string): string {
  return unescapeLiteralBackslashes(peelJsonStringLayers(raw))
}

function extractBacktickContent(
  normalized: string,
  contentStart: number,
): string | null {
  for (let i = contentStart; i < normalized.length; i++) {
    if (normalized[i] !== '`') continue
    const after = normalized.slice(i + 1).trimStart()
    if (
      after.startsWith('}') ||
      after.startsWith(']') ||
      after.startsWith('},') ||
      after.startsWith('}]')
    ) {
      return normalized.slice(contentStart, i)
    }
  }
  // Last backtick before array/object close (handles nested JSX template literals).
  const tail = normalized.slice(contentStart)
  const closeMatch = tail.match(/^([\s\S]*?)`\s*\}\s*\]?\s*$/)
  if (closeMatch) return closeMatch[1]
  const closeBacktick = tail.lastIndexOf('`')
  return closeBacktick > 0 ? tail.slice(0, closeBacktick) : null
}

/** Malformed `"content": "..."` where inner TSX quotes break JSON.parse — anchor from the end. */
function extractDoubleQuotedContentBroken(normalized: string): string | null {
  const marker = normalized.match(/"content"\s*:\s*"/)
  if (!marker) return null
  const start = marker.index! + marker[0].length
  const endIdx = normalized.lastIndexOf('"}]')
  const endAlt = normalized.lastIndexOf('"}')
  const end = endIdx > start ? endIdx : endAlt > start ? endAlt : -1
  if (end <= start) return null
  return unescapeLiteralBackslashes(normalized.slice(start, end))
}

function tryAllowedFilesFallback(
  raw: string,
  allowedFiles?: string[],
): Array<{ path: string; content: string }> | null {
  if (!allowedFiles?.length) return null
  const normalized = normalizeFilesArgString(raw)

  let path = allowedFiles[0]
  const pathMatch = normalized.match(/"path"\s*:\s*"((?:[^"\\]|\\.)*)"/)
  if (pathMatch) {
    const parsedPath = pathMatch[1].replace(/\\"/g, '"')
    if (allowedFiles.includes(parsedPath)) path = parsedPath
  }

  const contentMarker = normalized.match(/,?\s*"?content"?\s*:\s*(["`])/)
  if (contentMarker) {
    const quote = contentMarker[1]
    const contentStart =
      contentMarker.index! + contentMarker[0].length
    const content =
      quote === '`'
        ? extractBacktickContent(normalized, contentStart)
        : extractDoubleQuotedContentBroken(normalized)
    if (content && content.length > 0) {
      return [{ path, content }]
    }
  }

  const bareContent = extractDoubleQuotedContentBroken(normalized)
  if (bareContent && bareContent.length > 0) {
    return [{ path, content: bareContent }]
  }

  return null
}

function isFileEntry(v: unknown): v is { path: string; content: string } {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as { path?: unknown }).path === 'string' &&
    typeof (v as { content?: unknown }).content === 'string'
  )
}

/**
 * Fallback when JSON.parse fails — Poolside/laguna models emit:
 *   [{"path":"app/page.tsx","content": `"use client"; ... JSX with "quotes" ...`}]
 */
function extractFilesFromMalformedString(
  raw: string,
): Array<{ path: string; content: string }> {
  const normalized = normalizeFilesArgString(raw)
  const files: Array<{ path: string; content: string }> = []

  const pathRes = [
    /"path"\s*:\s*"((?:[^"\\]|\\.)*)"/g,
    /\bpath\b\s*:\s*"((?:[^"\\]|\\.)*)"/g,
    /"path"\s*:\s*'([^']*)'/g,
  ]

  for (const pathRe of pathRes) {
    for (const pm of normalized.matchAll(pathRe)) {
      const path = pm[1].replace(/\\"/g, '"')
      const afterPath = normalized.slice(pm.index! + pm[0].length)
      const contentMatch = afterPath.match(/,?\s*"?content"?\s*:\s*(["`])/)
      if (!contentMatch) continue

      const quote = contentMatch[1]
      const contentStart =
        pm.index! + pm[0].length + contentMatch.index! + contentMatch[0].length

      if (quote === '`') {
        const content = extractBacktickContent(normalized, contentStart)
        if (content) files.push({ path, content })
      } else {
        const content =
          extractDoubleQuotedContentBroken(normalized) ??
          (() => {
            let i = contentStart + 1
            let out = ''
            while (i < normalized.length) {
              const ch = normalized[i]
              if (ch === '\\' && i + 1 < normalized.length) {
                out += normalized[i + 1]
                i += 2
                continue
              }
              if (ch === '"') break
              out += ch
              i++
            }
            return out.length > 0 ? out : null
          })()
        if (content) files.push({ path, content })
      }
    }
    if (files.length > 0) return files
  }

  // Single object without array wrapper: {"path":"...","content":`...`}
  const singleObj = normalized.match(/^\s*\{/)
  if (singleObj) {
    const extracted = extractFilesFromMalformedString(`[${normalized}]`)
    if (extracted.length > 0) return extracted
  }

  throw new Error('Could not extract files from malformed argument string')
}

/** Free models often send `files` as a JSON string instead of an array. */
function coerceFilesArg(
  raw: unknown,
): Array<{ path: string; content: string }> {
  if (Array.isArray(raw)) {
    return raw.filter(isFileEntry)
  }
  if (isFileEntry(raw)) {
    return [raw]
  }
  if (typeof raw === 'string') {
    const normalized = normalizeFilesArgString(raw)
    try {
      const parsed = safeParseToolJson(normalized)
      if (Array.isArray(parsed)) {
        const entries = parsed.filter(isFileEntry)
        if (entries.length > 0) return entries
      } else if (typeof parsed === 'string') {
        return coerceFilesArg(parsed)
      } else if (isFileEntry(parsed)) {
        return [parsed]
      }
    } catch {
      // fall through to regex extraction
    }
    return extractFilesFromMalformedString(normalized)
  }
  if (raw && typeof raw === 'object' && 'files' in raw) {
    return coerceFilesArg((raw as { files: unknown }).files)
  }
  throw new Error(`Invalid files argument: expected array, got ${typeof raw}`)
}

/**
 * Creates the four sandbox tools (terminal, createOrUpdateFiles, readFiles, listFiles)
 * bound to a specific sandbox session and optional file scope.
 *
 * All tool handlers call the sandbox directly — no step.run() wrappers.
 * See module docblock for why step was removed.
 */
export function createTools({ sandboxId, allowedFiles, emit }: CreateToolsOptions): ToolSet {

  // ── terminal ───────────────────────────────────────────────────────────────
  // Runs a shell command in the E2B sandbox. Streams stdout/stderr into buffers
  // and returns the combined output. Emits a task_started event for the UI.
  const terminal = createTool({
    name: 'terminal',
    description: 'Run a shell command in the sandbox',
    parameters: z.object({ command: z.string() }),
    handler: async ({ command }) => {
      const description = describeCommand(command)
      emit?.(makeEvent('task_started', { data: { description, type: 'terminal' } }))

      const buffers = { stdout: '', stderr: '' }
      try {
        const sandbox = await getSandbox(sandboxId)
        const result  = await sandbox.commands.run(command, {
          onStdout:  (data: string) => { buffers.stdout += data },
          onStderr:  (data: string) => { buffers.stderr += data },
          timeoutMs: 30_000, // 30s hard cap — prevents the tool from hanging forever
        })
        return result.stdout || '(no output)'
      } catch (err) {
        Sentry.captureException(err, {
          extra: { context: 'terminal tool', sandboxId, command: command.slice(0, 200) },
        })
        return `Command failed: ${err}\nstdout: ${buffers.stdout}\nstderr: ${buffers.stderr}`
      }
    },
  })

  // ── createOrUpdateFiles ────────────────────────────────────────────────────
  // Writes one or more files into the sandbox filesystem. Enforces the
  // allowedFiles scope — any attempt to write outside scope is blocked and
  // logged. Updates network state so subsequent tool calls see the new files.
  //
  // IMPORTANT: This tool sets network.state.data.summary on success. That
  // summary flag is the signal the router in codeAgent.ts reads to stop the
  // network immediately — before agent-kit can dispatch the automatic
  // post-tool model call that would otherwise cause the run to hang forever.
  const createOrUpdateFiles = createTool({
    name: 'createOrUpdateFiles',
    description: 'Create or update files in the sandbox',
    parameters: z.object({
      files: z.union([
        z.array(z.object({ path: z.string(), content: z.string() })),
        z.string(),
      ]),
    }),
    handler: async ({ files: rawFiles }, { network }: Tool.Options<AgentState>) => {
      let files: Array<{ path: string; content: string }>
      try {
        files = coerceFilesArg(rawFiles)
      } catch (err) {
        const fallback =
          typeof rawFiles === 'string'
            ? tryAllowedFilesFallback(rawFiles, allowedFiles)
            : null
        if (fallback) {
          files = fallback
        } else if (
          typeof rawFiles === 'string' &&
          allowedFiles?.length === 1 &&
          !rawFiles.includes('"path"') &&
          !rawFiles.trimStart().startsWith('[')
        ) {
          files = [{ path: allowedFiles[0], content: rawFiles }]
        } else {
          // Do not set summary on malformed args — let the router continue so
          // the model can retry with a corrected tool call in the next turn.
          return `Invalid files argument: ${err instanceof Error ? err.message : String(err)}`
        }
      }
      if (files.length === 0) {
        return 'Invalid files argument: no writable file entries'
      }
      // Scope enforcement — block writes to files outside the task's allowed list
      const violatingFiles = allowedFiles ? files.filter(f => !allowedFiles.includes(f.path)) : []
      if (violatingFiles.length > 0) {
        const msg = `Scope violation: attempted to write disallowed files: ${violatingFiles.map(f => f.path).join(', ')}`
        Sentry.captureMessage(msg, { level: 'warning', extra: { sandboxId, allowedFiles } })
        const allowed = allowedFiles ? files.filter(f => allowedFiles.includes(f.path)) : files
        if (allowed.length === 0) return 'Blocked: no allowed files to write'
        files = allowed
      }

      try {
        // Merge into existing network state so all tools share the same file map
        const updatedFiles: Record<string, string> = { ...(network?.state?.data?.files ?? {}) }
        const sandbox = await getSandbox(sandboxId)

        for (const file of files) {
          const fullPath = file.path.startsWith('/') ? file.path : `/home/user/${file.path}`
          await sandbox.files.write(fullPath, file.content)
          updatedFiles[file.path] = file.content
          emit?.(makeEvent('file_updated', { data: { path: file.path, description: `Writing ${file.path}` } }))
        }

        // Persist the updated file map into network state for downstream tools
        if (network) {
          network.state.data.files = updatedFiles as Record<string, string>
          // Setting summary here stops the router after file writing completes,
          // preventing a second model call which the free model would use to
          // call createOrUpdateFiles again in an infinite loop.
          if (!network.state.data.summary) {
            network.state.data.summary = `Wrote ${files.length} file${files.length !== 1 ? 's' : ''}`
          }
        }
        return `Wrote ${files.length} file${files.length !== 1 ? 's' : ''}`
        // // Persist the updated file map into network state for downstream tools
        // if (network) {
        //   network.state.data.files = updatedFiles as Record<string, string>
        // }
        // return `Wrote ${files.length} file${files.length !== 1 ? 's' : ''}`
      } catch (err) {
        if (network && !network.state.data.summary) {
          network.state.data.summary = `createOrUpdateFiles failed: ${err instanceof Error ? err.message : String(err)}`
        }
        Sentry.captureException(err, { extra: { context: 'createOrUpdateFiles', sandboxId } })
        throw err
      }
    },
  })

  // ── readFiles ──────────────────────────────────────────────────────────────
  // Reads one or more files from the sandbox filesystem and returns their
  // contents as a JSON array. The agent uses this to inspect existing code
  // before making changes.
  const readFiles = createTool({
    name: 'readFiles',
    description: 'Read files from the sandbox',
    parameters: z.object({ files: z.array(z.string()) }),
    handler: async ({ files }) => {
      try {
        const sandbox  = await getSandbox(sandboxId)
        const contents: Array<{ path: string; content: string }> = []
        for (const file of files) {
          const fullPath = file.startsWith('/') ? file : `/home/user/${file}`
          const content = await sandbox.files.read(fullPath)
          contents.push({ path: file, content })
        }
        return JSON.stringify(contents)
      } catch (err) {
        Sentry.captureException(err, { extra: { context: 'readFiles', sandboxId } })
        throw err
      }
    },
  })

  // ── listFiles ──────────────────────────────────────────────────────────────
  // Lists files in the sandbox using `find`, grouped by directory.
  // Excludes node_modules, .next, .git, dist, and common binary/lock files.
  // The agent uses this to verify a file exists before reading it.
  const listFiles = createTool({
    name: 'listFiles',
    description: 'List files and directories in the project. Use this to explore the codebase structure before reading or creating files.',
    parameters: z.object({
      path:      z.string().optional().default('').describe('Relative path to list, e.g., "src/components"'),
      recursive: z.boolean().optional().default(false).describe('Whether to list recursively'),
      filter:    z.string().optional().describe('Filename filter, e.g., "*.tsx"'),
    }),
    handler: async ({ path, recursive, filter }) => {
      try {
        const sandbox    = await getSandbox(sandboxId)
        const basePath   = '/home/user'
        const targetPath = path ? `${basePath}/${path.replace(/^\/+/, '')}` : basePath

        // Build a find command that excludes noisy directories and binary files
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

        const result = await sandbox.commands.run(cmd, { timeoutMs: 10_000 })
        const lines  = result.stdout.split('\n').map(l => l.trim()).filter(Boolean)
        if (lines.length === 0) return `No files found in ${path || 'project root'}.`

        // Group by directory for a readable tree-like output
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
        Sentry.captureException(err, { extra: { tool: 'listFiles', path, sandboxId } })
        return `Error listing files: ${err}`
      }
    },
  })

  return { terminal, createOrUpdateFiles, readFiles, listFiles } as ToolSet
}

// /**
//  * createTools.ts
//  *
//  * Defines the sandbox tools available to all code/fix agents.
//  *
//  * ── WHY step IS REMOVED FROM TOOLS ───────────────────────────────────────────
//  * Previously, each tool handler wrapped its sandbox call in step.run() hoping
//  * to get Inngest durability per-tool-call. This caused the following chain:
//  *
//  *   Inngest handler (AsyncLocalStorage context set ✅)
//  *     → network.run()
//  *       → agent inference
//  *         → tool handler fires
//  *           → step.run() ← creates a NEW nested async context ❌
//  *             → next agent inference call
//  *               → getAsyncCtx() returns undefined ← CRASH
//  *                 "TypeError: Cannot read properties of undefined (reading 'step')"
//  *
//  * agent-kit reads `step` via Node's AsyncLocalStorage (getAsyncCtx from
//  * "inngest/experimental"). Calling step.run() inside a tool handler creates a
//  * nested async context that shadows the original, so getAsyncCtx() returns
//  * undefined on every subsequent inference call — causing tools to run forever
//  * or crash on the next LLM call.
//  *
//  * The fix: remove step.run() from all tool handlers. Sandbox calls are fast
//  * enough that per-call durability is not needed. Inngest-level durability
//  * (retry on crash) still applies at the function level.
//  * ─────────────────────────────────────────────────────────────────────────────
//  */

// import { createTool } from '@inngest/agent-kit'
// import * as Sentry from '@sentry/nextjs'
// import z from 'zod'
// import type { Tool } from '@inngest/agent-kit'
// import { getSandbox } from '@/sandbox/sandboxManager'
// import { makeEvent, type EventEmitterFn } from '@/streaming/events'

// export interface AgentState {
//   summary: string
//   files: Record<string, string>
// }

// export interface ToolSet {
//   terminal: any
//   createOrUpdateFiles: any
//   readFiles: any
//   listFiles: any
// }

// export interface CreateToolsOptions {
//   sandboxId: string
//   allowedFiles?: string[]
//   emit?: EventEmitterFn
//   // NOTE: `step` intentionally removed — see module docblock above.
//   // Passing step into tools and calling step.run() inside a tool handler
//   // breaks agent-kit's AsyncLocalStorage context, causing infinite loops
//   // and "Cannot read properties of undefined (reading 'step')" crashes.
// }

// /**
//  * Returns a human-readable description of a shell command for the UI event stream.
//  * Used to show the user what the agent is doing in real time.
//  */
// function describeCommand(command: string): string {
//   const cmd = command.trim()
//   const installMatch = cmd.match(/(?:npm|pnpm|yarn)\s+(?:install|add|i)\s+(.+?)(?:\s+--|$)/)
//   if (installMatch) {
//     return `Installing ${installMatch[1].trim().split(/\s+/).slice(0, 3).join(', ')}…`
//   }
//   const npxMatch = cmd.match(/npx\s+(\S+)/)
//   if (npxMatch) return `Running ${npxMatch[1]}…`
//   if (cmd.includes('prisma migrate')) return 'Running Prisma migration…'
//   if (cmd.includes('prisma generate')) return 'Generating Prisma client…'
//   if (cmd.includes('next build') || cmd.includes('tsc')) return 'Type-checking project…'
//   return cmd.length > 60 ? cmd.slice(0, 57) + '…' : cmd
// }

// /**
//  * Creates the four sandbox tools (terminal, createOrUpdateFiles, readFiles, listFiles)
//  * bound to a specific sandbox session and optional file scope.
//  *
//  * All tool handlers call the sandbox directly — no step.run() wrappers.
//  * See module docblock for why step was removed.
//  */
// export function createTools({ sandboxId, allowedFiles, emit }: CreateToolsOptions): ToolSet {

//   // ── terminal ───────────────────────────────────────────────────────────────
//   // Runs a shell command in the E2B sandbox. Streams stdout/stderr into buffers
//   // and returns the combined output. Emits a task_started event for the UI.
//   const terminal = createTool({
//     name: 'terminal',
//     description: 'Run a shell command in the sandbox',
//     parameters: z.object({ command: z.string() }),
//     handler: async ({ command }) => {
//       const description = describeCommand(command)
//       emit?.(makeEvent('task_started', { data: { description, type: 'terminal' } }))

//       const buffers = { stdout: '', stderr: '' }
//       try {
//         const sandbox = await getSandbox(sandboxId)
//         const result  = await sandbox.commands.run(command, {
//           onStdout:  (data: string) => { buffers.stdout += data },
//           onStderr:  (data: string) => { buffers.stderr += data },
//           timeoutMs: 30_000, // 30s hard cap — prevents the tool from hanging forever
//         })
//         return result.stdout || '(no output)'
//       } catch (err) {
//         Sentry.captureException(err, {
//           extra: { context: 'terminal tool', sandboxId, command: command.slice(0, 200) },
//         })
//         return `Command failed: ${err}\nstdout: ${buffers.stdout}\nstderr: ${buffers.stderr}`
//       }
//     },
//   })

//   // ── createOrUpdateFiles ────────────────────────────────────────────────────
//   // Writes one or more files into the sandbox filesystem. Enforces the
//   // allowedFiles scope — any attempt to write outside scope is blocked and
//   // logged. Updates network state so subsequent tool calls see the new files.
//   const createOrUpdateFiles = createTool({
//     name: 'createOrUpdateFiles',
//     description: 'Create or update files in the sandbox',
//     parameters: z.object({
//       files: z.array(z.object({ path: z.string(), content: z.string() })),
//     }),
//     handler: async ({ files }, { network }: Tool.Options<AgentState>) => {
//       // Scope enforcement — block writes to files outside the task's allowed list
//       const violatingFiles = allowedFiles ? files.filter(f => !allowedFiles.includes(f.path)) : []
//       if (violatingFiles.length > 0) {
//         const msg = `Scope violation: attempted to write disallowed files: ${violatingFiles.map(f => f.path).join(', ')}`
//         Sentry.captureMessage(msg, { level: 'warning', extra: { sandboxId, allowedFiles } })
//         const allowed = allowedFiles ? files.filter(f => allowedFiles.includes(f.path)) : files
//         if (allowed.length === 0) return 'Blocked: no allowed files to write'
//         files = allowed
//       }

//       try {
//         // Merge into existing network state so all tools share the same file map
//         const updatedFiles: Record<string, string> = { ...(network?.state?.data?.files ?? {}) }
//         const sandbox = await getSandbox(sandboxId)

//         for (const file of files) {
//           await sandbox.files.write(file.path, file.content)
//           updatedFiles[file.path] = file.content
//           emit?.(makeEvent('file_updated', { data: { path: file.path, description: `Writing ${file.path}` } }))
//         }

//           // Persist the updated file map into network state for downstream tools
//         if (network) {
//           network.state.data.files = updatedFiles as Record<string, string>
//           // Setting summary here stops the router after file writing completes,
//           // preventing a second model call which the free model would use to
//           // call createOrUpdateFiles again in an infinite loop.
//           if (!network.state.data.summary) {
//             network.state.data.summary = `Wrote ${files.length} file${files.length !== 1 ? 's' : ''}`
//           }
//         }
//         return `Wrote ${files.length} file${files.length !== 1 ? 's' : ''}`
//         // // Persist the updated file map into network state for downstream tools
//         // if (network) {
//         //   network.state.data.files = updatedFiles as Record<string, string>
//         // }
//         // return `Wrote ${files.length} file${files.length !== 1 ? 's' : ''}`
//       } catch (err) {
//         Sentry.captureException(err, { extra: { context: 'createOrUpdateFiles', sandboxId } })
//         throw err
//       }
//     },
//   })

//   // ── readFiles ──────────────────────────────────────────────────────────────
//   // Reads one or more files from the sandbox filesystem and returns their
//   // contents as a JSON array. The agent uses this to inspect existing code
//   // before making changes.
//   const readFiles = createTool({
//     name: 'readFiles',
//     description: 'Read files from the sandbox',
//     parameters: z.object({ files: z.array(z.string()) }),
//     handler: async ({ files }) => {
//       try {
//         const sandbox  = await getSandbox(sandboxId)
//         const contents: Array<{ path: string; content: string }> = []
//         for (const file of files) {
//           const content = await sandbox.files.read(file)
//           contents.push({ path: file, content })
//         }
//         return JSON.stringify(contents)
//       } catch (err) {
//         Sentry.captureException(err, { extra: { context: 'readFiles', sandboxId } })
//         throw err
//       }
//     },
//   })

//   // ── listFiles ──────────────────────────────────────────────────────────────
//   // Lists files in the sandbox using `find`, grouped by directory.
//   // Excludes node_modules, .next, .git, dist, and common binary/lock files.
//   // The agent uses this to verify a file exists before reading it.
//   const listFiles = createTool({
//     name: 'listFiles',
//     description: 'List files and directories in the project. Use this to explore the codebase structure before reading or creating files.',
//     parameters: z.object({
//       path:      z.string().optional().default('').describe('Relative path to list, e.g., "src/components"'),
//       recursive: z.boolean().optional().default(false).describe('Whether to list recursively'),
//       filter:    z.string().optional().describe('Filename filter, e.g., "*.tsx"'),
//     }),
//     handler: async ({ path, recursive, filter }) => {
//       try {
//         const sandbox    = await getSandbox(sandboxId)
//         const basePath   = '/home/user'
//         const targetPath = path ? `${basePath}/${path.replace(/^\/+/, '')}` : basePath

//         // Build a find command that excludes noisy directories and binary files
//         let cmd = `find ${targetPath} -type f`
//         cmd += ` ! -path '*/node_modules/*'`
//         cmd += ` ! -path '*/.next/*'`
//         cmd += ` ! -path '*/.git/*'`
//         cmd += ` ! -path '*/dist/*'`
//         cmd += ` ! -path '*/.cache/*'`
//         cmd += ` ! -name '*.lock'`
//         cmd += ` ! -name '*.ico'`
//         cmd += ` ! -name '*.png'`
//         cmd += ` ! -name '*.jpg'`
//         cmd += ` ! -name '*.webp'`
//         if (!recursive) cmd += ' -maxdepth 4'
//         if (filter) cmd += ` -name "${filter}"`
//         cmd += ' | head -n 300 | sort'

//         const result = await sandbox.commands.run(cmd, { timeoutMs: 10_000 })
//         const lines  = result.stdout.split('\n').map(l => l.trim()).filter(Boolean)
//         if (lines.length === 0) return `No files found in ${path || 'project root'}.`

//         // Group by directory for a readable tree-like output
//         const grouped: Record<string, string[]> = {}
//         for (const fullPath of lines) {
//           const relative = fullPath.replace(`${basePath}/`, '')
//           const parts    = relative.split('/')
//           const fileName = parts.pop()!
//           const dir      = parts.join('/') || '.'
//           if (!grouped[dir]) grouped[dir] = []
//           grouped[dir].push(fileName)
//         }

//         let output = `Found ${lines.length} file${lines.length !== 1 ? 's' : ''}:\n\n`
//         for (const [dir, files] of Object.entries(grouped).sort()) {
//           output += `${dir}/\n`
//           for (const f of files.slice(0, 50)) output += `  - ${f}\n`
//           if (files.length > 50) output += `  ... and ${files.length - 50} more\n`
//         }
//         return output
//       } catch (err) {
//         Sentry.captureException(err, { extra: { tool: 'listFiles', path, sandboxId } })
//         return `Error listing files: ${err}`
//       }
//     },
//   })

//   return { terminal, createOrUpdateFiles, readFiles, listFiles } as ToolSet
// }



// // import { createTool } from '@inngest/agent-kit'
// // import * as Sentry from '@sentry/nextjs'
// // import z from 'zod'
// // import type { Tool } from '@inngest/agent-kit'
// // import { getSandbox } from '@/sandbox/sandboxManager'
// // import { makeEvent, type EventEmitterFn } from '@/streaming/events'

// // export interface AgentState {
// //   summary: string
// //   files: Record<string, string>
// // }

// // export interface ToolSet {
// //   terminal: any
// //   createOrUpdateFiles: any
// //   readFiles: any
// //   listFiles: any
// // }

// // export interface CreateToolsOptions {
// //   sandboxId: string
// //   allowedFiles?: string[]
// //   emit?: EventEmitterFn
// //   step?: any // Optional step context for durability
// // }

// // function describeCommand(command: string): string {
// //   const cmd = command.trim()
// //   const installMatch = cmd.match(/(?:npm|pnpm|yarn)\s+(?:install|add|i)\s+(.+?)(?:\s+--|$)/)
// //   if (installMatch) {
// //     return `Installing ${installMatch[1].trim().split(/\s+/).slice(0, 3).join(', ')}…`
// //   }
// //   const npxMatch = cmd.match(/npx\s+(\S+)/)
// //   if (npxMatch) return `Running ${npxMatch[1]}…`
// //   if (cmd.includes('prisma migrate')) return 'Running Prisma migration…'
// //   if (cmd.includes('prisma generate')) return 'Generating Prisma client…'
// //   if (cmd.includes('next build') || cmd.includes('tsc')) return 'Type-checking project…'
// //   return cmd.length > 60 ? cmd.slice(0, 57) + '…' : cmd
// // }

// // export function createTools({ sandboxId, allowedFiles, emit, step }: CreateToolsOptions): ToolSet {
// //   const terminal = createTool({
// //     name: 'terminal',
// //     description: 'Run a shell command in the sandbox',
// //     parameters: z.object({ command: z.string() }),
// //     handler: async ({ command }) => {
// //       const description = describeCommand(command)
// //       emit?.(makeEvent('task_started', { data: { description, type: 'terminal' } }))

// //       const executeCommand = async () => {
// //         const buffers = { stdout: '', stderr: '' }
// //         try {
// //           const sandbox = await getSandbox(sandboxId)
// //           const result = await sandbox.commands.run(command, {
// //             onStdout: (data: string) => { buffers.stdout += data },
// //             onStderr: (data: string) => { buffers.stderr += data },
// //             timeoutMs: 30000,
// //           })
// //           return result.stdout || '(no output)'
// //         } catch (err) {
// //           Sentry.captureException(err, {
// //             extra: { context: 'terminal tool', sandboxId, command: command.slice(0, 200) },
// //           })
// //           return `Command failed: ${err}\nstdout: ${buffers.stdout}\nstderr: ${buffers.stderr}`
// //         }
// //       }

// //       if (step) {
// //         return await step.run(`terminal-${Date.now()}`, executeCommand)
// //       }
// //       return executeCommand()
// //     },
// //   })

// //   const createOrUpdateFiles = createTool({
// //     name: 'createOrUpdateFiles',
// //     description: 'Create or update files in the sandbox',
// //     parameters: z.object({
// //       files: z.array(z.object({ path: z.string(), content: z.string() })),
// //     }),
// //     handler: async ({ files }, { network }: Tool.Options<AgentState>) => {
// //       const violatingFiles = allowedFiles ? files.filter(f => !allowedFiles.includes(f.path)) : []
// //       if (violatingFiles.length > 0) {
// //         const msg = `Scope violation: attempted to write disallowed files: ${violatingFiles.map(f => f.path).join(', ')}`
// //         Sentry.captureMessage(msg, { level: 'warning', extra: { sandboxId, allowedFiles } })
// //         const allowed = allowedFiles ? files.filter(f => allowedFiles.includes(f.path)) : files
// //         if (allowed.length === 0) return 'Blocked: no allowed files to write'
// //         files = allowed
// //       }

// //       const executeWrite = async () => {
// //         try {
// //           const updatedFiles: Record<string, string> = { ...(network?.state?.data?.files ?? {}) }
// //           const sandbox = await getSandbox(sandboxId)
// //           for (const file of files) {
// //             await sandbox.files.write(file.path, file.content)
// //             updatedFiles[file.path] = file.content
// //             emit?.(makeEvent('file_updated', { data: { path: file.path, description: `Writing ${file.path}` } }))
// //           }
// //           if (network) {
// //             network.state.data.files = updatedFiles as Record<string, string>
// //           }
// //           return `Wrote ${files.length} file${files.length !== 1 ? 's' : ''}`
// //         } catch (err) {
// //           Sentry.captureException(err, { extra: { context: 'createOrUpdateFiles', sandboxId } })
// //           throw err
// //         }
// //       }

// //       if (step) {
// //         return await step.run(`createOrUpdateFiles-${Date.now()}`, executeWrite)
// //       }
// //       return executeWrite()
// //     },
// //   })

// //   const readFiles = createTool({
// //     name: 'readFiles',
// //     description: 'Read files from the sandbox',
// //     parameters: z.object({ files: z.array(z.string()) }),
// //     handler: async ({ files }) => {
// //       const executeRead = async () => {
// //         try {
// //           const sandbox = await getSandbox(sandboxId)
// //           const contents: Array<{ path: string; content: string }> = []
// //           for (const file of files) {
// //             const content = await sandbox.files.read(file)
// //             contents.push({ path: file, content })
// //           }
// //           return JSON.stringify(contents)
// //         } catch (err) {
// //           Sentry.captureException(err, { extra: { context: 'readFiles', sandboxId } })
// //           throw err
// //         }
// //       }
// //       if (step) {
// //         return await step.run(`readFiles-${Date.now()}`, executeRead)
// //       }
// //       return executeRead()
// //     },
// //   })

// //   const listFiles = createTool({
// //     name: 'listFiles',
// //     description: 'List files and directories in the project. Use this to explore the codebase structure before reading or creating files.',
// //     parameters: z.object({
// //       path: z.string().optional().default('').describe('Relative path to list, e.g., "src/components"'),
// //       recursive: z.boolean().optional().default(false).describe('Whether to list recursively'),
// //       filter: z.string().optional().describe('Filename filter, e.g., "*.tsx"'),
// //     }),
// //     handler: async ({ path, recursive, filter }) => {
// //       const executeList = async () => {
// //         try {
// //           const sandbox = await getSandbox(sandboxId)
// //           const basePath = '/home/user'
// //           const targetPath = path ? `${basePath}/${path.replace(/^\/+/, '')}` : basePath
// //           let cmd = `find ${targetPath} -type f`
// //           cmd += ` ! -path '*/node_modules/*'`
// //           cmd += ` ! -path '*/.next/*'`
// //           cmd += ` ! -path '*/.git/*'`
// //           cmd += ` ! -path '*/dist/*'`
// //           cmd += ` ! -path '*/.cache/*'`
// //           cmd += ` ! -name '*.lock'`
// //           cmd += ` ! -name '*.ico'`
// //           cmd += ` ! -name '*.png'`
// //           cmd += ` ! -name '*.jpg'`
// //           cmd += ` ! -name '*.webp'`
// //           if (!recursive) cmd += ' -maxdepth 4'
// //           if (filter) cmd += ` -name "${filter}"`
// //           cmd += ' | head -n 300 | sort'
// //           const result = await sandbox.commands.run(cmd, { timeoutMs: 10000 })
// //           const lines = result.stdout.split('\n').map(l => l.trim()).filter(Boolean)
// //           if (lines.length === 0) return `No files found in ${path || 'project root'}.`
// //           const grouped: Record<string, string[]> = {}
// //           for (const fullPath of lines) {
// //             const relative = fullPath.replace(`${basePath}/`, '')
// //             const parts = relative.split('/')
// //             const fileName = parts.pop()!
// //             const dir = parts.join('/') || '.'
// //             if (!grouped[dir]) grouped[dir] = []
// //             grouped[dir].push(fileName)
// //           }
// //           let output = `Found ${lines.length} file${lines.length !== 1 ? 's' : ''}:\n\n`
// //           for (const [dir, files] of Object.entries(grouped).sort()) {
// //             output += `${dir}/\n`
// //             for (const f of files.slice(0, 50)) output += `  - ${f}\n`
// //             if (files.length > 50) output += `  ... and ${files.length - 50} more\n`
// //           }
// //           return output
// //         } catch (err) {
// //           Sentry.captureException(err, { extra: { tool: 'listFiles', path, sandboxId } })
// //           return `Error listing files: ${err}`
// //         }
// //       }
// //       if (step) {
// //         return await step.run(`listFiles-${Date.now()}`, executeList)
// //       }
// //       return executeList()
// //     },
// //   })

// //   return { terminal, createOrUpdateFiles, readFiles, listFiles } as ToolSet
// // }




