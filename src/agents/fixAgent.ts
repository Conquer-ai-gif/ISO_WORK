import {
  createAgent,
  createNetwork,
  createState,
} from '@inngest/agent-kit'

// import { withAsyncCtx } from 'inngest/experimental'

import { PROMPT } from '@/prompt'
import { createTools, type AgentState } from '@/tools/createTools'
import { lastAssistantTextMessageContent } from '@/inngest/utils'
import { getDynamicModel, withFallback } from '@/lib/openrouter'
import * as Sentry from '@sentry/nextjs'
import type { EventEmitterFn } from '@/streaming/events'
import { makeEvent } from '@/streaming/events'
import { getSandbox } from '@/sandbox/sandboxManager'

const MAX_FIX_RETRIES = 3

export interface RunFixAgentOptions {
  sandboxId: string
  existingFiles: Record<string, string>
  failingFiles?: string[]
  allowedFiles?: string[]
  emit?: EventEmitterFn
  userPlan?: string
  creditsRemaining?: number
  maxLoops?: number
  step?: any
}

export interface FixAgentResult {
  fixed: boolean
  files: Record<string, string>
  remainingErrors?: string
}

async function detectErrors(
  sandboxId: string,
  files: string[] = [],
): Promise<string> {
  try {
    const sandbox = await getSandbox(sandboxId)

    const tscResult = await sandbox.commands.run(
      'npx tsc --noEmit 2>&1 | head -40 || true',
      { timeoutMs: 20000 },
    )

    const eslintResult = await sandbox.commands.run(
      'npx eslint . --ext .ts,.tsx --max-warnings=0 --format=compact 2>&1 | head -20 || true',
      { timeoutMs: 15000 },
    )

    const combined = [
      tscResult.stdout.trim(),
      eslintResult.stdout.trim(),
    ]
      .filter(Boolean)
      .join('\n')

    if (!combined) return ''

    if (files.length === 0) return combined

    return combined
      .split('\n')
      .filter((line) => files.some((f) => line.includes(f)))
      .join('\n')
      .trim()
  } catch (err) {
    console.error('[fixAgent] detectErrors failed:', err)
    return ''
  }
}

export async function runFixAgent(
  options: RunFixAgentOptions,
): Promise<FixAgentResult> {
  const {
    sandboxId,
    existingFiles,
    failingFiles,
    allowedFiles,
    emit,
    userPlan = 'free',
    creditsRemaining,
    maxLoops,
    step,
  } = options

  const effectiveAllowedFiles = failingFiles ?? allowedFiles
  let currentFiles = { ...existingFiles }

  const loopLimit = Math.min(
    maxLoops ?? MAX_FIX_RETRIES,
    MAX_FIX_RETRIES,
  )

  const model = getDynamicModel({
    plan: userPlan,
    taskType: 'fix',
    creditsRemaining,
  })

  const freeModel = getDynamicModel({
    plan: 'free',
    taskType: 'fix',
  })

  for (let attempt = 1; attempt <= loopLimit; attempt++) {
    const errors = await detectErrors(sandboxId, failingFiles)

    if (!errors || errors.length < 10) {
      return { fixed: true, files: currentFiles }
    }

    emit?.(
      makeEvent('fix_started', {
        taskId: failingFiles?.[0],
        data: {
          attempt,
          errors: errors.slice(0, 500),
        },
      }),
    )

    const tools = createTools({
      sandboxId,
      allowedFiles: effectiveAllowedFiles,
      emit,
      step,
    })

    const state = createState<AgentState>(
      { summary: '', files: currentFiles },
      { messages: [] },
    )

    const fixPrompt = `
Fix the following errors silently.

Do NOT explain anything.
Only fix code.

Errors:
${errors.slice(0, 2000)}

Focus only on broken parts.
`.trim()

    function buildNetwork(m: typeof model) {
      const agent = createAgent({
        name: 'fix-agent',
        system: PROMPT,
        model: m,
        tools: [
          tools.listFiles,
          tools.readFiles,
          tools.createOrUpdateFiles,
        ],
        lifecycle: {
          onResponse: async ({ result, network }) => {
            const lastMsg = lastAssistantTextMessageContent(result)
            if (lastMsg?.includes('<task_summary>')) {
              network.state.data.summary = lastMsg
            }
            return result
          },
        },
      })

      return createNetwork({
        name: 'fix-agent-network',
        agents: [agent],
        maxIter: 3,
        defaultState: state,
        router: async ({ network: net }) => {
          if (net.state.data.summary) return
          return agent
        },
      })
    }
        
    try {
      const result = await withFallback(
        () => buildNetwork(model).run(fixPrompt, { state }),
        () => buildNetwork(freeModel).run(fixPrompt, { state }),
        `fixAgent:attempt${attempt}`,
  )

      if (result.state.data.files) {
        currentFiles = {
          ...currentFiles,
          ...result.state.data.files,
        }
      }
    } catch (err) {
      Sentry.captureException(err, {
        extra: { context: 'runFixAgent', attempt, sandboxId },
      })
    }
  }

  const remainingErrors = await detectErrors(
    sandboxId,
    failingFiles,
  )

  return {
    fixed: !remainingErrors || remainingErrors.length < 10,
    files: currentFiles,
    remainingErrors: remainingErrors || undefined,
  }
}






