import {
  createAgent,
  createNetwork,
  createState,
  type Message,
} from '@inngest/agent-kit'

// import { withAsyncCtx } from 'inngest/experimental'

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
  step?: any
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
    step,
  } = options

  const promptText =
    typeof userPrompt === 'string'
      ? userPrompt
      : JSON.stringify(userPrompt)

  const tools = createTools({ sandboxId, allowedFiles, emit, step })

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

  async function buildAndRunNetwork(m: typeof model) {
    const agent = createAgent<AgentState>({
      name: 'code-agent',
      description:
        'Builds and modifies Next.js applications inside the sandbox',
      system: PROMPT + systemSuffix,
      model: m,
      tools: [
        tools.listFiles,
        tools.readFiles,
        tools.createOrUpdateFiles,
        tools.terminal,
      ],
      lifecycle: {
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
      name: 'code-agent-network',
      agents: [agent],
      maxIter: 6,
      defaultState: state,
      router: async ({ network: net }) => {
        if (net.state.data.summary) return
        return agent
      },
    })

    // ✅ IMPORTANT: 0.8.4 requires async context wrapper
    // return withAsyncCtx(() =>
    //   network.run(userPrompt as string, { state }),
    // )
    return network.run(userPrompt as string, { state })
  }

  const freeModel = getDynamicModel({
    plan: 'free',
    taskType,
    creditsRemaining,
  })

  const result = await withFallback(
    () => buildAndRunNetwork(model),
    () => buildAndRunNetwork(freeModel),
    `codeAgent:${taskType}`,
  )

  return {
    summary: result.state.data.summary ?? '',
    files: result.state.data.files ?? {},
  }
}


// import {
//   createAgent,
//   createNetwork,
//   createState,
//   type Message,
// } from '@inngest/agent-kit'
// import { withAsyncCtx } from 'inngest/experimental'
// import { PROMPT } from '@/prompt'
// import { createTools, type AgentState } from '@/tools/createTools'
// import { lastAssistantTextMessageContent } from '@/inngest/utils'
// import { getDynamicModel, withFallback, type TaskType } from '@/lib/openrouter'
// import type { EventEmitterFn } from '@/streaming/events'

// export interface RunCodeAgentOptions {
//   sandboxId:         string
//   userPrompt:        string | unknown[]
//   history:           Message[]
//   systemSuffix?:     string
//   allowedFiles?:     string[]
//   initialFiles?:     Record<string, string>
//   emit?:             EventEmitterFn
//   userPlan?:         string
//   taskType?:         TaskType
//   creditsRemaining?: number
//   fileCount?:        number
//   step?:             any     // Inngest step — passed into withAsyncCtx
// }

// export interface CodeAgentResult {
//   summary: string
//   files:   Record<string, string>
// }

// export async function runCodeAgent(options: RunCodeAgentOptions): Promise<CodeAgentResult> {
//   const {
//     sandboxId,
//     userPrompt,
//     history,
//     systemSuffix  = '',
//     allowedFiles,
//     initialFiles  = {},
//     emit,
//     userPlan      = 'free',
//     taskType      = 'ui',
//     creditsRemaining,
//     fileCount     = 0,
//     step,
//   } = options

//   const promptText = typeof userPrompt === 'string' ? userPrompt : JSON.stringify(userPrompt)

//   const tools = createTools({ sandboxId, allowedFiles, emit, step })
//   const state = createState<AgentState>(
//     { summary: '', files: initialFiles },
//     { messages: history },
//   )

//   const model = getDynamicModel({
//     plan: userPlan,
//     taskType,
//     creditsRemaining,
//     complexity: {
//       promptLength:  promptText.length,
//       fileCount,
//       hasTypeScript: true,
//     },
//   })

