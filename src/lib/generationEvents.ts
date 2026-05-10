import { prisma } from '@/lib/db'
import type { ExecutionEvent } from '@/streaming/events'

/**
 * Returns a fire-and-forget event emitter that writes ExecutionEvents
 * to the GenerationEvent table. The SSE endpoint polls this table.
 *
 * Usage inside Inngest functions:
 *   const emit = createDbEmitter(messageId)
 *   await runCodeAgent({ ..., emit })
 */
export function createDbEmitter(messageId: string): (event: ExecutionEvent) => void {
  return (event: ExecutionEvent): void => {
    prisma.generationEvent
      .create({
        data: {
          messageId,
          type: event.type,
          taskId: event.taskId ?? null,
          data: (event.data as object) ?? {},
        },
      })
      .catch((err) => {
        console.error('[generationEvents] Failed to write event:', err)
      })
  }
}

/**
 * Clean up all events for a messageId once streaming is complete.
 * Call after the SSE stream closes to keep the table lean.
 */
export async function cleanupGenerationEvents(messageId: string): Promise<void> {
  await prisma.generationEvent.deleteMany({ where: { messageId } }).catch((e) => {
    console.error(`Failed to cleanup generation events for message ${messageId}:`, e);
  });
}