// import {
//   createAgent,
//   createNetwork,
//   createState,
// } from '@inngest/agent-kit'
// import { PROMPT } from '@/prompt'
// import { createTools, type AgentState } from '@/tools/createTools'
// import { lastAssistantTextMessageContent } from '@/inngest/utils'
// import { getDynamicModel, withFallback } from '@/lib/openrouter'
// import * as Sentry from '@sentry/nextjs'
// import type { EventEmitterFn } from '@/streaming/events'
// import { makeEvent } from '@/streaming/events'
// import { getSandbox } from '@/sandbox/sandboxManager'

// const MAX_FIX_RETRIES = 3  // absolute cap — plan limit applied per-call via maxLoops option

// export interface RunFixAgentOptions {
//   sandboxId:         string
//   existingFiles:     Record<string, string>
//   failingFiles?:     string[]
//   allowedFiles?:     string[]
//   emit?:             EventEmitterFn
//   userPlan?:         string
//   creditsRemaining?: number
//   maxLoops?:         number  // plan-based cap — defaults to MAX_FIX_RETRIES
//   step?:             any     // Inngest step context — forwarded into network.run()
// }

// export interface FixAgentResult {
//   fixed: boolean
//   files: Record<string, string>
//   remainingErrors?: string
// }

// async function detectErrors(sandboxId: string, files: string[] = []): Promise<string> {
//   try {
//     const sandbox = await getSandbox(sandboxId)

//     // Run TypeScript compiler — primary error source
//     const tscResult = await sandbox.commands.run(
//       'npx tsc --noEmit 2>&1 | head -40 || true',
//       { timeoutMs: 20000 },
//     )

//     // Check for missing module errors from the dev server
//     const buildResult = await sandbox.commands.run(
//       'cat /tmp/next-build-error.log 2>/dev/null | head -20 || true',
//       { timeoutMs: 5000 },
//     )

//     // Check for ESLint errors — catches import/export issues TS misses
//     const eslintResult = await sandbox.commands.run(
//       'npx eslint . --ext .ts,.tsx --max-warnings=0 --format=compact 2>&1 | grep -v "^$" | head -20 || true',
//       { timeoutMs: 15000 },
//     )

//     const combined = [
//       tscResult.stdout.trim(),
//       buildResult.stdout.trim(),
//       eslintResult.stdout.trim(),
//     ]
//       .filter(Boolean)
//       .join('\n')

//     if (!combined) return ''

//     // If specific files requested, filter to only errors from those files
//     if (files.length === 0) return combined

//     return combined
//       .split('\n')
//       .filter((line) => files.some((f) => line.includes(f)))
//       .join('\n')
//       .trim()
//   } catch (err) {
//     console.error('[fixAgent] detectErrors failed:', err)
//     return ''
//   }
// }

// export async function runFixAgent(options: RunFixAgentOptions): Promise<FixAgentResult> {
//   const {
//     sandboxId,
//     existingFiles,
//     failingFiles,
//     allowedFiles,
//     emit,
//     userPlan = 'free',
//     creditsRemaining,
//     maxLoops,
//     step,
//   } = options

