import type { AgentResult, Message, TextMessage } from '@inngest/agent-kit'

// getSandbox is defined in sandboxManager.ts — import from there.
// It handles reconnect, timeout refresh, and sandbox creation.
// Do NOT redefine it here — two implementations cause behaviour drift.
export { getSandbox } from '@/sandbox/sandboxManager'

export function lastAssistantTextMessageContent(result: AgentResult): string | undefined {
  const lastAssistantIndex = result.output.findLastIndex(
    (message) => message.role === 'assistant',
  )
  if (lastAssistantIndex === -1) return undefined

  const message = result.output[lastAssistantIndex] as TextMessage | undefined
  if (!message?.content) return undefined

  return typeof message.content === 'string'
    ? message.content
    : message.content.map((c) => c.text).join('')
}

export function parseAgentOutput(value: Message[]): string {
  // Guard against empty output — happens on timeout or rate limit
  if (!value || value.length === 0) return 'Fragment'

  const output = value[0]
  if (!output || output.type !== 'text') return 'Fragment'

  if (Array.isArray(output.content)) {
    return output.content
      .map((c) => (typeof c === 'string' ? c : (c as { text: string }).text ?? ''))
      .join('')
  }

  return output.content ?? 'Fragment'
}
