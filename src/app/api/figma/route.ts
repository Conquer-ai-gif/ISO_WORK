// ── Figma Import Route ────────────────────────────────────────────────────────
// Used by figma-import.tsx on the home page (not the tRPC procedure).
// Fixes applied vs original:
//   - Reads user's own Figma token from IntegrationConfig first (Bug 67)
//   - Graceful error with Integrations page link if no token found (Bug 73 advice)
//   - V2 preflight credit check instead of V1 upfront charge (Bug 72b)
//   - messageId captured and passed to Inngest (Bug 72c)
//   - Typed error handling — no more catch (e: any) (Bug 72d)

import { NextRequest } from 'next/server'
import { auth }        from '@clerk/nextjs/server'
import { figmaToPrompt, parseFigmaUrl } from '@/lib/figma'
import { prisma }      from '@/lib/db'
import { inngest }     from '@/inngest/client'
import { generateSlug } from 'random-word-slugs'
import { estimateCostFromTaskGraph } from '@/lib/usage'
import { decrypt }     from '@/lib/encryption'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { figmaUrl } = body as { figmaUrl?: string }

  if (!figmaUrl || typeof figmaUrl !== 'string') {
    return Response.json({ error: 'figmaUrl is required' }, { status: 400 })
  }

  if (!parseFigmaUrl(figmaUrl)) {
    return Response.json({
      error: 'Invalid Figma URL. Paste a link from figma.com/file/... or figma.com/design/...',
    }, { status: 400 })
  }

  // ── Resolve Figma token — user's own token first, env var fallback ──────────
  let figmaAccessToken: string | null = null

  const figmaIntegration = await prisma.integrationConfig.findFirst({
    where:  { project: { userId }, provider: 'figma_token' },
    select: { encryptedKey: true, iv: true },
  })
  if (figmaIntegration?.encryptedKey && figmaIntegration.iv) {
    try {
      figmaAccessToken = decrypt(figmaIntegration.encryptedKey, figmaIntegration.iv)
    } catch { /* decryption failed — fall through */ }
  }

  if (!figmaAccessToken) figmaAccessToken = process.env.FIGMA_ACCESS_TOKEN ?? null

  if (!figmaAccessToken) {
    return Response.json({
      error: 'no_figma_token',  // sentinel value checked by figma-import.tsx
      message: 'No Figma token found. Add your personal Figma access token in Settings → Integrations → Figma Token.',
    }, { status: 412 })
  }

  // ── Preflight credit check — V2 (charges after execution, not before) ───────
  const estimate = await estimateCostFromTaskGraph(userId, { tasks: 1 })
  if (!estimate.allowed) {
    return Response.json({
      error: 'You have run out of credits.',
      required: estimate.estimatedCost,
      balance:  estimate.balance,
    }, { status: 429 })
  }

  // ── Fetch and convert Figma design ──────────────────────────────────────────
  // Temporarily set token for figmaToPrompt (reads from env internally)
  const originalToken = process.env.FIGMA_ACCESS_TOKEN
  process.env.FIGMA_ACCESS_TOKEN = figmaAccessToken

  let prompt:          string
  let screenshotBase64: string | null
  let pageName:         string

  try {
    ;({ prompt, screenshotBase64, pageName } = await figmaToPrompt(figmaUrl))
  } catch (err) {
    process.env.FIGMA_ACCESS_TOKEN = originalToken
    const message = err instanceof Error ? err.message : 'Failed to fetch Figma design'
    return Response.json({ error: message }, { status: 400 })
  } finally {
    process.env.FIGMA_ACCESS_TOKEN = originalToken
  }

  // ── Create project + capture messageId ───────────────────────────────────────
  const project = await prisma.project.create({
    data: {
      userId,
      name: generateSlug(2, { format: 'kebab' }),
      messages: {
        create: {
          content:  `Import Figma design: ${pageName} (${figmaUrl})`,
          role:     'USER',
          type:     'RESULT',
          imageUrl: screenshotBase64,
        },
      },
    },
    include: { messages: { select: { id: true }, take: 1 } },
  })

  const messageId = project.messages[0]?.id
  if (!messageId) {
    return Response.json({ error: 'Failed to create project message' }, { status: 500 })
  }

  // ── Fire Inngest — V2 billing charges after execution completes ──────────────
  await inngest.send({
    name: 'code-agent/run',
    data: { value: prompt, projectId: project.id, messageId, imageUrl: screenshotBase64, figmaUrl },
  })

  return Response.json({ projectId: project.id, pageName })
}