//   const effectiveAllowedFiles = failingFiles ?? allowedFiles
//   let currentFiles = { ...existingFiles }
//   const loopLimit  = Math.min(maxLoops ?? MAX_FIX_RETRIES, MAX_FIX_RETRIES)

//   // Fix agent always uses 'fix' task type — most deterministic temperature (0.1)
//   const model = getDynamicModel({ plan: userPlan, taskType: 'fix', creditsRemaining })

//   for (let attempt = 1; attempt <= loopLimit; attempt++) {
//     const errors = await detectErrors(sandboxId, failingFiles)
//     if (!errors || errors.length < 10) {
//       return { fixed: true, files: currentFiles }
//     }

//     emit?.(
//       makeEvent('fix_started', {
//         taskId: failingFiles?.[0],
//         data: {
//           attempt,
//           errors: errors.slice(0, 500),
//           description: (() => {
//             const errorCount = errors.split('\n').filter(Boolean).length
//             const fileList = failingFiles && failingFiles.length > 0
//               ? failingFiles.map((f) => f.split('/').pop()).filter(Boolean).slice(0, 3).join(', ')
//               : null
//             return fileList
//               ? `Auto-fixing ${errorCount} TypeScript error${errorCount !== 1 ? 's' : ''} in ${fileList}…`
//               : `Auto-fixing ${errorCount} TypeScript error${errorCount !== 1 ? 's' : ''}…`
//           })(),
//         },
//       }),
//     )

//     const tools = createTools({ sandboxId, allowedFiles: effectiveAllowedFiles, emit, step })
//     const fixState = createState<AgentState>(
//       { summary: '', files: currentFiles },
//       { messages: [] },
//     )

//     const scopeNote = failingFiles && failingFiles.length > 0
//       ? `\n\nFocus ONLY on these files:\n${failingFiles.map((f) => `- ${f}`).join('\n')}\n`
//       : ''

//     const fixPrompt = `The app has errors. Fix them silently — do NOT explain, just fix and output <task_summary>brief description of what was fixed</task_summary> when done.${scopeNote}\nErrors:\n${errors.slice(0, 2000)}\n\nErrors may include TypeScript compilation errors, ESLint warnings, or build errors. Fix all of them by updating the relevant files. Do not change functionality — only fix what is broken.`

//     function buildFixNetwork(m: typeof model) {
//       const a = createAgent({
//         name:   'fix-agent',
//         system: PROMPT,
//         model:  m,
//         tools:  [tools.listFiles, tools.readFiles, tools.createOrUpdateFiles],
//         lifecycle: {
//           onResponse: async ({ result, network }) => {
//             const lastMsg = lastAssistantTextMessageContent(result)
//             if (lastMsg && network && lastMsg.includes('<task_summary>')) {
//               network.state.data.summary = lastMsg
//             }
//             return result
//           },
//         },
//       })
//       return createNetwork({
//         name:         'fix-agent-network',
//         agents:       [a],
//         maxIter:      5,
//         defaultState: fixState,
//         router:       async ({ network: net }) => {
//           if (net.state.data.summary) return
//           return a
//         },
//       })
//     }

//     const freeModel = getDynamicModel({ plan: 'free', taskType: 'fix' })

//     try {
//       // ✅ { step } forwarded into every network.run() call — required so
//       // AgenticModel.infer() can resolve getStepTools() without throwing.
//       const result = await withFallback(
//         () => buildFixNetwork(model).run(fixPrompt, { state: fixState, step } as any),
//         () => buildFixNetwork(freeModel).run(fixPrompt, { state: fixState, step } as any),
//         `fixAgent:attempt${attempt}`,
//       )
//       if (result.state.data.files && Object.keys(result.state.data.files).length > 0) {
//         currentFiles = { ...currentFiles, ...result.state.data.files }
//       }
//     } catch (err) {
//       Sentry.captureException(err, {
//         extra: { context: 'runFixAgent', attempt, sandboxId, failingFiles },
//       })
//     }
//   }

//   const remainingErrors = await detectErrors(sandboxId, failingFiles)
//   return {
//     fixed: !remainingErrors || remainingErrors.length < 10,
//     files: currentFiles,
//     remainingErrors: remainingErrors || undefined,
//   }
// }