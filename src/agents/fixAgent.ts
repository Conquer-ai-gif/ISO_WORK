import {
  createAgent,
  createNetwork,
  createState,
} from '@inngest/agent-kit'

import { PROMPT } from '@/prompt'
import { createTools, type AgentState } from '@/tools/createTools'
import { lastAssistantTextMessageContent } from '@/inngest/utils'
import { getDynamicModel, withFallback } from '@/lib/openrouter'
import * as Sentry from '@sentry/nextjs'
import type { EventEmitterFn } from '@/streaming/events'
import { makeEvent } from '@/streaming/events'
import { runTsc } from '@/sandbox/sandboxManager'

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
}

export interface FixAgentResult {
  fixed: boolean
  files: Record<string, string>
  remainingErrors?: string
}

/** Typecheck only — matches post-execution validation in functions.ts (faster than tsc+eslint). */
async function detectErrors(
  sandboxId: string,
  files: string[] = [],
): Promise<string> {
  try {
    return await runTsc(sandboxId, files)
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

    // Stable names per attempt — must not use Math.random() (breaks Inngest memoization
    // for step.ai.infer). Network name is also used for generate-network-id step IDs
    // after the agent-kit patch (one unique ID per network per invocation).
    function buildNetwork(m: typeof model, nameSuffix = '') {
      const agentName = `fix-agent-${sandboxId.slice(-8)}-attempt-${attempt}${nameSuffix}`
      const networkName = `fix-agent-network-${sandboxId.slice(-8)}-attempt-${attempt}${nameSuffix}`

      const agent = createAgent({
        name: agentName,
        system: PROMPT,
        model: m,
        tools: [
          // tools.listFiles,
          // tools.readFiles,
          tools.createOrUpdateFiles,
        ],
        lifecycle: {
          // onResponse fires BEFORE invokeTools — result.toolCalls is still []
          // here. Only capture text-based summary signals; tool-based stop
          // belongs in the router which runs after the full agent execution.
          onResponse: async ({ result, network }) => {
            const lastMsg = lastAssistantTextMessageContent(result)
            if (lastMsg && network && lastMsg.includes('<task_summary>')) {
              network.state.data.summary = lastMsg
            }
            return result
          },
        },
      })

      return createNetwork({
        name: networkName,
        agents: [agent],
        maxIter: userPlan === 'free' ? 2 : 3,
        defaultState: state,
        router: async ({ network: net, lastResult, callCount }) => {
          // ── Primary stop: summary set by tool handler or <task_summary> text ──
          // createTools sets network.state.data.summary inside createOrUpdateFiles.
          // This is the normal exit path for the fix agent.
          if (net.state.data.summary) {
            console.log(`[fix-agent] attempt=${attempt} stopping: summary set after ${callCount} call(s)`)
            return
          }

          // ── Secondary stop: createOrUpdateFiles was called this iteration ──
          // Belt-and-suspenders: if the tool ran but summary assignment was
          // bypassed (e.g. scope-blocked partial write), stop anyway. The files
          // have been written; running another iteration would re-introduce errors.
          // toolCalls is fully populated by the time the router runs.
          if (lastResult) {
            const calledCreate =
              lastResult.toolCalls?.some(
                (t: { tool?: { name?: string } }) =>
                  t.tool?.name === 'createOrUpdateFiles',
              ) ||
              lastResult.output?.some(
                (m: { type?: string; tools?: Array<{ name?: string }> }) =>
                  m.type === 'tool_call' &&
                  m.tools?.some((t) => t.name === 'createOrUpdateFiles'),
              )
            if (calledCreate) {
              if (!net.state.data.summary) {
                net.state.data.summary = `Fix attempt ${attempt} completed`
              }
              console.log(`[fix-agent] attempt=${attempt} stopping: createOrUpdateFiles called, call ${callCount}`)
              return
            }
          }

          if (userPlan === 'free' && callCount >= 2) {
            console.warn(`[fix-agent] attempt=${attempt} free plan cap at callCount=${callCount}`)
            return
          }

          return agent
        },
      })
    }

    const runNetwork = () => buildNetwork(model).run(fixPrompt, { state })

    try {
      // Free plan already uses the free model — skip withFallback to avoid a
      // second network.run (duplicate Inngest steps + extra LLM latency).
      const result =
        userPlan === 'free'
          ? await runNetwork()
          : await withFallback(
              runNetwork,
              () => buildNetwork(freeModel, '-fallback').run(fixPrompt, { state }),
              `fixAgent:attempt${attempt}:${sandboxId.slice(-8)}`,
            )

      if (result.state.data.files) {
        currentFiles = {
          ...currentFiles,
          ...result.state.data.files,
        }
      }

      const afterFix = await detectErrors(sandboxId, failingFiles)
      if (!afterFix || afterFix.length < 10) {
        return { fixed: true, files: currentFiles }
      }
    } catch (err) {
      Sentry.captureException(err, {
        extra: { context: 'runFixAgent', attempt, sandboxId },
      })
    }
  }

  const remainingErrors = await detectErrors(sandboxId, failingFiles)

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

// const MAX_FIX_RETRIES = 3

// export interface RunFixAgentOptions {
//   sandboxId: string
//   existingFiles: Record<string, string>
//   failingFiles?: string[]
//   allowedFiles?: string[]
//   emit?: EventEmitterFn
//   userPlan?: string
//   creditsRemaining?: number
//   maxLoops?: number
// }

// export interface FixAgentResult {
//   fixed: boolean
//   files: Record<string, string>
//   remainingErrors?: string
// }

// async function detectErrors(
//   sandboxId: string,
//   files: string[] = [],
// ): Promise<string> {
//   try {
//     const sandbox = await getSandbox(sandboxId)

//     const tscResult = await sandbox.commands.run(
//       'npx tsc --noEmit 2>&1 | head -40 || true',
//       { timeoutMs: 20000 },
//     )

//     const eslintResult = await sandbox.commands.run(
//       'npx eslint . --ext .ts,.tsx --max-warnings=0 --format=compact 2>&1 | head -20 || true',
//       { timeoutMs: 15000 },
//     )

//     const combined = [
//       tscResult.stdout.trim(),
//       eslintResult.stdout.trim(),
//     ]
//       .filter(Boolean)
//       .join('\n')

//     if (!combined) return ''

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

// export async function runFixAgent(
//   options: RunFixAgentOptions,
// ): Promise<FixAgentResult> {
//   const {
//     sandboxId,
//     existingFiles,
//     failingFiles,
//     allowedFiles,
//     emit,
//     userPlan = 'free',
//     creditsRemaining,
//     maxLoops,
//   } = options

//   const effectiveAllowedFiles = failingFiles ?? allowedFiles
//   let currentFiles = { ...existingFiles }

//   const loopLimit = Math.min(
//     maxLoops ?? MAX_FIX_RETRIES,
//     MAX_FIX_RETRIES,
//   )

//   const model = getDynamicModel({
//     plan: userPlan,
//     taskType: 'fix',
//     creditsRemaining,
//   })

//   const freeModel = getDynamicModel({
//     plan: 'free',
//     taskType: 'fix',
//   })

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
//         },
//       }),
//     )

//     const tools = createTools({
//       sandboxId,
//       allowedFiles: effectiveAllowedFiles,
//       emit,
//     })

//     const state = createState<AgentState>(
//       { summary: '', files: currentFiles },
//       { messages: [] },
//     )

//     const fixPrompt = `
// Fix the following errors silently.

// Do NOT explain anything.
// Only fix code.

// Errors:
// ${errors.slice(0, 2000)}

// Focus only on broken parts.
// `.trim()

//     // Generate a run-scoped unique suffix per attempt so agent-kit's internal
//     // step IDs never collide across parallel or retried fix runs.
//     const runId = Math.random().toString(36).slice(2)

//     function buildNetwork(m: typeof model) {
//       const agent = createAgent({
//         name: `fix-agent-attempt${attempt}-${runId}`,
//         system: PROMPT,
//         model: m,
//         tools: [
//           tools.listFiles,
//           tools.readFiles,
//           tools.createOrUpdateFiles,
//         ],
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
//         name: `fix-agent-network-attempt${attempt}-${runId}`,
//         agents: [agent],
//         maxIter: 3,
//         defaultState: state,
//         router: async ({ network: net }) => {
//           if (net.state.data.summary) return
//           return agent
//         },
//       })
//     }

//     try {
//       // withAsyncCtx ensures Inngest's async context is correctly propagated
//       // into the agent-kit network even when called from inside a TaskExecutor
//       // that breaks out of the top-level async chain, preventing silent hangs.
//       const result = await withFallback(
//         () => buildNetwork(model).run(fixPrompt, { state }),
//         () => buildNetwork(freeModel).run(fixPrompt, { state }),
//         `fixAgent:attempt${attempt}:${runId}`,
//       )

//       if (result.state.data.files) {
//         currentFiles = {
//           ...currentFiles,
//           ...result.state.data.files,
//         }
//       }
//     } catch (err) {
//       Sentry.captureException(err, {
//         extra: { context: 'runFixAgent', attempt, sandboxId },
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

// // import {
// //   createAgent,
// //   createNetwork,
// //   createState,
// //   withAsyncCtx,
// // } from '@inngest/agent-kit'

// // import { PROMPT } from '@/prompt'
// // import { createTools, type AgentState } from '@/tools/createTools'
// // import { lastAssistantTextMessageContent } from '@/inngest/utils'
// // import { getDynamicModel, withFallback } from '@/lib/openrouter'
// // import * as Sentry from '@sentry/nextjs'
// // import type { EventEmitterFn } from '@/streaming/events'
// // import { makeEvent } from '@/streaming/events'
// // import { getSandbox } from '@/sandbox/sandboxManager'

// // const MAX_FIX_RETRIES = 3

// // export interface RunFixAgentOptions {
// //   sandboxId: string
// //   existingFiles: Record<string, string>
// //   failingFiles?: string[]
// //   allowedFiles?: string[]
// //   emit?: EventEmitterFn
// //   userPlan?: string
// //   creditsRemaining?: number
// //   maxLoops?: number
// // }

// // export interface FixAgentResult {
// //   fixed: boolean
// //   files: Record<string, string>
// //   remainingErrors?: string
// // }

// // async function detectErrors(
// //   sandboxId: string,
// //   files: string[] = [],
// // ): Promise<string> {
// //   try {
// //     const sandbox = await getSandbox(sandboxId)

// //     const tscResult = await sandbox.commands.run(
// //       'npx tsc --noEmit 2>&1 | head -40 || true',
// //       { timeoutMs: 20000 },
// //     )

// //     const eslintResult = await sandbox.commands.run(
// //       'npx eslint . --ext .ts,.tsx --max-warnings=0 --format=compact 2>&1 | head -20 || true',
// //       { timeoutMs: 15000 },
// //     )

// //     const combined = [
// //       tscResult.stdout.trim(),
// //       eslintResult.stdout.trim(),
// //     ]
// //       .filter(Boolean)
// //       .join('\n')

// //     if (!combined) return ''

// //     if (files.length === 0) return combined

// //     return combined
// //       .split('\n')
// //       .filter((line) => files.some((f) => line.includes(f)))
// //       .join('\n')
// //       .trim()
// //   } catch (err) {
// //     console.error('[fixAgent] detectErrors failed:', err)
// //     return ''
// //   }
// // }

// // export async function runFixAgent(
// //   options: RunFixAgentOptions,
// // ): Promise<FixAgentResult> {
// //   const {
// //     sandboxId,
// //     existingFiles,
// //     failingFiles,
// //     allowedFiles,
// //     emit,
// //     userPlan = 'free',
// //     creditsRemaining,
// //     maxLoops,
// //   } = options

// //   const effectiveAllowedFiles = failingFiles ?? allowedFiles
// //   let currentFiles = { ...existingFiles }

// //   const loopLimit = Math.min(
// //     maxLoops ?? MAX_FIX_RETRIES,
// //     MAX_FIX_RETRIES,
// //   )

// //   const model = getDynamicModel({
// //     plan: userPlan,
// //     taskType: 'fix',
// //     creditsRemaining,
// //   })

// //   const freeModel = getDynamicModel({
// //     plan: 'free',
// //     taskType: 'fix',
// //   })

// //   for (let attempt = 1; attempt <= loopLimit; attempt++) {
// //     const errors = await detectErrors(sandboxId, failingFiles)

// //     if (!errors || errors.length < 10) {
// //       return { fixed: true, files: currentFiles }
// //     }

// //     emit?.(
// //       makeEvent('fix_started', {
// //         taskId: failingFiles?.[0],
// //         data: {
// //           attempt,
// //           errors: errors.slice(0, 500),
// //         },
// //       }),
// //     )

// //     const tools = createTools({
// //       sandboxId,
// //       allowedFiles: effectiveAllowedFiles,
// //       emit,
// //     })

// //     const state = createState<AgentState>(
// //       { summary: '', files: currentFiles },
// //       { messages: [] },
// //     )

// //     const fixPrompt = `
// // Fix the following errors silently.

// // Do NOT explain anything.
// // Only fix code.

// // Errors:
// // ${errors.slice(0, 2000)}

// // Focus only on broken parts.
// // `.trim()

// //     // Generate a run-scoped unique suffix per attempt so agent-kit's internal
// //     // step IDs never collide across parallel or retried fix runs.
// //     const runId = Math.random().toString(36).slice(2)

// //     function buildNetwork(m: typeof model) {
// //       const agent = createAgent({
// //         name: `fix-agent-attempt${attempt}-${runId}`,
// //         system: PROMPT,
// //         model: m,
// //         tools: [
// //           tools.listFiles,
// //           tools.readFiles,
// //           tools.createOrUpdateFiles,
// //         ],
// //         lifecycle: {
// //           onResponse: async ({ result, network }) => {
// //             const lastMsg = lastAssistantTextMessageContent(result)
// //             if (lastMsg && network && lastMsg.includes('<task_summary>')) {
// //               network.state.data.summary = lastMsg
// //             }
// //             return result
// //           },
// //         },
// //       })

// //       return createNetwork({
// //         name: `fix-agent-network-attempt${attempt}-${runId}`,
// //         agents: [agent],
// //         maxIter: 3,
// //         defaultState: state,
// //         router: async ({ network: net }) => {
// //           if (net.state.data.summary) return
// //           return agent
// //         },
// //       })
// //     }

// //     try {
// //       // withAsyncCtx ensures Inngest's async context is correctly propagated
// //       // into the agent-kit network even when called from inside a TaskExecutor
// //       // that breaks out of the top-level async chain, preventing silent hangs.
// //       const result = await withAsyncCtx(async () =>
// //         withFallback(
// //           () => buildNetwork(model).run(fixPrompt, { state }),
// //           () => buildNetwork(freeModel).run(fixPrompt, { state }),
// //           `fixAgent:attempt${attempt}:${runId}`,
// //         ),
// //       )

// //       if (result.state.data.files) {
// //         currentFiles = {
// //           ...currentFiles,
// //           ...result.state.data.files,
// //         }
// //       }
// //     } catch (err) {
// //       Sentry.captureException(err, {
// //         extra: { context: 'runFixAgent', attempt, sandboxId },
// //       })
// //     }
// //   }

// //   const remainingErrors = await detectErrors(sandboxId, failingFiles)

// //   return {
// //     fixed: !remainingErrors || remainingErrors.length < 10,
// //     files: currentFiles,
// //     remainingErrors: remainingErrors || undefined,
// //   }
// // }



// // import {
// //   createAgent,
// //   createNetwork,
// //   createState,
// // } from '@inngest/agent-kit'

// // import { PROMPT } from '@/prompt'
// // import { createTools, type AgentState } from '@/tools/createTools'
// // import { lastAssistantTextMessageContent } from '@/inngest/utils'
// // import { getDynamicModel, withFallback } from '@/lib/openrouter'
// // import * as Sentry from '@sentry/nextjs'
// // import type { EventEmitterFn } from '@/streaming/events'
// // import { makeEvent } from '@/streaming/events'
// // import { getSandbox } from '@/sandbox/sandboxManager'

// // const MAX_FIX_RETRIES = 3

// // export interface RunFixAgentOptions {
// //   sandboxId: string
// //   existingFiles: Record<string, string>
// //   failingFiles?: string[]
// //   allowedFiles?: string[]
// //   emit?: EventEmitterFn
// //   userPlan?: string
// //   creditsRemaining?: number
// //   maxLoops?: number
// // }

// // export interface FixAgentResult {
// //   fixed: boolean
// //   files: Record<string, string>
// //   remainingErrors?: string
// // }

// // async function detectErrors(
// //   sandboxId: string,
// //   files: string[] = [],
// // ): Promise<string> {
// //   try {
// //     const sandbox = await getSandbox(sandboxId)

// //     const tscResult = await sandbox.commands.run(
// //       'npx tsc --noEmit 2>&1 | head -40 || true',
// //       { timeoutMs: 20000 },
// //     )

// //     const eslintResult = await sandbox.commands.run(
// //       'npx eslint . --ext .ts,.tsx --max-warnings=0 --format=compact 2>&1 | head -20 || true',
// //       { timeoutMs: 15000 },
// //     )

// //     const combined = [
// //       tscResult.stdout.trim(),
// //       eslintResult.stdout.trim(),
// //     ]
// //       .filter(Boolean)
// //       .join('\n')

// //     if (!combined) return ''

// //     if (files.length === 0) return combined

// //     return combined
// //       .split('\n')
// //       .filter((line) => files.some((f) => line.includes(f)))
// //       .join('\n')
// //       .trim()
// //   } catch (err) {
// //     console.error('[fixAgent] detectErrors failed:', err)
// //     return ''
// //   }
// // }

// // export async function runFixAgent(
// //   options: RunFixAgentOptions,
// // ): Promise<FixAgentResult> {
// //   const {
// //     sandboxId,
// //     existingFiles,
// //     failingFiles,
// //     allowedFiles,
// //     emit,
// //     userPlan = 'free',
// //     creditsRemaining,
// //     maxLoops,
// //   } = options

// //   const effectiveAllowedFiles = failingFiles ?? allowedFiles
// //   let currentFiles = { ...existingFiles }

// //   const loopLimit = Math.min(
// //     maxLoops ?? MAX_FIX_RETRIES,
// //     MAX_FIX_RETRIES,
// //   )

// //   const model = getDynamicModel({
// //     plan: userPlan,
// //     taskType: 'fix',
// //     creditsRemaining,
// //   })

// //   const freeModel = getDynamicModel({
// //     plan: 'free',
// //     taskType: 'fix',
// //   })

// //   for (let attempt = 1; attempt <= loopLimit; attempt++) {
// //     const errors = await detectErrors(sandboxId, failingFiles)

// //     if (!errors || errors.length < 10) {
// //       return { fixed: true, files: currentFiles }
// //     }

// //     emit?.(
// //       makeEvent('fix_started', {
// //         taskId: failingFiles?.[0],
// //         data: {
// //           attempt,
// //           errors: errors.slice(0, 500),
// //         },
// //       }),
// //     )

// //     const tools = createTools({
// //       sandboxId,
// //       allowedFiles: effectiveAllowedFiles,
// //       emit,
// //     })

// //     const state = createState<AgentState>(
// //       { summary: '', files: currentFiles },
// //       { messages: [] },
// //     )

// //     const fixPrompt = `
// // Fix the following errors silently.

// // Do NOT explain anything.
// // Only fix code.

// // Errors:
// // ${errors.slice(0, 2000)}

// // Focus only on broken parts.
// // `.trim()

// //     // Generate a run-scoped unique suffix per attempt so agent-kit's internal
// //     // step IDs never collide across parallel or retried fix runs.
// //     const runId = Math.random().toString(36).slice(2)

// //     function buildNetwork(m: typeof model) {
// //       const agent = createAgent({
// //         name: `fix-agent-attempt${attempt}-${runId}`,
// //         system: PROMPT,
// //         model: m,
// //         tools: [
// //           tools.listFiles,
// //           tools.readFiles,
// //           tools.createOrUpdateFiles,
// //         ],
// //         lifecycle: {
// //           onResponse: async ({ result, network }) => {
// //             const lastMsg = lastAssistantTextMessageContent(result)
// //             if (lastMsg && network && lastMsg.includes('<task_summary>')) {
// //               network.state.data.summary = lastMsg
// //             }
// //             return result
// //           },
// //         },
// //       })

// //       return createNetwork({
// //         name: `fix-agent-network-attempt${attempt}-${runId}`,
// //         agents: [agent],
// //         maxIter: 3,
// //         defaultState: state,
// //         router: async ({ network: net }) => {
// //           if (net.state.data.summary) return
// //           return agent
// //         },
// //       })
// //     }

// //     try {
// //       const result = await withFallback(
// //         () => buildNetwork(model).run(fixPrompt, { state }),
// //         () => buildNetwork(freeModel).run(fixPrompt, { state }),
// //         `fixAgent:attempt${attempt}:${runId}`,
// //       )

// //       if (result.state.data.files) {
// //         currentFiles = {
// //           ...currentFiles,
// //           ...result.state.data.files,
// //         }
// //       }
// //     } catch (err) {
// //       Sentry.captureException(err, {
// //         extra: { context: 'runFixAgent', attempt, sandboxId },
// //       })
// //     }
// //   }

// //   const remainingErrors = await detectErrors(sandboxId, failingFiles)

// //   return {
// //     fixed: !remainingErrors || remainingErrors.length < 10,
// //     files: currentFiles,
// //     remainingErrors: remainingErrors || undefined,
// //   }
// // }





// // import {
// //   createAgent,
// //   createNetwork,
// //   createState,
// // } from '@inngest/agent-kit'


// // import { PROMPT } from '@/prompt'
// // import { createTools, type AgentState } from '@/tools/createTools'
// // import { lastAssistantTextMessageContent } from '@/inngest/utils'
// // import { getDynamicModel, withFallback } from '@/lib/openrouter'
// // import * as Sentry from '@sentry/nextjs'
// // import type { EventEmitterFn } from '@/streaming/events'
// // import { makeEvent } from '@/streaming/events'
// // import { getSandbox } from '@/sandbox/sandboxManager'

// // const MAX_FIX_RETRIES = 3

// // export interface RunFixAgentOptions {
// //   sandboxId: string
// //   existingFiles: Record<string, string>
// //   failingFiles?: string[]
// //   allowedFiles?: string[]
// //   emit?: EventEmitterFn
// //   userPlan?: string
// //   creditsRemaining?: number
// //   maxLoops?: number
// //   // step intentionally removed — passing step into createTools() causes
// //   // tool handlers to call step.run() which breaks agent-kit's AsyncLocalStorage
// //   // context, causing: "Cannot read properties of undefined (reading 'step')"
// // }

// // export interface FixAgentResult {
// //   fixed: boolean
// //   files: Record<string, string>
// //   remainingErrors?: string
// // }

// // async function detectErrors(
// //   sandboxId: string,
// //   files: string[] = [],
// // ): Promise<string> {
// //   try {
// //     const sandbox = await getSandbox(sandboxId)

// //     const tscResult = await sandbox.commands.run(
// //       'npx tsc --noEmit 2>&1 | head -40 || true',
// //       { timeoutMs: 20000 },
// //     )

// //     const eslintResult = await sandbox.commands.run(
// //       'npx eslint . --ext .ts,.tsx --max-warnings=0 --format=compact 2>&1 | head -20 || true',
// //       { timeoutMs: 15000 },
// //     )

// //     const combined = [
// //       tscResult.stdout.trim(),
// //       eslintResult.stdout.trim(),
// //     ]
// //       .filter(Boolean)
// //       .join('\n')

// //     if (!combined) return ''

// //     if (files.length === 0) return combined

// //     return combined
// //       .split('\n')
// //       .filter((line) => files.some((f) => line.includes(f)))
// //       .join('\n')
// //       .trim()
// //   } catch (err) {
// //     console.error('[fixAgent] detectErrors failed:', err)
// //     return ''
// //   }
// // }

// // export async function runFixAgent(
// //   options: RunFixAgentOptions,
// // ): Promise<FixAgentResult> {
// //   const {
// //     sandboxId,
// //     existingFiles,
// //     failingFiles,
// //     allowedFiles,
// //     emit,
// //     userPlan = 'free',
// //     creditsRemaining,
// //     maxLoops,
// //   } = options

// //   const effectiveAllowedFiles = failingFiles ?? allowedFiles
// //   let currentFiles = { ...existingFiles }

// //   const loopLimit = Math.min(
// //     maxLoops ?? MAX_FIX_RETRIES,
// //     MAX_FIX_RETRIES,
// //   )

// //   const model = getDynamicModel({
// //     plan: userPlan,
// //     taskType: 'fix',
// //     creditsRemaining,
// //   })

// //   const freeModel = getDynamicModel({
// //     plan: 'free',
// //     taskType: 'fix',
// //   })

// //   for (let attempt = 1; attempt <= loopLimit; attempt++) {
// //     const errors = await detectErrors(sandboxId, failingFiles)

// //     if (!errors || errors.length < 10) {
// //       return { fixed: true, files: currentFiles }
// //     }

// //     emit?.(
// //       makeEvent('fix_started', {
// //         taskId: failingFiles?.[0],
// //         data: {
// //           attempt,
// //           errors: errors.slice(0, 500),
// //         },
// //       }),
// //     )

// //     // ✅ FIX: step removed from createTools — tool handlers must NOT call
// //     // step.run() as it creates a nested async context that breaks agent-kit's
// //     // AsyncLocalStorage, causing tools to hang or crash on the next LLM call.
// //     const tools = createTools({
// //       sandboxId,
// //       allowedFiles: effectiveAllowedFiles,
// //       emit,
// //     })

// //     const state = createState<AgentState>(
// //       { summary: '', files: currentFiles },
// //       { messages: [] },
// //     )

// //     const fixPrompt = `
// // Fix the following errors silently.

// // Do NOT explain anything.
// // Only fix code.

// // Errors:
// // ${errors.slice(0, 2000)}

// // Focus only on broken parts.
// // `.trim()

// //     // Include attempt number in agent/network names so each retry is uniquely
// //     // identified in Inngest's step graph — keeps logs clean across fix loops.
// //     function buildNetwork(m: typeof model) {
// //       const agent = createAgent({
// //         name: `fix-agent-attempt${attempt}`,
// //         system: PROMPT,
// //         model: m,
// //         tools: [
// //           tools.listFiles,
// //           tools.readFiles,
// //           tools.createOrUpdateFiles,
// //         ],
// //         lifecycle: {
// //           onResponse: async ({ result, network }) => {
// //             const lastMsg = lastAssistantTextMessageContent(result)
// //             // Guard against network being undefined before accessing state
// //             if (lastMsg && network && lastMsg.includes('<task_summary>')) {
// //               network.state.data.summary = lastMsg
// //             }
// //             return result
// //           },
// //         },
// //       })

// //       return createNetwork({
// //         name: `fix-agent-network-attempt${attempt}`,
// //         agents: [agent],
// //         maxIter: 3,
// //         defaultState: state,
// //         router: async ({ network: net }) => {
// //           if (net.state.data.summary) return
// //           return agent
// //         },
// //       })
// //     }

// //     try {
// //       const result = await withFallback(
// //         () => buildNetwork(model).run(fixPrompt, { state }),
// //         () => buildNetwork(freeModel).run(fixPrompt, { state }),
// //         `fixAgent:attempt${attempt}`,
// //       )

// //       if (result.state.data.files) {
// //         currentFiles = {
// //           ...currentFiles,
// //           ...result.state.data.files,
// //         }
// //       }
// //     } catch (err) {
// //       Sentry.captureException(err, {
// //         extra: { context: 'runFixAgent', attempt, sandboxId },
// //       })
// //     }
// //   }

// //   const remainingErrors = await detectErrors(
// //     sandboxId,
// //     failingFiles,
// //   )

// //   return {
// //     fixed: !remainingErrors || remainingErrors.length < 10,
// //     files: currentFiles,
// //     remainingErrors: remainingErrors || undefined,
// //   }
// // }


