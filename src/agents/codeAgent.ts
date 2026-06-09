import {
  createAgent,
  createNetwork,
  createState,
  type Message,
} from '@inngest/agent-kit'

import { PROMPT } from '@/prompt'
import { createTools, type AgentState } from '@/tools/createTools'
import { lastAssistantTextMessageContent } from '@/inngest/utils'
import { getDynamicModel, withFallback, type TaskType } from '@/lib/openrouter'
import type { EventEmitterFn } from '@/streaming/events'

export interface RunCodeAgentOptions {
  sandboxId: string
  userPrompt: string | unknown[]
  history: Message[]
  systemSuffix?: string
  allowedFiles?: string[]
  initialFiles?: Record<string, string>
  emit?: EventEmitterFn
  userPlan?: string
  taskType?: TaskType
  creditsRemaining?: number
  fileCount?: number
  taskId?: string
}

export interface CodeAgentResult {
  summary: string
  files: Record<string, string>
}

export async function runCodeAgent(
  options: RunCodeAgentOptions,
): Promise<CodeAgentResult> {
  const {
    sandboxId,
    userPrompt,
    history,
    systemSuffix = '',
    allowedFiles,
    initialFiles = {},
    emit,
    userPlan = 'free',
    taskType = 'ui',
    creditsRemaining,
    fileCount = 0,
    taskId = 'default',
  } = options

  const promptText =
    typeof userPrompt === 'string'
      ? userPrompt
      : JSON.stringify(userPrompt)

  const tools = createTools({ sandboxId, allowedFiles, emit })

  const state = createState<AgentState>(
    { summary: '', files: initialFiles },
    { messages: history },
  )

  const model = getDynamicModel({
    plan: userPlan,
    taskType,
    creditsRemaining,
    complexity: {
      promptLength: promptText.length,
      fileCount,
      hasTypeScript: true,
    },
  })

  // Must be stable across Inngest replays — agent-kit uses agent.name as the
  // step.ai.infer step ID. Math.random() caused a new step every replay, so
  // inference never memoized and tools/router never ran (callCount stuck at 0).
  async function buildAndRunNetwork(m: typeof model, nameSuffix = '') {
    const agentName = `code-agent-${taskId}${nameSuffix}`

    const agent = createAgent<AgentState>({
      name: agentName,
      description: 'Builds and modifies Next.js applications inside the sandbox',
      system: PROMPT + systemSuffix,
      model: m,
      tools: [
        // tools.listFiles,
        // tools.readFiles,
        tools.createOrUpdateFiles,
        tools.terminal,
      ],
      lifecycle: {
        // onResponse fires BEFORE invokeTools — result.toolCalls is still []
        // here. Only use it for what it can actually see: text output from the
        // model. Tool-based stop logic belongs in the router (which runs after
        // the full agent.run() including tool execution).
        onResponse: async ({ result, network }) => {
          const lastMsg = lastAssistantTextMessageContent(result)
          if (lastMsg && network && lastMsg.includes('<task_summary>')) {
            network.state.data.summary = lastMsg
          }
          return result
        },
      },
    })

    const network = createNetwork<AgentState>({
      name: `code-agent-network-${taskId}${nameSuffix}`,
      agents: [agent],
      // maxIter: 0 means unlimited network iterations (the agent itself only
      // runs one inference per network iteration because agent-kit calls it
      // with maxIter: 0 internally). We control stopping via the router.
      maxIter: userPlan === 'free' ? 3 : 10,
      defaultState: state,
      router: async ({ network: net, lastResult, callCount }) => {
        // ── Primary stop: tool set summary (createOrUpdateFiles or <task_summary>) ──
        // createTools sets network.state.data.summary inside the createOrUpdateFiles
        // handler. onResponse sets it when the model emits <task_summary>. Either
        // way, summary being non-empty means the task is done.
        if (net.state.data.summary) {
          console.log(`[code-agent] stopping: summary set after ${callCount} call(s)`)
          return
        }

        // ── Secondary stop: createOrUpdateFiles was called this iteration ──
        // Belt-and-suspenders in case summary wasn't set (e.g. scope-blocked write
        // returned early before reaching the summary assignment). toolCalls is
        // populated by the time the router runs — agent.run() completes fully,
        // including invokeTools(), before the router is invoked.
        if (lastResult) {
          const calledCreate =
            lastResult.toolCalls?.some(
              (t: { tool?: { name?: string } }) => t.tool?.name === 'createOrUpdateFiles',
            ) ||
            lastResult.output?.some(
              (m: { type?: string; tools?: Array<{ name?: string }> }) =>
                m.type === 'tool_call' &&
                m.tools?.some((t) => t.name === 'createOrUpdateFiles'),
            )
          if (calledCreate) {
            if (!net.state.data.summary) {
              net.state.data.summary = `Task ${taskId} completed`
            }
            console.log(`[code-agent] stopping: createOrUpdateFiles called, call ${callCount}`)
            return
          }
        }

        // ── Safety cap ──
        // Free model safety: stop after 3 calls even if nothing terminates cleanly.
        // Paid models get more runway via maxIter on the network but this is a
        // last-resort guard at the router level.
        if (userPlan === 'free' && callCount >= 3) {
          console.warn(`[code-agent] free plan safety cap hit at callCount=${callCount}`)
          return
        }

        console.log(`[code-agent] scheduling next iteration, callCount=${callCount}`)
        return agent
      },
    })

    console.log('[code-agent] starting network run for task:', taskId)
    return network.run(userPrompt as string, { state })
  }

  const freeModel = getDynamicModel({
    plan: 'free',
    taskType,
    creditsRemaining,
  })

  const runNetwork = () => buildAndRunNetwork(model)
  const result =
    userPlan === 'free'
      ? await runNetwork()
      : await withFallback(
          runNetwork,
          () => buildAndRunNetwork(freeModel, '-fallback'),
          `codeAgent:${taskType}:${taskId}`,
        )

  const summary = result.state.data.summary || `Task ${taskId} completed`

  return {
    summary,
    files: result.state.data.files ?? {},
  }
}





