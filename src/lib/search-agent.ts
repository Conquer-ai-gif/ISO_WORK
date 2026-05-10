// ── Search Agent V2 ────────────────────────────────────────────────────────────
// Fetches library documentation via Tavily, summarizes with the free model,
// and caches results so every user benefits — even without Supabase configured.
//
// ── 3-Layer Cache (fastest → slowest, checked in order) ──────────────────────
//
//   Layer 1 — globalThis (in-process singleton)
//     Survives across requests on warm serverless instances.
//     Same pattern as the Prisma singleton in db.ts.
//     Zero cost, zero config. Resets on cold start only.
//
//   Layer 2 — Prisma DocCache (your existing Postgres DB)
//     Persists across cold starts and deploys.
//     Works for ALL users — no Supabase required.
//     Source of truth for the 30-day TTL.
//
//   Layer 3 — Supabase isotope_doc_cache (optional bonus)
//     Only used when the user has Supabase configured.
//     Kept for backwards compatibility — not the primary cache.
//
// ── Cache TTL: 30 days ────────────────────────────────────────────────────────
//   Library APIs change infrequently. 30 days is the industry standard
//   (Cursor, Lovable, Replit all use multi-week doc cache TTLs).
//
// ── Flow ─────────────────────────────────────────────────────────────────────
//   1. Build deterministic cache key: SHA-256(libraryName + description[:200])
//   2. Check globalThis → Prisma → Supabase (stop at first hit)
//   3. HIT  → warm upper layers → write to sandbox → return
//   4. MISS → Tavily strict → if thin, Tavily broad → summarize
//           → save to all available cache layers → write to sandbox → return

import * as Sentry from '@sentry/nextjs'
import * as crypto from 'crypto'
import { prisma } from '@/lib/db'

// ── Cache TTL ─────────────────────────────────────────────────────────────────
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

// ── Layer 1: globalThis singleton cache ──────────────────────────────────────
// Typed extension of globalThis — same pattern as Prisma in db.ts.
// Survives multiple requests on the same warm serverless instance.

type GlobalDocCache = Map<string, { summary: string; expiresAt: number }>

const globalForDocCache = global as unknown as { __isotopeDocCache?: GlobalDocCache }

function getGlobalCache(): GlobalDocCache {
  if (!globalForDocCache.__isotopeDocCache) {
    globalForDocCache.__isotopeDocCache = new Map()
  }
  return globalForDocCache.__isotopeDocCache
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SearchAgentOptions {
  libraryName:         string
  description:         string
  sandboxId:           string
  supabaseUrl?:        string
  supabaseServiceKey?: string
}

export interface SearchAgentResult {
  libraryName: string
  docFilePath: string
  summary:     string
  fromCache:   boolean
  cacheLayer:  'global' | 'prisma' | 'supabase' | 'none'
  confidence:  number  // 0–1
}

// ── Cache key ─────────────────────────────────────────────────────────────────
// SHA-256 of libraryName + first 200 chars of description.
// Same library, same intent → same cache entry.
// Different description (different use case) → different entry.

function buildCacheKey(libraryName: string, description: string): string {
  const raw = `${libraryName.toLowerCase()}::${description.slice(0, 200)}`
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32)
}

// ── Confidence scoring ────────────────────────────────────────────────────────
// Heuristic 0–1 score. Below 0.4 triggers broader Tavily fallback.

function scoreConfidence(rawDocs: string, sourceCount: number): number {
  let score = 0
  if (sourceCount >= 3)               score += 0.3
  else if (sourceCount >= 1)          score += 0.15
  if (rawDocs.length > 2000)          score += 0.2
  if (/import\s+{/.test(rawDocs))     score += 0.2
  if (/\w+\(.*\)/.test(rawDocs))      score += 0.15
  if (/example|usage/i.test(rawDocs)) score += 0.15
  return Math.min(1, score)
}

// ── Layer 1 helpers: globalThis ───────────────────────────────────────────────

function checkGlobalCache(cacheKey: string): string | null {
  const cache = getGlobalCache()
  const entry = cache.get(cacheKey)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(cacheKey)
    return null
  }
  return entry.summary
}

function saveToGlobalCache(cacheKey: string, summary: string): void {
  getGlobalCache().set(cacheKey, {
    summary,
    expiresAt: Date.now() + THIRTY_DAYS_MS,
  })
}

// ── Layer 2 helpers: Prisma DocCache ─────────────────────────────────────────

async function checkPrismaCache(cacheKey: string): Promise<string | null> {
  try {
    const entry = await prisma.docCache.findUnique({
      where: { cacheKey },
      select: { summary: true, expiresAt: true },
    })
    if (!entry) return null
    if (new Date() > entry.expiresAt) {
      // Expired — delete asynchronously so we don't block
      prisma.docCache.delete({ where: { cacheKey } }).catch(() => null)
      return null
    }
    return entry.summary
  } catch (e) {
    // DB unavailable — degrade gracefully
    Sentry.captureException(e, { extra: { context: 'search-agent:prisma-cache-read', cacheKey } })
    return null
  }
}