//   function buildNetwork(m: typeof model) {
//     const agent = createAgent<AgentState>({
//       name:        'code-agent',
//       description: 'Builds and modifies Next.js applications inside the sandbox',
//       system:      PROMPT + systemSuffix,
//       model:       m,
//       tools:       [tools.listFiles, tools.readFiles, tools.createOrUpdateFiles, tools.terminal],
//       lifecycle: {
//         onResponse: async ({ result, network }) => {
//           const lastMsg = lastAssistantTextMessageContent(result)
//           if (lastMsg && network && lastMsg.includes('<task_summary>')) {
//             network.state.data.summary = lastMsg
//           }
//           return result
//         },
//       },
//     })

//     return createNetwork<AgentState>({
//       name:         'code-agent-network',
//       agents:       [agent],
//       maxIter:      15,
//       defaultState: state,
//       router:       async ({ network: net }) => {
//         if (net.state.data.summary) return
//         return agent
//       },
//     })
//   }

//   const freeModel = getDynamicModel({ plan: 'free', taskType, creditsRemaining })

//   // ✅ withAsyncCtx sets step in AsyncLocalStorage before agent-kit reads it.
//   // In agent-kit 0.8.4, network.run() ignores any { step } option passed
//   // directly — withAsyncCtx is the only working approach.
//   const result = await withFallback(
//     () => withAsyncCtx({ step }, () => buildNetwork(model).run(userPrompt as string, { state })),
//     () => withAsyncCtx({ step }, () => buildNetwork(freeModel).run(userPrompt as string, { state })),
//     `codeAgent:${taskType}`,
//   )

//   return {
//     summary: result.state.data.summary ?? '',
//     files:   result.state.data.files   ?? {},
//   }
// }



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
//   sandboxId:         string
//   userPrompt:        string | unknown[]
//   history:           Message[]
//   systemSuffix?:     string
//   allowedFiles?:     string[]
//   initialFiles?:     Record<string, string>
//   emit?:             EventEmitterFn
//   userPlan?:         string
//   taskType?:         TaskType
//   creditsRemaining?: number
//   fileCount?:        number  // passed from task.files.length for complexity scoring
//   step?:             any     // Inngest step context for tool durability
// }

// export interface CodeAgentResult {
//   summary: string
//   files:   Record<string, string>
// }

// export async function runCodeAgent(options: RunCodeAgentOptions): Promise<CodeAgentResult> {
//   const {
//     sandboxId,
//     userPrompt,
//     history,
//     systemSuffix  = '',
//     allowedFiles,
//     initialFiles  = {},
//     emit,
//     userPlan      = 'free',
//     taskType      = 'ui',
//     creditsRemaining,
//     fileCount     = 0,
//     step,
//   } = options

//   const promptText = typeof userPrompt === 'string' ? userPrompt : JSON.stringify(userPrompt)

//   const tools = createTools({ sandboxId, allowedFiles, emit, step })
//   const state = createState<AgentState>(
//     { summary: '', files: initialFiles },
//     { messages: history },
//   )

//   const model = getDynamicModel({
//     plan: userPlan,
//     taskType,
//     creditsRemaining,
//     complexity: {
//       promptLength:  promptText.length,
//       fileCount,
//       hasTypeScript: true, // Isotope always generates TS
//     },
//   })

//   async function buildAndRunNetwork(m: typeof model) {
//     const agent = createAgent<AgentState>({
//       name:        'code-agent',
//       description: 'Builds and modifies Next.js applications inside the sandbox',
//       system:      PROMPT + systemSuffix,
//       model:       m,
//       tools:       [tools.listFiles, tools.readFiles, tools.createOrUpdateFiles, tools.terminal],
//       lifecycle: {
//         onResponse: async ({ result, network }) => {
//           const lastMsg = lastAssistantTextMessageContent(result)
//           if (lastMsg && network && lastMsg.includes('<task_summary>')) {
//             network.state.data.summary = lastMsg
//           }
//           return result
//         },
//       },
//     })

//     const network = createNetwork<AgentState>({
//       name:         'code-agent-network',
//       agents:       [agent],
//       maxIter:      15,
//       defaultState: state,
//       router:       async ({ network: net }) => {
//         if (net.state.data.summary) return
//         return agent
//       },
//     })

