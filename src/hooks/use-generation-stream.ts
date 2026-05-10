import { useState, useEffect, useRef } from 'react'
import type { ExecutionEventType } from '@/streaming/events'

export interface StreamEvent {
  type: ExecutionEventType
  taskId?: string
  data?: Record<string, unknown>
  timestamp: number
}

export type StreamStatus = 'idle' | 'streaming' | 'reconnecting' | 'completed' | 'failed'

export interface GenerationStreamState {
  events: StreamEvent[]
  status: StreamStatus
  /** ID of the task currently being executed, if any */
  currentTaskId: string | undefined
  /** Latest human-readable log line derived from the stream */
  latestLog: string | undefined
}

/** Priority order for deriving a human-readable log from an event */
function deriveLog(event: StreamEvent, fallback: string | undefined): string | undefined {
  // 1. Explicit narrative description attached by the backend
  const desc = event.data?.description as string | undefined
  if (desc) return desc

  // 2. Generic message field (used by `log` events)
  const msg = event.data?.message as string | undefined
  if (msg) return msg

  // 3. Synthesise from known event types
  switch (event.type) {
    case 'generation_started':  return 'Starting generation…'
    case 'task_started':        return event.taskId ? `Running ${event.taskId}…` : 'Running task…'
    case 'task_completed':      return 'Task complete'
    case 'task_failed':         return 'Task failed — retrying'
    case 'file_updated': {
      const path = event.data?.path as string | undefined
      return path ? `Writing ${path}` : 'Updating files…'
    }
    case 'validation_started':  return 'Type-checking…'
    case 'validation_passed':   return 'No type errors'
    case 'validation_failed':   return 'Type errors found — fixing…'
    case 'fix_started':         return 'Auto-fixing errors…'
    case 'fix_completed':       return 'Errors fixed'
    case 'generation_completed':return 'Generation complete'
    case 'generation_failed':   return 'Generation failed'
    default:                    return fallback
  }
}

const MAX_RECONNECT_ATTEMPTS = 1
const RECONNECT_DELAY_MS = 2000

/**
 * Subscribes to live generation progress for a given messageId via SSE.
 *
 * Resilience: on connection error, attempts one reconnect before marking as failed.
 * This handles Vercel/Cloudflare 30s timeouts on long builds.
 *
 * Pass `null` to keep the hook dormant (no connection opened).
 */
export function useGenerationStream(messageId: string | null): GenerationStreamState {
  const [state, setState] = useState<GenerationStreamState>({
    events: [],
    status: 'idle',
    currentTaskId: undefined,
    latestLog: undefined,
  })

  const esRef = useRef<EventSource | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const completedRef = useRef(false)

  useEffect(() => {
    if (!messageId) {
      setState({ events: [], status: 'idle', currentTaskId: undefined, latestLog: undefined })
      return
    }

    reconnectAttemptsRef.current = 0
    completedRef.current = false

    setState({ events: [], status: 'streaming', currentTaskId: undefined, latestLog: undefined })

    function connect(existingEvents: StreamEvent[] = []) {
      const es = new EventSource(`/api/generation/stream?messageId=${encodeURIComponent(messageId!)}`)
      esRef.current = es

      es.onmessage = (e: MessageEvent) => {
        try {
          const event = JSON.parse(e.data as string) as StreamEvent
          // Reset reconnect counter on successful message
          reconnectAttemptsRef.current = 0

          setState((prev) => {
            const events = [...prev.events, event]
            let status: StreamStatus = prev.status === 'reconnecting' ? 'streaming' : prev.status
            let currentTaskId = prev.currentTaskId
            let latestLog = deriveLog(event, prev.latestLog)

            switch (event.type) {
              case 'generation_completed':
                status = 'completed'
                completedRef.current = true
                break
              case 'generation_failed':
                status = 'failed'
                completedRef.current = true
                break
              case 'task_started':
                currentTaskId = event.taskId
                break
              case 'task_completed':
              case 'task_failed':
                if (currentTaskId === event.taskId) currentTaskId = undefined
                break
            }

            return { events, status, currentTaskId, latestLog }
          })
        } catch {
          // Ignore keepalive comments and parse errors
        }
      }

      es.onerror = () => {
        es.close()
        esRef.current = null

        // If generation already completed, don't attempt reconnect
        if (completedRef.current) return

        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current += 1
          setState((prev) => ({ ...prev, status: 'reconnecting', latestLog: 'Reconnecting…' }))

          setTimeout(() => {
            // Grab current events before reconnecting so we don't lose history
            setState((prev) => {
              connect(prev.events)
              return prev
            })
          }, RECONNECT_DELAY_MS)
        } else {
          setState((prev) =>
            prev.status === 'streaming' || prev.status === 'reconnecting'
              ? { ...prev, status: 'failed', latestLog: 'Connection lost' }
              : prev,
          )
        }
      }
    }

    connect()

    return () => {
      esRef.current?.close()
      esRef.current = null
    }
  }, [messageId])

  return state
}