// import {
//   createAgent,
//   createNetwork,
//   createState,
//   type Message,
// } from '@inngest/agent-kit'

// import { PROMPT } from '@/prompt'
// import { createTools, type AgentState } from '@/tools/createTools'
// import { lastAssistantTextMessageContent } from '@/inngest/utils'
// import { getDynamicModel, withFallback, type TaskType } from '@/lib/openrouter'
// import type { EventEmitterFn } from '@/streaming/events'

// export interface RunCodeAgentOptions {
//   sandboxId: string
//   userPrompt: string | unknown[]
//   history: Message[]
//   systemSuffix?: string
//   allowedFiles?: string[]
//   initialFiles?: Record<string, string>
//   emit?: EventEmitterFn
//   userPlan?: string
//   taskType?: TaskType
//   creditsRemaining?: number
//   fileCount?: number
//   taskId?: string
// }

// export interface CodeAgentResult {
//   summary: string
//   files: Record<string, string>
// }

// export async function runCodeAgent(
//   options: RunCodeAgentOptions,
// ): Promise<CodeAgentResult> {
//   const {
//     sandboxId,
//     userPrompt,
//     history,
//     systemSuffix = '',
//     allowedFiles,
//     initialFiles = {},
//     emit,
//     userPlan = 'free',
//     taskType = 'ui',
//     creditsRemaining,
//     fileCount = 0,
//     taskId = 'default',
//   } = options

//   const promptText =
//     typeof userPrompt === 'string'
//       ? userPrompt
//       : JSON.stringify(userPrompt)

//   const tools = createTools({ sandboxId, allowedFiles, emit })

//   const state = createState<AgentState>(
//     { summary: '', files: initialFiles },
//     { messages: history },
//   )

//   const model = getDynamicModel({
//     plan: userPlan,
//     taskType,
//     creditsRemaining,
//     complexity: {
//       promptLength: promptText.length,
//       fileCount,
//       hasTypeScript: true,
//     },
//   })

//   const runId = Math.random().toString(36).slice(2)

// //   async function buildAndRunNetwork(m: typeof model) {
// //   const agent = createAgent<AgentState>({
// //     name: `code-agent-${taskId}-${runId}`,
// //     description: 'Builds and modifies Next.js applications inside the sandbox',
// //     system: PROMPT + systemSuffix,
// //     model: m,
// //     tools: [
// //       tools.listFiles,
// //       tools.readFiles,
// //       tools.createOrUpdateFiles,
// //       tools.terminal,
// //     ],
// //   })

// //   console.log('[code-agent] starting agent run for task:', taskId)
// //   return agent.run(userPrompt as string, { state })
// // }

//   async function buildAndRunNetwork(m: typeof model) {
//     const agent = createAgent<AgentState>({
//       name: `code-agent-${taskId}-${runId}`,
//       description: 'Builds and modifies Next.js applications inside the sandbox',
//       system: PROMPT + systemSuffix,
//       model: m,
//       tools: [
//         tools.listFiles,
//         tools.readFiles,
//         tools.createOrUpdateFiles,
//         tools.terminal,
//       ],
//       lifecycle: {
//         onResponse: async ({ result, network }) => {
//           console.log('[onResponse] toolCalls length:', result.toolCalls.length)
//           console.log('[onResponse] output length:', result.output.length)
//           const lastMsg = lastAssistantTextMessageContent(result)
//           if (lastMsg && network && lastMsg.includes('<task_summary>')) {
//             network.state.data.summary = lastMsg
//           }
//           // NOTE: summary is no longer set here when createOrUpdateFiles is called.
//           // The tool itself sets network.state.data.summary (in createTools.ts), and
//           // the router below checks for it directly. One place, one responsibility —
//           // avoids a race where both onResponse and the tool set summary independently.
//           const calledCreate = result.toolCalls.some(
//             (t: any) => t.tool.name === 'createOrUpdateFiles'
//           )
//           if (calledCreate) {
//             // Force-stop the network before agent-kit fires the post-tool model call.
//             // The router runs between iterations, not within them — so by the time it
//             // could stop the network, agent-kit has already dispatched the next model
//             // call. Throwing here, inside onResponse, kills the network immediately.
//             throw new Error('AGENT_DONE')
//           }
//           return result
//         },
//         // lifecycle: {
//         //   onResponse: async ({ result, network }) => {
//         //     const lastMsg = lastAssistantTextMessageContent(result)
//         //     if (lastMsg && network && lastMsg.includes('<task_summary>')) {
//         //       network.state.data.summary = lastMsg
//         //     }
//         //     return result
//         //   },
//         //   onFinish: async ({ result, network }) => {
//         //     console.log('[onFinish] toolCalls:', JSON.stringify(result.toolCalls, null, 2))
//         //     const calledCreate = result.toolCalls.some(
//         //       (t: any) => t.tool.name === 'createOrUpdateFiles'
//         //     )
//         //     if (calledCreate && network && !network.state.data.summary) {
//         //       network.state.data.summary = `Task ${taskId} completed`
//         //     }
//         //     return result
//         //   },
//         // },
//       },
//     })