//     // ✅ FIX: pass step into network.run() — this is where agent-kit reads it
//     // previously only { state } was passed, so getStepTools received undefined
//     // cast to any because agent-kit's RunOptions type doesn't expose step but reads it at runtime
//     return network.run(userPrompt as string, { state, step } as any)
//   }

//   const freeModel = getDynamicModel({ plan: 'free', taskType, creditsRemaining })

//   const result = await withFallback(
//     () => buildAndRunNetwork(model),
//     () => buildAndRunNetwork(freeModel),
//     `codeAgent:${taskType}`,
//   )

//   return {
//     summary: result.state.data.summary ?? '',
//     files:   result.state.data.files   ?? {},
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
// //   sandboxId:        string
// //   userPrompt:       string | unknown[]
// //   history:          Message[]
// //   systemSuffix?:    string
// //   allowedFiles?:    string[]
// //   initialFiles?:    Record<string, string>
// //   emit?:            EventEmitterFn
// //   userPlan?:        string
// //   taskType?:        TaskType
// //   creditsRemaining?: number
// //   fileCount?:       number   // passed from task.files.length for complexity scoring
// //   step?:            any      // Inngest step context for tool durability
// // }

// // export interface CodeAgentResult {
// //   summary: string
// //   files:   Record<string, string>
// // }

// // export async function runCodeAgent(options: RunCodeAgentOptions): Promise<CodeAgentResult> {
// //   const {
// //     sandboxId,
// //     userPrompt,
// //     history,
// //     systemSuffix  = '',
// //     allowedFiles,
// //     initialFiles  = {},
// //     emit,
// //     userPlan      = 'free',
// //     taskType      = 'ui',
// //     creditsRemaining,
// //     fileCount     = 0,
// //     step,
// //   } = options

// //   const promptText = typeof userPrompt === 'string' ? userPrompt : JSON.stringify(userPrompt)

// //   const tools = createTools({ sandboxId, allowedFiles, emit, step })
// //   const state = createState<AgentState>(
// //     { summary: '', files: initialFiles },
// //     { messages: history },
// //   )

// //   const model = getDynamicModel({
// //     plan: userPlan,
// //     taskType,
// //     creditsRemaining,
// //     complexity: {
// //       promptLength:  promptText.length,
// //       fileCount,
// //       hasTypeScript: true, // Isotope always generates TS
// //     },
// //   })

// //   async function buildAndRunNetwork(m: typeof model) {
// //     const agent = createAgent<AgentState>({
// //       name:        'code-agent',
// //       description: 'Builds and modifies Next.js applications inside the sandbox',
// //       system:      PROMPT + systemSuffix,
// //       model:       m,
// //       tools:       [tools.listFiles, tools.readFiles, tools.createOrUpdateFiles, tools.terminal],
// //       lifecycle: {
// //         onResponse: async ({ result, network }) => {
// //           const lastMsg = lastAssistantTextMessageContent(result)
// //           if (lastMsg && network && lastMsg.includes('<task_summary>')) {
// //             network.state.data.summary = lastMsg
// //           }
// //           return result
// //         },
// //       },
// //     })

// //     const network = createNetwork<AgentState>({
// //       name:         'code-agent-network',
// //       agents:       [agent],
// //       maxIter:      15,
// //       defaultState: state,
// //       router:       async ({ network: net }) => {
// //         if (net.state.data.summary) return
// //         return agent
// //       },
// //     })

// //     return network.run(userPrompt as string, { state })
// //   }

// //   // Use withFallback — if primary model fails, auto-retry with free Qwen model
// //   const freeModel = getDynamicModel({ plan: 'free', taskType, creditsRemaining })

// //   const result = await withFallback(
// //     () => buildAndRunNetwork(model),
// //     () => buildAndRunNetwork(freeModel),
// //     `codeAgent:${taskType}`,
// //   )

// //   return {
// //     summary: result.state.data.summary ?? '',
// //     files:   result.state.data.files   ?? {},
// //   }
// // }
