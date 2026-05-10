import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/db'
import { cleanupGenerationEvents } from '@/lib/generationEvents'

const POLL_INTERVAL_MS = 2000         // check DB every 2 seconds — halves DB load vs 1s with no UX impact
const MAX_STREAM_DURATION_MS = 600_000 // hard stop at 10 minutes

const TERMINAL_EVENTS = new Set(['generation_completed', 'generation_failed'])

/**
 * GET /api/generation/stream?messageId=xxx
 *
 * Server-Sent Events endpoint.  The client opens this and receives
 * one JSON payload per `data:` line as tasks complete during AI generation.
 *
 * Event shape mirrors ExecutionEvent from src/streaming/events.ts:
 *   { type, taskId?, data?, timestamp }
 */
export async function GET(req: NextRequest) {
  // ── Auth check — prevent any user from watching another user's stream ───────
  const { userId } = await auth()
  if (!userId) {
    return new Response('Unauthorized', { status: 401 })
  }

  const messageId = req.nextUrl.searchParams.get('messageId')
  if (!messageId) {
    return new Response('Missing messageId query param', { status: 400 })
  }

  // Verify the message belongs to this user
  const message = await prisma.message.findFirst({
    where: {
      id: messageId,
      project: {
        OR: [
          { userId },
          { workspace: { members: { some: { userId } } } },
        ],
      },
    },
    select: { id: true },
  })

  if (!message) {
    return new Response('Message not found or access denied', { status: 403 })
  }

  let lastSeq = 0
  let done = false
  const startedAt = Date.now()

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()

      const send = (payload: string) => {
        try {
          controller.enqueue(enc.encode(`data: ${payload}\n\n`))
        } catch {
          done = true
        }
      }

      // Send a comment frame every 20s to prevent proxy timeouts
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(enc.encode(': keepalive\n\n'))
        } catch {
          done = true
        }
      }, 20_000)

      while (!done && Date.now() - startedAt < MAX_STREAM_DURATION_MS) {
        try {
          const events = await prisma.generationEvent.findMany({
            where: { messageId, seq: { gt: lastSeq } },
            orderBy: { seq: 'asc' },
            take: 50,
          })

          for (const ev of events) {
            send(
              JSON.stringify({
                type: ev.type,
                taskId: ev.taskId ?? undefined,
                data: ev.data ?? undefined,
                timestamp: ev.createdAt.getTime(),
              }),
            )
            lastSeq = ev.seq

            if (TERMINAL_EVENTS.has(ev.type)) {
              done = true
              break
            }
          }
        } catch (err) {
          console.error('[stream] DB poll error:', err)
        }

        if (!done) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
        }
      }

      clearInterval(keepalive)
      try { controller.close() } catch { /* already closed */ }

      // Clean up GenerationEvent rows now that streaming is done
      // Fire-and-forget — don't block stream close on DB operation
      cleanupGenerationEvents(messageId).catch((e) => {
        console.error('[stream] cleanup failed:', e)
      })
    },

    cancel() {
      done = true
      // Client disconnected before generation completed — clean up stale rows
      cleanupGenerationEvents(messageId).catch((e) => {
        console.error('[stream] cancel cleanup failed:', e)
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering
    },
  })
}