//     const network = createNetwork<AgentState>({
//       name: `code-agent-network-${taskId}-${runId}`,
//       agents: [agent],
//       maxIter: userPlan === 'free' ? 1 : 3,
//       defaultState: state,
//       router: async ({ network: net }) => {
//         // Stop if summary is set — tool or onResponse already marked completion
//         if (net.state.data.summary) return

//         const results = net.state.results
//         if (results.length > 0) {
//           const last = results[results.length - 1]

//           // Stop the network here, in the router, before agent-kit can dispatch
//           // the automatic post-tool model call. After createOrUpdateFiles runs
//           // successfully the files are written and there is nothing left to do —
//           // letting the network continue causes it to hang or loop forever on
//           // the follow-up inference call that has no useful work to perform.
//           const calledCreate = last.toolCalls?.some(
//             (t: any) => t.tool.name === 'createOrUpdateFiles'
//           )
//           if (calledCreate) return

//           const lastOutput = last.output[last.output.length - 1]
//           if (lastOutput && (lastOutput as any).stop_reason === 'stop') return
//         }
//         return agent
//       },
//     })

//     console.log('[code-agent] starting network run for task:', taskId)
//     // Catch the AGENT_DONE sentinel thrown by onResponse when createOrUpdateFiles
//     // completes. We return the network directly so the caller can read state.
//     try {
//       return await network.run(userPrompt as string, { state })
//     } catch (err: any) {
//       if (err?.message === 'AGENT_DONE') return network
//       throw err
//     }
//   }

//   const freeModel = getDynamicModel({
//     plan: 'free',
//     taskType,
//     creditsRemaining,
//   })

//   const result = await withFallback(
//     () => buildAndRunNetwork(model),
//     () => buildAndRunNetwork(freeModel),
//     `codeAgent:${taskType}:${taskId}:${runId}`,
//   )

//   let summary = result.state.data.summary ?? ''
//   if (!summary) {
//     summary = `Task ${taskId} completed`
//   }

//   return {
//     summary,
//     files: result.state.data.files ?? {},
//   }
// }

// // import {
// //   createAgent,
// //   createNetwork,
// //   createState,
// //   type Message,
// // } from '@inngest/agent-kit'

// // import { PROMPT } from '@/prompt'
// // import { createTools, type AgentState } from '@/tools/createTools'
// // import { lastAssistantTextMessageContent } from '@/inngest/utils'
// // import { getDynamicModel, withFallback, type TaskType } from '@/lib/openrouter'
// // import type { EventEmitterFn } from '@/streaming/events'

// // export interface RunCodeAgentOptions {
// //   sandboxId: string
// //   userPrompt: string | unknown[]
// //   history: Message[]
// //   systemSuffix?: string
// //   allowedFiles?: string[]
// //   initialFiles?: Record<string, string>
// //   emit?: EventEmitterFn
// //   userPlan?: string
// //   taskType?: TaskType
// //   creditsRemaining?: number
// //   fileCount?: number
// //   taskId?: string
// // }

// // export interface CodeAgentResult {
// //   summary: string
// //   files: Record<string, string>
// // }

// // export async function runCodeAgent(
// //   options: RunCodeAgentOptions,
// // ): Promise<CodeAgentResult> {
// //   const {
// //     sandboxId,
// //     userPrompt,
// //     history,
// //     systemSuffix = '',
// //     allowedFiles,
// //     initialFiles = {},
// //     emit,
// //     userPlan = 'free',
// //     taskType = 'ui',
// //     creditsRemaining,
// //     fileCount = 0,
// //     taskId = 'default',
// //   } = options

// //   const promptText =
// //     typeof userPrompt === 'string'
// //       ? userPrompt
// //       : JSON.stringify(userPrompt)

// //   const tools = createTools({ sandboxId, allowedFiles, emit })

// //   const state = createState<AgentState>(
// //     { summary: '', files: initialFiles },
// //     { messages: history },
// //   )

// //   const model = getDynamicModel({
// //     plan: userPlan,
// //     taskType,
// //     creditsRemaining,
// //     complexity: {
// //       promptLength: promptText.length,
// //       fileCount,
// //       hasTypeScript: true,
// //     },
// //   })

// //   const runId = Math.random().toString(36).slice(2)