async function saveToPrismaCache(
  cacheKey:    string,
  libraryName: string,
  summary:     string,
): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS)
    await prisma.docCache.upsert({
      where:  { cacheKey },
      update: { summary, cachedAt: new Date(), expiresAt },
      create: { cacheKey, libraryName, summary, expiresAt },
    })
  } catch (e) {
    // Non-fatal — generation continues without cache write
    Sentry.captureException(e, { extra: { context: 'search-agent:prisma-cache-write', libraryName } })
    console.error('[search-agent] Prisma cache write failed:', e)
  }
}

// ── Layer 3 helpers: Supabase (optional) ─────────────────────────────────────

function getSupabaseClient(url: string, key: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require('@supabase/supabase-js')
  return createClient(url, key)
}

async function checkSupabaseCache(
  cacheKey:    string,
  supabaseUrl: string,
  supabaseKey: string,
): Promise<string | null> {
  try {
    const supabase = getSupabaseClient(supabaseUrl, supabaseKey)
    const { data } = await supabase
      .from('isotope_doc_cache')
      .select('summary, cached_at')
      .eq('cache_key', cacheKey)
      .single()

    if (!data) return null

    const ageMs = Date.now() - new Date(data.cached_at).getTime()
    if (ageMs > THIRTY_DAYS_MS) return null

    return data.summary as string
  } catch {
    return null
  }
}

async function saveToSupabaseCache(
  cacheKey:    string,
  libraryName: string,
  summary:     string,
  supabaseUrl: string,
  supabaseKey: string,
): Promise<void> {
  try {
    const supabase = getSupabaseClient(supabaseUrl, supabaseKey)
    await supabase.from('isotope_doc_cache').upsert({
      cache_key:    cacheKey,
      library_name: libraryName,
      summary,
      cached_at:    new Date().toISOString(),
    })
  } catch (e) {
    console.error('[search-agent] Supabase cache write failed:', e)
  }
}

// ── Tavily fetcher ─────────────────────────────────────────────────────────────

async function fetchFromTavily(
  query: string,
  mode:  'strict' | 'broad' = 'strict',
): Promise<{ content: string; sourceCount: number }> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) return { content: '', sourceCount: 0 }  // No key — degrade gracefully

  const body: Record<string, unknown> = {
    api_key:             apiKey,
    query,
    search_depth:        'advanced',
    include_answer:      true,
    include_raw_content: false,
    max_results:         5,
  }

  if (mode === 'strict') {
    body.include_domains = [
      'npmjs.com', 'github.com', 'docs.github.com',
      'react.dev', 'nextjs.org', 'vitejs.dev',
      'framer.com', 'tanstack.com', 'trpc.io',
      'prisma.io', 'supabase.com', 'stripe.com',
      'resend.com', 'clerk.com', 'tailwindcss.com',
    ]
  }

  const res = await fetch('https://api.tavily.com/search', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`Tavily error ${res.status}: ${await res.text()}`)
  const data = await res.json()

  const parts: string[] = []
  if (data.answer) parts.push(`## Summary\n${data.answer}`)
  const results = (data.results ?? []).slice(0, 3)
  for (const result of results) {
    if (result.content) parts.push(`## From ${result.url}\n${result.content}`)
  }

  return { content: parts.join('\n\n'), sourceCount: results.length }
}

// ── Summarizer ────────────────────────────────────────────────────────────────

