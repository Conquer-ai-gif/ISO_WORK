export type ExecutionEventType =
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  | 'file_updated'
  | 'validation_started'
  | 'validation_passed'
  | 'validation_failed'
  | 'fix_started'
  | 'fix_completed'
  | 'log'
  | 'generation_started'
  | 'generation_completed'
  | 'generation_failed'

export interface ExecutionEvent {
  type: ExecutionEventType
  taskId?: string
  data?: Record<string, unknown>
  timestamp: number
}

export function makeEvent(
  type: ExecutionEventType,
  payload?: { taskId?: string; data?: Record<string, unknown> },
): ExecutionEvent {
  return {
    type,
    taskId: payload?.taskId,
    data: payload?.data,
    timestamp: Date.now(),
  }
}

export type EventEmitter = (event: ExecutionEvent) => void

export type EventEmitterFn = EventEmitter

export function noopEmitter(): EventEmitter {
  return () => undefined
}