// // //   async function buildAndRunNetwork(m: typeof model) {
// // //   const agent = createAgent<AgentState>({
// // //     name: `code-agent-${taskId}-${runId}`,
// // //     description: 'Builds and modifies Next.js applications inside the sandbox',
// // //     system: PROMPT + systemSuffix,
// // //     model: m,
// // //     tools: [
// // //       tools.listFiles,
// // //       tools.readFiles,
// // //       tools.createOrUpdateFiles,
// // //       tools.terminal,
// // //     ],
// // //   })

// // //   console.log('[code-agent] starting agent run for task:', taskId)
// // //   return agent.run(userPrompt as string, { state })
// // // }

// //   async function buildAndRunNetwork(m: typeof model) {
// //     const agent = createAgent<AgentState>({
// //       name: `code-agent-${taskId}-${runId}`,
// //       description: 'Builds and modifies Next.js applications inside the sandbox',
// //       system: PROMPT + systemSuffix,
// //       model: m,
// //       tools: [
// //         tools.listFiles,
// //         tools.readFiles,
// //         tools.createOrUpdateFiles,
// //         tools.terminal,
// //       ],
// //       lifecycle: {
// //         onResponse: async ({ result, network }) => {
// //            console.log('[onResponse] toolCalls length:', result.toolCalls.length)
// //           console.log('[onResponse] output length:', result.output.length)
// //           const lastMsg = lastAssistantTextMessageContent(result)
// //           if (lastMsg && network && lastMsg.includes('<task_summary>')) {
// //             network.state.data.summary = lastMsg
// //           }
// //           const calledCreate = result.toolCalls.some(
// //             (t: any) => t.tool.name === 'createOrUpdateFiles'
// //           )
// //           if (calledCreate && network && !network.state.data.summary) {
// //             network.state.data.summary = `Task ${taskId} completed`
// //           }
// //           return result
// //         },
// //       },
// //       // lifecycle: {
// //       //   onResponse: async ({ result, network }) => {
// //       //     const lastMsg = lastAssistantTextMessageContent(result)
// //       //     if (lastMsg && network && lastMsg.includes('<task_summary>')) {
// //       //       network.state.data.summary = lastMsg
// //       //     }
// //       //     return result
// //       //   },
// //       //   onFinish: async ({ result, network }) => {
// //       //     console.log('[onFinish] toolCalls:', JSON.stringify(result.toolCalls, null, 2))
// //       //     const calledCreate = result.toolCalls.some(
// //       //       (t: any) => t.tool.name === 'createOrUpdateFiles'
// //       //     )
// //       //     if (calledCreate && network && !network.state.data.summary) {
// //       //       network.state.data.summary = `Task ${taskId} completed`
// //       //     }
// //       //     return result
// //       //   },
// //       // },
// //     })

// //     const network = createNetwork<AgentState>({
// //       name: `code-agent-network-${taskId}-${runId}`,
// //       agents: [agent],
// //       maxIter: userPlan === 'free' ? 1 : 3,
// //       defaultState: state,
// //       router: async ({ network: net }) => {
// //         if (net.state.data.summary) return
// //         const results = net.state.results
// //         if (results.length > 0) {
// //           const last = results[results.length - 1]
// //           const lastOutput = last.output[last.output.length - 1]
// //           if (lastOutput && (lastOutput as any).stop_reason === 'stop') return
// //         }
// //         return agent
// //       },
// //     })

// //     console.log('[code-agent] starting network run for task:', taskId)
// //     return network.run(userPrompt as string, { state })
// //   }

// //   const freeModel = getDynamicModel({
// //     plan: 'free',
// //     taskType,
// //     creditsRemaining,
// //   })

// //   const result = await withFallback(
// //     () => buildAndRunNetwork(model),
// //     () => buildAndRunNetwork(freeModel),
// //     `codeAgent:${taskType}:${taskId}:${runId}`,
// //   )

// //   let summary = result.state.data.summary ?? ''
// //   if (!summary) {
// //     summary = `Task ${taskId} completed`
// //   }

// //   return {
// //     summary,
// //     files: result.state.data.files ?? {},
// //   }
// // }





// // // import {
// // //   createAgent,
// // //   createNetwork,
// // //   createState,
// // //   type Message,
// // // } from '@inngest/agent-kit'

// // // import { PROMPT } from '@/prompt'
// // // import { createTools, type AgentState } from '@/tools/createTools'
// // // import { lastAssistantTextMessageContent } from '@/inngest/utils'
// // // import { getDynamicModel, withFallback, type TaskType } from '@/lib/openrouter'
// // // import type { EventEmitterFn } from '@/streaming/events'

// // // export interface RunCodeAgentOptions {
// // //   sandboxId: string
// // //   userPrompt: string | unknown[]
// // //   history: Message[]
// // //   systemSuffix?: string
// // //   allowedFiles?: string[]
// // //   initialFiles?: Record<string, string>
// // //   emit?: EventEmitterFn
// // //   userPlan?: string
// // //   taskType?: TaskType
// // //   creditsRemaining?: number
// // //   fileCount?: number
// // //   taskId?: string
// // // }

// // // export interface CodeAgentResult {
// // //   summary: string
// // //   files: Record<string, string>
// // // }

