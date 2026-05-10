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
  sandboxId:        string
  userPrompt:       string | unknown[]
  history:          Message[]
  systemSuffix?:    string
  allowedFiles?:    string[]
  initialFiles?:    Record<string, string>
  emit?:            EventEmitterFn
  userPlan?:        string
  taskType?:        TaskType
  creditsRemaining?: number
  fileCount?:       number   // passed from task.files.length for complexity scoring
}

export interface CodeAgentResult {
  summary: string
  files:   Record<string, string>
}

export async function runCodeAgent(options: RunCodeAgentOptions): Promise<CodeAgentResult> {
  const {
    sandboxId,
    userPrompt,
    history,
    systemSuffix  = '',
    allowedFiles,
    initialFiles  = {},
    emit,
    userPlan      = 'free',
    taskType      = 'ui',
    creditsRemaining,
    fileCount     = 0,
  } = options

  const promptText = typeof userPrompt === 'string' ? userPrompt : JSON.stringify(userPrompt)

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
      promptLength:  promptText.length,
      fileCount,
      hasTypeScript: true, // Isotope always generates TS
    },
  })

  async function buildAndRunNetwork(m: typeof model) {
    const agent = createAgent<AgentState>({
      name:        'code-agent',
      description: 'Builds and modifies Next.js applications inside the sandbox',
      system:      PROMPT + systemSuffix,
      model:       m,
      tools:       [tools.listFiles, tools.readFiles, tools.createOrUpdateFiles, tools.terminal],
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
      name:         'code-agent-network',
      agents:       [agent],
      maxIter:      15,
      defaultState: state,
      router:       async ({ network: net }) => {
        if (net.state.data.summary) return
        return agent
      },
    })

    return network.run(userPrompt as string, { state })
  }

  // Use withFallback — if primary model fails, auto-retry with free Qwen model
  const freeModel = getDynamicModel({ plan: 'free', taskType, creditsRemaining })

  const result = await withFallback(
    () => buildAndRunNetwork(model),
    () => buildAndRunNetwork(freeModel),
    `codeAgent:${taskType}`,
  )

  return {
    summary: result.state.data.summary ?? '',
    files:   result.state.data.files   ?? {},
  }
}