async function summarizeWithFreeModel(
  libraryName: string,
  description: string,
  rawDocs:     string,
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set')

  const truncated = rawDocs.slice(0, 12000)

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer':  process.env.NEXT_PUBLIC_APP_URL ?? 'https://isotope.app',
      'X-Title':       'Isotope',
    },
    body: JSON.stringify({
      model:       'google/gemini-flash-1.5:free',  // Reader model — summarizes docs, not coding
      max_tokens:  2000,
      temperature: 0.1,
      messages: [
        {
          role:    'system',
          content: `You are a documentation summarizer for an AI code generator.
Extract ONLY what a developer needs to USE the library in code:
- Import statements
- Key type definitions and interfaces
- Most important API methods with signatures and brief descriptions
- Common usage patterns with code examples
- Common pitfalls or gotchas

Output clean markdown. Max 1,500 words. Skip tutorials, changelog, contributor guides.`,
        },
        {
          role:    'user',
          content: `Summarize the ${libraryName} documentation.\nFocus on: ${description}\n\nRAW DOCUMENTATION:\n${truncated}`,
        },
      ],
    }),
  })

  if (!res.ok) throw new Error(`OpenRouter summarizer error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? rawDocs.slice(0, 3000)
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runSearchAgent(opts: SearchAgentOptions): Promise<SearchAgentResult> {
  const { libraryName, description, sandboxId, supabaseUrl, supabaseServiceKey } = opts
  const docFilePath = `docs/${libraryName.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}.md`
  const cacheKey    = buildCacheKey(libraryName, description)

  let summary:    string | null = null
  let cacheLayer: SearchAgentResult['cacheLayer'] = 'none'
  let confidence  = 1  // default for cached results — already validated on write

  // ── Layer 1: globalThis ───────────────────────────────────────────────────
  const global1 = checkGlobalCache(cacheKey)
  if (global1) {
    summary    = global1
    cacheLayer = 'global'
    Sentry.addBreadcrumb({ message: `[search-agent] globalThis hit: ${libraryName}`, level: 'info' })
    console.log(`[search-agent] globalThis cache hit: ${libraryName}`)
  }

  // ── Layer 2: Prisma DocCache ──────────────────────────────────────────────
  if (!summary) {
    const prismaHit = await checkPrismaCache(cacheKey)
    if (prismaHit) {
      summary    = prismaHit
      cacheLayer = 'prisma'
      // Warm the globalThis layer from Prisma hit
      saveToGlobalCache(cacheKey, prismaHit)
      Sentry.addBreadcrumb({ message: `[search-agent] Prisma hit: ${libraryName}`, level: 'info' })
      console.log(`[search-agent] Prisma cache hit: ${libraryName}`)
    }
  }

  // ── Layer 3: Supabase (only if configured) ────────────────────────────────
  if (!summary && supabaseUrl && supabaseServiceKey) {
    const supabaseHit = await checkSupabaseCache(cacheKey, supabaseUrl, supabaseServiceKey)
    if (supabaseHit) {
      summary    = supabaseHit
      cacheLayer = 'supabase'
      // Warm both upper layers from Supabase hit
      saveToGlobalCache(cacheKey, supabaseHit)
      await saveToPrismaCache(cacheKey, libraryName, supabaseHit)
      Sentry.addBreadcrumb({ message: `[search-agent] Supabase hit: ${libraryName}`, level: 'info' })
      console.log(`[search-agent] Supabase cache hit: ${libraryName}`)
    }
  }

  // ── Cache miss — fetch from Tavily ────────────────────────────────────────
  if (!summary) {
    Sentry.addBreadcrumb({ message: `[search-agent] all layers miss: ${libraryName}`, level: 'info' })
    console.log(`[search-agent] Cache miss — fetching via Tavily: ${libraryName}`)

    const query = `${libraryName} npm library documentation API reference ${description}`

    try {
      // Stage 1: strict official domains
      let { content: rawDocs, sourceCount } = await fetchFromTavily(query, 'strict')

      // No Tavily key or empty result — write a clean placeholder and skip summarizer
      if (!rawDocs) {
        const reason = !process.env.TAVILY_API_KEY
          ? 'TAVILY_API_KEY is not configured'
          : 'no results returned'
        console.log(`[search-agent] Skipping fetch for ${libraryName} — ${reason}`)
        summary    = `# ${libraryName}\n\n> Documentation unavailable (${reason}). Install with \`npm install ${libraryName}\` and refer to the official docs.`
        confidence = 0
      } else {
        confidence = scoreConfidence(rawDocs, sourceCount)

        // Stage 2: broader fallback if content is thin or confidence is low
        if (confidence < 0.4 || rawDocs.length < 500) {
          console.log(`[search-agent] Low confidence (${confidence.toFixed(2)}) — trying broader search`)
          const broader = await fetchFromTavily(query, 'broad')
          if (broader.content.length > rawDocs.length) {
            rawDocs     = broader.content
            sourceCount = broader.sourceCount
            confidence  = scoreConfidence(rawDocs, sourceCount)
          }
        }

        summary = await summarizeWithFreeModel(libraryName, description, rawDocs)
      }
    } catch (err) {
      Sentry.captureException(err, { extra: { context: 'search-agent:fetch', libraryName } })
      console.error(`[search-agent] Fetch failed for ${libraryName}:`, err)
      summary    = `# ${libraryName}\n\n> Documentation could not be fetched. Install with \`npm install ${libraryName}\` and refer to the official docs.`
      confidence = 0
    }

    // ── Save to all available cache layers ───────────────────────────────
    saveToGlobalCache(cacheKey, summary)
    await saveToPrismaCache(cacheKey, libraryName, summary)

    if (supabaseUrl && supabaseServiceKey) {
      await saveToSupabaseCache(cacheKey, libraryName, summary, supabaseUrl, supabaseServiceKey)
    }
  }

  // ── Write to sandbox for Code Agent ──────────────────────────────────────
  try {
    const { getSandbox } = await import('@/sandbox/sandboxManager')
    const sandbox = await getSandbox(sandboxId)
    const docContent = [
      `# ${libraryName} — Documentation Reference`,
      ``,
      `> Cache: ${cacheLayer === 'none' ? 'freshly fetched' : `hit (${cacheLayer})`} | Confidence: ${(confidence * 100).toFixed(0)}%`,
      ``,
      summary,
    ].join('\n')
    await sandbox.files.write(docFilePath, docContent)
  } catch (err) {
    // Non-fatal — sandbox write failure doesn't abort generation
    Sentry.captureException(err, { extra: { context: 'search-agent:sandbox-write', libraryName } })
    console.error(`[search-agent] Sandbox write failed for ${libraryName}:`, err)
  }

  return {
    libraryName,
    docFilePath,
    summary,
    fromCache:  cacheLayer !== 'none',
    cacheLayer,
    confidence,
  }
}