// // // export async function runCodeAgent(
// // //   options: RunCodeAgentOptions,
// // // ): Promise<CodeAgentResult> {
// // //   const {
// // //     sandboxId,
// // //     userPrompt,
// // //     history,
// // //     systemSuffix = '',
// // //     allowedFiles,
// // //     initialFiles = {},
// // //     emit,
// // //     userPlan = 'free',
// // //     taskType = 'ui',
// // //     creditsRemaining,
// // //     fileCount = 0,
// // //     taskId = 'default',
// // //   } = options

// // //   const promptText =
// // //     typeof userPrompt === 'string'
// // //       ? userPrompt
// // //       : JSON.stringify(userPrompt)

// // //   const tools = createTools({ sandboxId, allowedFiles, emit })

// // //   const state = createState<AgentState>(
// // //     { summary: '', files: initialFiles },
// // //     { messages: history },
// // //   )

// // //   const model = getDynamicModel({
// // //     plan: userPlan,
// // //     taskType,
// // //     creditsRemaining,
// // //     complexity: {
// // //       promptLength: promptText.length,
// // //       fileCount,
// // //       hasTypeScript: true,
// // //     },
// // //   })

// // //   // Generate a run-scoped unique suffix so agent-kit's internal step IDs
// // //   // never collide across parallel or retried network runs.
// // //   const runId = Math.random().toString(36).slice(2)

// // //   async function buildAndRunNetwork(m: typeof model) {
// // //     const agent = createAgent<AgentState>({
// // //       name: `code-agent-${taskId}-${runId}`,
// // //       description:
// // //         'Builds and modifies Next.js applications inside the sandbox',
// // //       system: PROMPT + systemSuffix,
// // //       model: m,
// // //       tools: [
// // //         tools.listFiles,
// // //         tools.readFiles,
// // //         tools.createOrUpdateFiles,
// // //         tools.terminal,
// // //       ],

// // //       lifecycle: {
// // //         onResponse: async ({ result, network }) => {
// // //           const lastMsg = lastAssistantTextMessageContent(result)
// // //           if (lastMsg && network && lastMsg.includes('<task_summary>')) {
// // //             network.state.data.summary = lastMsg
// // //           }
// // //           return result
// // //         },
// // //         onFinish: async ({ result, network }) => {
// // //           const calledCreate = result.toolCalls.some(
// // //             (t: any) => t.tool.name === 'createOrUpdateFiles'
// // //           )
// // //           if (calledCreate && network && !network.state.data.summary) {
// // //             network.state.data.summary = `Task ${taskId} completed`
// // //           }
// // //           return result
// // //         },
// // //       },
// // //       })
// // //     //   lifecycle: {
// // //     //     onResponse: async ({ result, network }) => {
// // //     //       const lastMsg = lastAssistantTextMessageContent(result)
// // //     //       if (lastMsg && network && lastMsg.includes('<task_summary>')) {
// // //     //         network.state.data.summary = lastMsg
// // //     //       }
// // //     //       return result
// // //     //     },
// // //     //   },
// // //     // })

// // //     const network = createNetwork<AgentState>({
// // //         name: `code-agent-network-${taskId}-${runId}`,
// // //         agents: [agent],
// // //         maxIter: userPlan === 'free' ? 1 : 3,
// // //         defaultState: state,
// // //         router: async ({ network: net }) => {
// // //           if (net.state.data.summary) return
// // //           const results = net.state.results
// // //           if (results.length > 0) {
// // //             const last = results[results.length - 1]
// // //             const lastOutput = last.output[last.output.length - 1]
// // //             if (lastOutput && (lastOutput as any).stop_reason === 'stop') return
// // //           }
// // //           return agent
// // //         },
// // //       })

// // //     // const network = createNetwork<AgentState>({
// // //     //   name: `code-agent-network-${taskId}-${runId}`,
// // //     //   agents: [agent],
// // //     //   maxIter: userPlan === 'free' ? 1 : 6,
// // //     //   defaultState: state,
// // //     //   router: async ({ network: net, callCount }) => {
// // //     //     if (net.state.data.summary) return
// // //     //     if (callCount >= 1) return
// // //     //     return agent
// // //     //   },
// // //     //   // router: async ({ network: net }) => {
// // //     //   //   if (net.state.data.summary) return
// // //     //   //   return agent
// // //     //   // },
// // //     // })

// // //     console.log('[code-agent] starting network run for task:', taskId)
// // //     return network.run(userPrompt as string, { state })
// // //   }

// // //   const freeModel = getDynamicModel({
// // //     plan: 'free',
// // //     taskType,
// // //     creditsRemaining,
// // //   })

// // //   // withAsyncCtx ensures Inngest's async context (step tooling, run ID, etc.)
// // //   // is correctly propagated into the agent-kit network even when called from
// // //   // inside a TaskExecutor that breaks out of the top-level async chain.
// // //   const result = await withFallback(
// // //     () => buildAndRunNetwork(model),
// // //     () => buildAndRunNetwork(freeModel),
// // //     `codeAgent:${taskType}:${taskId}:${runId}`,
// // //   )
  
// // //   let summary = result.state.data.summary ?? ''
// // //   if (!summary) {
// // //     summary = `Task ${taskId} completed`
// // //   }

// // // return {
// // //   summary,
// // //   files: result.state.data.files ?? {},
// // // }


