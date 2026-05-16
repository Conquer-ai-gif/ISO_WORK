import { EventEmitter } from 'events'
import { type Task, type TaskGraph } from './taskGraph'
import { type ExecutionEvent, type EventEmitter as EventEmitterFn, makeEvent } from '@/streaming/events'

export type { TaskGraph, Task }

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed'

export interface ExecutionContext {
  sandboxId: string
  tools: Record<string, unknown>
  emit: EventEmitterFn
  step?: any  // Inngest step context for tool durability
}

export interface AgentRunner {
  run: (task: Task, context: ExecutionContext) => Promise<unknown>
}

export interface ExecutorOptions {
  maxRetries?: number
  agents: Record<string, AgentRunner>
  validate?: (task: Task, context: ExecutionContext) => Promise<void>
}

export class TaskExecutor extends EventEmitter {
  private tasks: Map<string, Task & { status: TaskStatus; attempts: number }>
  private options: Required<Pick<ExecutorOptions, 'maxRetries'>> & ExecutorOptions
  private ctx: ExecutionContext

  constructor(taskGraph: TaskGraph, context: ExecutionContext, options: ExecutorOptions) {
    super()
    this.ctx = context
    this.options = { maxRetries: 3, ...options }

    this.tasks = new Map(
      taskGraph.tasks
        .sort((a, b) => a.priority - b.priority)
        .map((t) => [t.id, { ...t, status: 'pending' as TaskStatus, attempts: 0 }]),
    )
  }

  async run(): Promise<void> {
    this.ctx.emit(makeEvent('generation_started'))

    while (!this.allFinished()) {
      const ready = this.getReadyTasks()

      if (ready.length === 0) {
        const stuck = Array.from(this.tasks.values()).filter(
          (t) => t.status === 'pending' || t.status === 'running',
        )
        throw new Error(
          `Deadlock detected — no tasks can proceed. Stuck: ${stuck.map((t) => t.id).join(', ')}`,
        )
      }

      // Run all ready tasks in parallel — each stores its result on _result
      await Promise.all(ready.map((t) => this.executeTask(t)))

      // ── Merge results after the wave completes ─────────────────────────────
      // Done here — NOT inside executeTask — to avoid race conditions on
      // shared state when multiple tasks run concurrently via Promise.all.
      for (const task of ready) {
        const t = task as typeof task & { _result?: { files: Record<string, string>; summary: string } }
        if (t._result && t.status === 'done') {
          this.emit('task:result', { taskId: t.id, result: t._result })
          delete t._result
        }
      }
    }

    const anyFailed = Array.from(this.tasks.values()).some((t) => t.status === 'failed')

    if (anyFailed) {
      const failed = Array.from(this.tasks.values())
        .filter((t) => t.status === 'failed')
        .map((t) => t.id)
      this.ctx.emit(makeEvent('generation_failed', { data: { failedTasks: failed } }))
      throw new Error(`Generation failed — tasks did not complete: ${failed.join(', ')}`)
    }

    this.ctx.emit(makeEvent('generation_completed'))
  }

  private getReadyTasks(): Array<Task & { status: TaskStatus; attempts: number }> {
    return Array.from(this.tasks.values()).filter((task) => {
      if (task.status !== 'pending') return false
      return task.dependsOn.every((depId) => this.tasks.get(depId)?.status === 'done')
    })
  }

  private async executeTask(
    task: Task & { status: TaskStatus; attempts: number },
  ): Promise<void> {
    task.status = 'running'
    task.attempts += 1

    this.ctx.emit(makeEvent('task_started', { taskId: task.id, data: { type: task.type } }))

    try {
      const agent = this.options.agents[task.type]
      if (!agent) throw new Error(`No agent registered for task type "${task.type}"`)

      await agent.run(task, this.ctx)

      if (this.options.validate) {
        this.ctx.emit(makeEvent('validation_started', { taskId: task.id }))
        await this.options.validate(task, this.ctx)
        this.ctx.emit(makeEvent('validation_passed', { taskId: task.id }))
      }

      task.status = 'done'
      this.ctx.emit(makeEvent('task_completed', { taskId: task.id }))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)

      this.ctx.emit(
        makeEvent('task_failed', { taskId: task.id, data: { error: message, attempt: task.attempts } }),
      )

      if (task.attempts < (this.options.maxRetries ?? 3)) {
        task.status = 'pending'
        this.ctx.emit(
          makeEvent('log', {
            taskId: task.id,
            data: { message: `Retrying task ${task.id} (attempt ${task.attempts} of ${this.options.maxRetries})` },
          }),
        )
      } else {
        task.status = 'failed'
      }
    }
  }

  private allFinished(): boolean {
    return Array.from(this.tasks.values()).every(
      (t) => t.status === 'done' || t.status === 'failed',
    )
  }

  getTaskStates(): Array<{ id: string; type: string; status: TaskStatus; attempts: number }> {
    return Array.from(this.tasks.values()).map(({ id, type, status, attempts }) => ({
      id,
      type,
      status,
      attempts,
    }))
  }
}
