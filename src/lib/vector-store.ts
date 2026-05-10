// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 4: Vector Store — Component Deduplication
//
// Uses Supabase pgvector to store embeddings of every file ever written.
// Before the coding agent runs, we search for semantically similar components
// so the agent reuses existing work instead of rebuilding it.
//
// IMPORTANT: This uses the PROJECT'S Supabase instance (the generated app DB),
// NOT Prisma (which is the platform DB). Each project has its own Supabase.
//
// SETUP (one-time per Supabase project — add to PRODUCTION_CHECKLIST):
//   Run this SQL in your Supabase SQL editor:
//   CREATE EXTENSION IF NOT EXISTS vector;
//   CREATE TABLE IF NOT EXISTS isotope_component_store (
//     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     project_id text NOT NULL,
//     file_path text NOT NULL,
//     content text NOT NULL,
//     embedding vector(768),
//     created_at timestamptz DEFAULT now(),
//     updated_at timestamptz DEFAULT now(),
//     UNIQUE(project_id, file_path)
//   );
//   CREATE INDEX ON isotope_component_store USING ivfflat (embedding vector_cosine_ops);
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'

// Google text-embedding-004 via AI SDK — same provider already used for Gemini
async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY not set')

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text: text.slice(0, 8000) }] },
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Embedding API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  return data.embedding.values as number[]
}

function getSupabaseClient(supabaseUrl: string, supabaseServiceKey: string) {
  return createClient(supabaseUrl, supabaseServiceKey)
}

// ── Upsert files into vector store after generation ──────────────────────────
export async function upsertFilesToVectorStore({
  projectId,
  files,
  supabaseUrl,
  supabaseServiceKey,
}: {
  projectId: string
  files: { [path: string]: string }
  supabaseUrl: string
  supabaseServiceKey: string
}): Promise<void> {
  const supabase = getSupabaseClient(supabaseUrl, supabaseServiceKey)

  const entries = Object.entries(files).filter(([filePath, content]) => {
    if (!filePath.match(/\.(tsx?|jsx?|css|sql)$/)) return false
    if (content.length < 50) return false
    return true
  })

  // Embed in parallel with a concurrency cap of 5
  // Sequential was ~200ms × N files — 20 files = 4s. Parallel = ~1s for same set.
  const CONCURRENCY = 5
  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const batch = entries.slice(i, i + CONCURRENCY)
    await Promise.allSettled(
      batch.map(async ([filePath, content]) => {
        try {
          const embedding = await getEmbedding(`File: ${filePath}\n\n${content}`)
          await supabase.from('isotope_component_store').upsert(
            {
              project_id: projectId,
              file_path:  filePath,
              content:    content.slice(0, 10000),
              embedding,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'project_id,file_path' },
          )
        } catch (e) {
          console.error(`Vector upsert failed for ${filePath}:`, e)
        }
      }),
    )
  }
}

// ── Search for similar components before coding ───────────────────────────────
export async function searchSimilarComponents({
  projectId,
  query,
  supabaseUrl,
  supabaseServiceKey,
  limit = 5,
  threshold = 0.75,
}: {
  projectId: string
  query: string
  supabaseUrl: string
  supabaseServiceKey: string
  limit?: number
  threshold?: number
}): Promise<{ path: string; content: string; similarity: number }[]> {
  const supabase = getSupabaseClient(supabaseUrl, supabaseServiceKey)

  try {
    const embedding = await getEmbedding(query)

    const { data, error } = await supabase.rpc('match_components', {
      query_embedding: embedding,
      match_project_id: projectId,
      match_threshold: threshold,
      match_count: limit,
    })

    if (error) {
      console.error('Vector search error:', error)
      return []
    }

    return (data ?? []).map((row: { file_path: string; content: string; similarity: number }) => ({
      path: row.file_path,
      content: row.content,
      similarity: row.similarity,
    }))
  } catch (e) {
    console.error('Vector search failed:', e)
    return []
  }
}

// ── Format search results for agent context ───────────────────────────────────
export function formatComponentMatches(
  matches: { path: string; content: string; similarity: number }[]
): string {
  if (matches.length === 0) return ''

  const lines = matches.map(
    (m) =>
      `<existing_component path="${m.path}" similarity="${Math.round(m.similarity * 100)}%">\n${m.content.slice(0, 1500)}\n</existing_component>`
  )

  return `
═══════════════════════════════════════════════════════
EXISTING COMPONENTS — reuse these, do NOT rebuild them
═══════════════════════════════════════════════════════
${lines.join('\n\n')}
`
}

// ── Archive a message into project memory ─────────────────────────────────────
// Called after each generation — embeds user prompt + AI summary
export async function archiveProjectMemory({
  projectId,
  userId,
  userPrompt,
  aiSummary,
  supabaseUrl,
  supabaseServiceKey,
}: {
  projectId: string
  userId: string
  userPrompt: string
  aiSummary: string
  supabaseUrl: string
  supabaseServiceKey: string
}): Promise<void> {
  const supabase = getSupabaseClient(supabaseUrl, supabaseServiceKey)

  const entries = [
    { role: 'user',      content: userPrompt },
    { role: 'assistant', content: aiSummary  },
  ]

  for (const entry of entries) {
    try {
      const embedding = await getEmbedding(entry.content.slice(0, 8000))
      await supabase.from('isotope_chat_memory').upsert({
        project_id: projectId,
        user_id:    userId,
        role:       entry.role,
        content:    entry.content.slice(0, 5000),
        embedding,
        created_at: new Date().toISOString(),
      })
    } catch (e) {
      console.error(`[vector-store] archiveProjectMemory failed for ${entry.role}:`, e)
    }
  }
}

// ── Search project memory for relevant past context ───────────────────────────
export async function searchProjectMemory({
  projectId,
  query,
  supabaseUrl,
  supabaseServiceKey,
  limit = 3,
  threshold = 0.70,
}: {
  projectId: string
  query: string
  supabaseUrl: string
  supabaseServiceKey: string
  limit?: number
  threshold?: number
}): Promise<{ role: string; content: string; similarity: number; createdAt: string }[]> {
  const supabase = getSupabaseClient(supabaseUrl, supabaseServiceKey)

  try {
    const embedding = await getEmbedding(query)

    const { data, error } = await supabase.rpc('match_memories', {
      query_embedding:  embedding,
      match_project_id: projectId,
      match_threshold:  threshold,
      match_count:      limit,
    })

    if (error) {
      console.error('[vector-store] searchProjectMemory error:', error)
      return []
    }

    return (data ?? []).map((row: { role: string; content: string; similarity: number; created_at: string }) => ({
      role:       row.role,
      content:    row.content,
      similarity: row.similarity,
      createdAt:  row.created_at,
    }))
  } catch (e) {
    console.error('[vector-store] searchProjectMemory failed:', e)
    return []
  }
}

// ── Format memory matches for agent context injection ─────────────────────────
export function formatMemoryMatches(
  matches: { role: string; content: string; similarity: number; createdAt: string }[]
): string {
  if (matches.length === 0) return ''

  const lines = matches.map((m) => {
    const date = new Date(m.createdAt).toLocaleDateString('en', { dateStyle: 'medium' })
    const label = m.role === 'user' ? 'User asked' : 'Isotope built'
    return `[${date}] ${label}: ${m.content.slice(0, 300)}`
  })

  return `
═══════════════════════════════════════════════════════
PAST PROJECT CONTEXT — relevant decisions from previous sessions
═══════════════════════════════════════════════════════
${lines.join('\n')}
`
}