// // //   // return {
// // //   //   summary: result.state.data.summary ?? '',
// // //   //   files: result.state.data.files ?? {},
// // //   // }
// // // }


// // // // import {
// // // //   createAgent,
// // // //   createNetwork,
// // // //   createState,
// // // //   type Message,
// // // //   withAsyncCtx,
// // // // } from '@inngest/agent-kit'

// // // // import { PROMPT } from '@/prompt'
// // // // import { createTools, type AgentState } from '@/tools/createTools'
// // // // import { lastAssistantTextMessageContent } from '@/inngest/utils'
// // // // import { getDynamicModel, withFallback, type TaskType } from '@/lib/openrouter'
// // // // import type { EventEmitterFn } from '@/streaming/events'

// // // // export interface RunCodeAgentOptions {
// // // //   sandboxId: string
// // // //   userPrompt: string | unknown[]
// // // //   history: Message[]
// // // //   systemSuffix?: string
// // // //   allowedFiles?: string[]
// // // //   initialFiles?: Record<string, string>
// // // //   emit?: EventEmitterFn
// // // //   userPlan?: string
// // // //   taskType?: TaskType
// // // //   creditsRemaining?: number
// // // //   fileCount?: number
// // // //   taskId?: string
// // // // }

// // // // export interface CodeAgentResult {
// // // //   summary: string
// // // //   files: Record<string, string>
// // // // }

// // // // export async function runCodeAgent(
// // // //   options: RunCodeAgentOptions,
// // // // ): Promise<CodeAgentResult> {
// // // //   const {
// // // //     sandboxId,
// // // //     userPrompt,
// // // //     history,
// // // //     systemSuffix = '',
// // // //     allowedFiles,
// // // //     initialFiles = {},
// // // //     emit,
// // // //     userPlan = 'free',
// // // //     taskType = 'ui',
// // // //     creditsRemaining,
// // // //     fileCount = 0,
// // // //     taskId = 'default',
// // // //   } = options

// // // //   const promptText =
// // // //     typeof userPrompt === 'string'
// // // //       ? userPrompt
// // // //       : JSON.stringify(userPrompt)

// // // //   const tools = createTools({ sandboxId, allowedFiles, emit })

// // // //   const state = createState<AgentState>(
// // // //     { summary: '', files: initialFiles },
// // // //     { messages: history },
// // // //   )

// // // //   const model = getDynamicModel({
// // // //     plan: userPlan,
// // // //     taskType,
// // // //     creditsRemaining,
// // // //     complexity: {
// // // //       promptLength: promptText.length,
// // // //       fileCount,
// // // //       hasTypeScript: true,
// // // //     },
// // // //   })

// // // //   // Generate a run-scoped unique suffix so agent-kit's internal step IDs
// // // //   // never collide across parallel or retried network runs.
// // // //   const runId = Math.random().toString(36).slice(2)

// // // //   async function buildAndRunNetwork(m: typeof model) {
// // // //     const agent = createAgent<AgentState>({
// // // //       name: `code-agent-${taskId}-${runId}`,
// // // //       description:
// // // //         'Builds and modifies Next.js applications inside the sandbox',
// // // //       system: PROMPT + systemSuffix,
// // // //       model: m,
// // // //       tools: [
// // // //         tools.listFiles,
// // // //         tools.readFiles,
// // // //         tools.createOrUpdateFiles,
// // // //         tools.terminal,
// // // //       ],
// // // //       lifecycle: {
// // // //         onResponse: async ({ result, network }) => {
// // // //           const lastMsg = lastAssistantTextMessageContent(result)
// // // //           if (lastMsg && network && lastMsg.includes('<task_summary>')) {
// // // //             network.state.data.summary = lastMsg
// // // //           }
// // // //           return result
// // // //         },
// // // //       },
// // // //     })

// // // //     const network = createNetwork<AgentState>({
// // // //       name: `code-agent-network-${taskId}-${runId}`,
// // // //       agents: [agent],
// // // //       maxIter: userPlan === 'free' ? 3 : 6,
// // // //       defaultState: state,
// // // //       router: async ({ network: net }) => {
// // // //         if (net.state.data.summary) return
// // // //         return agent
// // // //       },
// // // //     })

// // // //     console.log('[code-agent] starting network run for task:', taskId)
// // // //     return network.run(userPrompt as string, { state })
// // // //   }

// // // //   const freeModel = getDynamicModel({
// // // //     plan: 'free',
// // // //     taskType,
// // // //     creditsRemaining,
// // // //   })

// // // //   // withAsyncCtx ensures Inngest's async context (step tooling, run ID, etc.)
// // // //   // is correctly propagated into the agent-kit network even when called from
// // // //   // inside a TaskExecutor that breaks out of the top-level async chain.
// // // //   const result = await withAsyncCtx(async () =>
// // // //     withFallback(
// // // //       () => buildAndRunNetwork(model),
// // // //       () => buildAndRunNetwork(freeModel),
// // // //       `codeAgent:${taskType}:${taskId}:${runId}`,
// // // //     ),
// // // //   )

// // // //   return {
// // // //     summary: result.state.data.summary ?? '',
// // // //     files: result.state.data.files ?? {},
// // // //   }
// // // // }




