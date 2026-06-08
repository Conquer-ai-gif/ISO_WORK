// src/inngest/client.ts
import { Inngest } from 'inngest'

export const inngest = new Inngest({
  id: 'isotope',
  isDev: process.env.NODE_ENV === 'development',
})

export const INNGEST_DEV_HINT =
  'Start the Inngest dev server in a second terminal: pnpm dev:inngest'

function isInngestConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (err.message.includes('fetch failed')) return true
  const cause = (err as Error & { cause?: { code?: string } }).cause
  return cause?.code === 'ECONNREFUSED' || cause?.code === 'ENOTFOUND'
}

/** Sends an Inngest event; surfaces a actionable message when the dev server is down. */
export async function sendInngestEvent(
  ...args: Parameters<typeof inngest.send>
): ReturnType<typeof inngest.send> {
  try {
    return await inngest.send(...args)
  } catch (err) {
    if (isInngestConnectionError(err)) {
      throw new Error(`${INNGEST_DEV_HINT} (could not reach Inngest at localhost:8288)`)
    }
    throw err
  }
}