// // // // import {
// // // //   createAgent,
// // // //   createNetwork,
// // // //   createState,
// // // //   type Message,
// // // // } from '@inngest/agent-kit'

// // // // // import { withAsyncCtx } from 'inngest/experimental'

// // // // import { PROMPT } from '@/prompt'
// // // // import { createTools, type AgentState } from '@/tools/createTools'
// // // // import { lastAssistantTextMessageContent } from '@/inngest/utils'
// // // // import { getDynamicModel, withFallback, type TaskType } from '@/lib/openrouter'
// // // // import type { EventEmitterFn } from '@/streaming/events'

// // // // export interface RunCodeAgentOptions {
// // // //   sandboxId: string
// // // //   userPrompt: string | unknown[]
// // // //   history: Message[]
// // // //   systemSuffix?: string
// // // //   allowedFiles?: string[]
// // // //   initialFiles?: Record<string, string>
// // // //   emit?: EventEmitterFn
// // // //   userPlan?: string
// // // //   taskType?: TaskType
// // // //   creditsRemaining?: number
// // // //   fileCount?: number
// // // //   taskId?: string
// // // // }

// // // // export interface CodeAgentResult {
// // // //   summary: string
// // // //   files: Record<string, string>
// // // // }

// // // // export async function runCodeAgent(
// // // //   options: RunCodeAgentOptions,
// // // // ): Promise<CodeAgentResult> {
// // // //   const {
// // // //     sandboxId,
// // // //     userPrompt,
// // // //     history,
// // // //     systemSuffix = '',
// // // //     allowedFiles,
// // // //     initialFiles = {},
// // // //     emit,
// // // //     userPlan = 'free',
// // // //     taskType = 'ui',
// // // //     creditsRemaining,
// // // //     fileCount = 0,
// // // //     taskId = 'default',
// // // //   } = options

// // // //   const promptText =
// // // //     typeof userPrompt === 'string'
// // // //       ? userPrompt
// // // //       : JSON.stringify(userPrompt)

// // // //   const tools = createTools({ sandboxId, allowedFiles, emit })

// // // //   const state = createState<AgentState>(
// // // //     { summary: '', files: initialFiles },
// // // //     { messages: history },
// // // //   )

// // // //   const model = getDynamicModel({
// // // //     plan: userPlan,
// // // //     taskType,
// // // //     creditsRemaining,
// // // //     complexity: {
// // // //       promptLength: promptText.length,
// // // //       fileCount,
// // // //       hasTypeScript: true,
// // // //     },
// // // //   })

// // // //   // Generate a run-scoped unique suffix so agent-kit's internal step IDs
// // // //   // never collide across parallel or retried network runs.
// // // //   const runId = Math.random().toString(36).slice(2)

// // // //   async function buildAndRunNetwork(m: typeof model) {
// // // //     const agent = createAgent<AgentState>({
// // // //       name: `code-agent-${taskId}-${runId}`,
// // // //       description:
// // // //         'Builds and modifies Next.js applications inside the sandbox',
// // // //       system: PROMPT + systemSuffix,
// // // //       model: m,
// // // //       tools: [
// // // //         tools.listFiles,
// // // //         tools.readFiles,
// // // //         tools.createOrUpdateFiles,
// // // //         tools.terminal,
// // // //       ],
// // // //       lifecycle: {
// // // //         onResponse: async ({ result, network }) => {
// // // //           const lastMsg = lastAssistantTextMessageContent(result)
// // // //           if (lastMsg && network && lastMsg.includes('<task_summary>')) {
// // // //             network.state.data.summary = lastMsg
// // // //           }
// // // //           return result
// // // //         },
// // // //       },
// // // //     })

// // // //     const network = createNetwork<AgentState>({
// // // //       name: `code-agent-network-${taskId}-${runId}`,
// // // //       agents: [agent],
// // // //       maxIter: userPlan === 'free' ? 3 : 6,
// // // //       defaultState: state,
// // // //       router: async ({ network: net }) => {
// // // //         if (net.state.data.summary) return
// // // //         return agent
// // // //       },
// // // //     })
// // // //       console.log('[code-agent] starting network run for task:', taskId)
// // // //     return network.run(userPrompt as string, { state })
// // // //   }

// // // //   const freeModel = getDynamicModel({
// // // //     plan: 'free',
// // // //     taskType,
// // // //     creditsRemaining,
// // // //   })

// // // //   const result = await withFallback(
// // // //     () => buildAndRunNetwork(model),
// // // //     () => buildAndRunNetwork(freeModel),
// // // //     `codeAgent:${taskType}:${taskId}:${runId}`,
// // // //   )

// // // //   return {
// // // //     summary: result.state.data.summary ?? '',
// // // //     files: result.state.data.files ?? {},
// // // //   }
// // // // }



// // // // import {
// // // //   createAgent,
// // // //   createNetwork,
// // // //   createState,
// // // //   type Message,
// // // // } from '@inngest/agent-kit'

// // // // // import { withAsyncCtx } from 'inngest/experimental'

// // // // import { PROMPT } from '@/prompt'
// // // // import { createTools, type AgentState } from '@/tools/createTools'
// // // // import { lastAssistantTextMessageContent } from '@/inngest/utils'
// // // // import { getDynamicModel, withFallback, type TaskType } from '@/lib/openrouter'
// // // // import type { EventEmitterFn } from '@/streaming/events'

// // // // export interface RunCodeAgentOptions {
// // // //   sandboxId: string
// // // //   userPrompt: string | unknown[]
// // // //   history: Message[]
// // // //   systemSuffix?: string
// // // //   allowedFiles?: string[]
// // // //   initialFiles?: Record<string, string>
// // // //   emit?: EventEmitterFn
// // // //   userPlan?: string
// // // //   taskType?: TaskType
// // // //   creditsRemaining?: number
// // // //   fileCount?: number
// // // //   taskId?: string  // unique ID per task — used to make agent/network names unique so
// // // //                    // Inngest can distinguish parallel steps and avoids the warning:
// // // //                    // "AUTOMATIC_PARALLEL_INDEXING: multiple steps with the same ID"
// // // //   // step intentionally removed — passing step into createTools() causes
// // // //   // tool handlers to call step.run() which breaks agent-kit's AsyncLocalStorage
// // // //   // context, causing: "Cannot read properties of undefined (reading 'step')"
// // // // }

// // // // export interface CodeAgentResult {
// // // //   summary: string
// // // //   files: Record<string, string>
// // // // }

// // // // export async function runCodeAgent(
// // // //   options: RunCodeAgentOptions,
// // // // ): Promise<CodeAgentResult> {
// // // //   const {
// // // //     sandboxId,
// // // //     userPrompt,
// // // //     history,
// // // //     systemSuffix = '',
// // // //     allowedFiles,
// // // //     initialFiles = {},
// // // //     emit,
// // // //     userPlan = 'free',
// // // //     taskType = 'ui',
// // // //     creditsRemaining,
// // // //     fileCount = 0,
// // // //     taskId = 'default',
// // // //   } = options

// // // //   const promptText =
// // // //     typeof userPrompt === 'string'
// // // //       ? userPrompt
// // // //       : JSON.stringify(userPrompt)

// // // //   // ✅ FIX: step removed from createTools — tool handlers must NOT call
// // // //   // step.run() as it creates a nested async context that breaks agent-kit's
// // // //   // AsyncLocalStorage, causing tools to hang or crash on the next LLM call.
// // // //   const tools = createTools({ sandboxId, allowedFiles, emit })

// // // //   const state = createState<AgentState>(
// // // //     { summary: '', files: initialFiles },
// // // //     { messages: history },
// // // //   )

// // // //   const model = getDynamicModel({
// // // //     plan: userPlan,
// // // //     taskType,
// // // //     creditsRemaining,
// // // //     complexity: {
// // // //       promptLength: promptText.length,
// // // //       fileCount,
// // // //       hasTypeScript: true,
// // // //     },
// // // //   })

// // // //   async function buildAndRunNetwork(m: typeof model) {
// // // //     // Use taskId in agent and network names so that when multiple tasks run in
// // // //     // parallel, each registers uniquely-named steps in Inngest's step graph.
// // // //     // Without this, all parallel tasks share the name "code-agent" and Inngest
// // // //     // emits: "AUTOMATIC_PARALLEL_INDEXING: multiple steps with the same ID"
// // // //     const agent = createAgent<AgentState>({
// // // //       name: `code-agent-${taskId}`,
// // // //       description:
// // // //         'Builds and modifies Next.js applications inside the sandbox',
// // // //       system: PROMPT + systemSuffix,
// // // //       model: m,
// // // //       tools: [
// // // //         tools.listFiles,
// // // //         tools.readFiles,
// // // //         tools.createOrUpdateFiles,
// // // //         tools.terminal,
// // // //       ],
// // // //       lifecycle: {
// // // //         onResponse: async ({ result, network }) => {
// // // //           const lastMsg = lastAssistantTextMessageContent(result)
// // // //           if (lastMsg && network && lastMsg.includes('<task_summary>')) {
// // // //             network.state.data.summary = lastMsg
// // // //           }
// // // //           return result
// // // //         },
// // // //       },
// // // //     })

// // // //     const network = createNetwork<AgentState>({
// // // //       name: `code-agent-network-${taskId}`,
// // // //       agents: [agent],
// // // //       maxIter: 6,
// // // //       defaultState: state,
// // // //       router: async ({ network: net }) => {
// // // //         if (net.state.data.summary) return
// // // //         return agent
// // // //       },
// // // //     })

// // // //     // ✅ IMPORTANT: 0.8.4 requires async context wrapper
// // // //     // return withAsyncCtx(() =>
// // // //     //   network.run(userPrompt as string, { state }),
// // // //     // )
// // // //     return network.run(userPrompt as string, { state })
// // // //   }

// // // //   const freeModel = getDynamicModel({
// // // //     plan: 'free',
// // // //     taskType,
// // // //     creditsRemaining,
// // // //   })

// // // //   const result = await withFallback(
// // // //     () => buildAndRunNetwork(model),
// // // //     () => buildAndRunNetwork(freeModel),
// // // //     `codeAgent:${taskType}:${taskId}`,
// // // //   )

// // // //   return {
// // // //     summary: result.state.data.summary ?? '',
// // // //     files: result.state.data.files ?? {},
// // // //   }
// // // // }



