// ══════════════════════════════════════════════════════════════════════════════
// OpenRouter — Production-grade dynamic model router
// ══════════════════════════════════════════════════════════════════════════════
//
// TODAY (zero cost):
//   Every task → qwen/qwen3-coder:free ($0, 480B MoE)
//   Reading agents → google/gemini-flash-1.5:free ($0, 1M context)
//
// FUTURE (set PAID_USERS_GET_CLAUDE=true):
//   Paid users get smart/heavy models per task type
//
// Router capabilities:
//   ✅ Task-type awareness       — different models per task
//   ✅ Read/write separation     — Gemini reads, Qwen codes
//   ✅ Complexity awareness      — simple/medium/complex upgrades tier
//   ✅ Cost intelligence         — estimates tokens, downgrades if low credits
//   ✅ Automatic fallback        — re-executes with free model on failure
//   ✅ Temperature per task      — deterministic for code, creative for UI
//
// ══════════════════════════════════════════════════════════════════════════════

import * as Sentry from '@sentry/nextjs'
import { openai } from '@inngest/ai'
import type { OpenAiAiAdapter } from '@inngest/ai'

// ── Task types ────────────────────────────────────────────────────────────────
// Single source of truth — imported from the executor's task graph schema.
// 'planning' and 'lightweight' are router-only concepts used for agents that
// run outside the task executor (planner, title gen, response gen).
export type RouterTaskType =
  | 'ui'
  | 'backend'
  | 'db'
  | 'integration'
  | 'search'
  | 'fix'
  | 'planning'
  | 'lightweight'

// Re-export the executor's TaskType for callers who need it
export type { TaskType } from '@/execution/taskGraph'

// Internal alias — router uses the extended set
type TaskType = RouterTaskType

// ── Complexity levels ─────────────────────────────────────────────────────────
export type Complexity = 'simple' | 'medium' | 'complex'

// ── Model registry ────────────────────────────────────────────────────────────
const MODELS = {
  free: {
    fast:   'nvidia/nemotron-3-super-120b-a12b:free',   // $0 — coding, fast tasks
    smart:  'nvidia/nemotron-3-super-120b-a12b:free',   // $0 — same for now
    // fast:   'deepseek/deepseek-r1',   // $0 — coding, fast tasks
    // smart:  'deepseek/deepseek-r1',   // $0 — same for now
    // fast:   'qwen/qwen3-coder:free',   // $0 — coding, fast tasks
    // smart:  'qwen/qwen3-coder:free',   // $0 — same for now
    reader: 'google/gemini-flash-1.5:free', // $0 — 1M ctx, reading/planning
    // Uncomment when you have budget:
    // smart: 'deepseek/deepseek-v3.2',
    // smart: 'moonshotai/kimi-k2.6',
  },
  paid: {
    fast:   'openai/gpt-4o-mini',
    smart:  'deepseek/deepseek-v3.2',
    heavy:  'anthropic/claude-opus-4',
    reader: 'google/gemini-flash-1.5:free', // reader stays free even on paid — no benefit to upgrading
  },
} as const

// ── Temperature per task type ─────────────────────────────────────────────────
const TASK_TEMPERATURE: Record<TaskType, number> = {
  ui:          0.5,  // Creative — visual decisions
  backend:     0.2,  // Deterministic — logic
  db:          0.1,  // Very strict — schema/queries
  integration: 0.2,
  search:      0.1,  // Factual extraction
  fix:         0.1,  // Precise bug fixing
  planning:    0.3,  // Structured but flexible
  lightweight: 0.3,  // Title/response gen
}

// ── Read/write classification ─────────────────────────────────────────────────
// READ tasks: consume context, produce text. Large context window matters most.
// WRITE tasks: produce code files. Code quality matters most.

const READ_TASKS = new Set<TaskType>(['search', 'lightweight'])
// planning stays on Qwen — needs strict JSON output, not just large context

function isReadTask(taskType: TaskType): boolean {
  return READ_TASKS.has(taskType)
}

// ── Complexity classifier ─────────────────────────────────────────────────────
// Inspects prompt length + file count to decide if we need a stronger model.
// Simple → fast tier | Medium → smart tier | Complex → heavy tier (if paid)

export interface ComplexityHints {
  promptLength?:   number   // chars in the task description
  fileCount?:      number   // number of files the task touches
  hasTypeScript?:  boolean  // TS projects are generally more complex
}

export function classifyComplexity(hints: ComplexityHints): Complexity {
  const { promptLength = 0, fileCount = 0, hasTypeScript = false } = hints

  // Score each signal
  let score = 0
  if (promptLength > 500)   score += 1
  if (promptLength > 1500)  score += 1
  if (fileCount > 5)        score += 1
  if (fileCount > 15)       score += 1
  if (hasTypeScript)        score += 1

  if (score >= 4) return 'complex'
  if (score >= 2) return 'medium'
  return 'simple'
}

// ── Cost intelligence ─────────────────────────────────────────────────────────
// Rough token estimate from prompt length (1 token ≈ 4 chars).
// Used to downgrade model if estimated cost would exceed remaining credits.

const CHARS_PER_TOKEN = 4

// Approximate cost in credits per 1K tokens for each model tier
// (used for downgrade decisions — not for billing, which uses usage.ts)
const TIER_CREDIT_COST_PER_1K: Record<string, number> = {
  'qwen/qwen3-coder:free':          0,     // free
  'google/gemini-flash-1.5:free':   0,     // free
  'openai/gpt-4o-mini':             0.01,
  'deepseek/deepseek-v3.2':         0.03,
  'anthropic/claude-opus-4':        0.15,
}

function estimateTokenCost(promptChars: number, modelSlug: string): number {
  const tokens     = promptChars / CHARS_PER_TOKEN
  const costPer1K  = TIER_CREDIT_COST_PER_1K[modelSlug] ?? 0.1
  return (tokens / 1000) * costPer1K
}

function shouldDowngrade(
  promptLength:      number,
  modelSlug:         string,
  creditsRemaining:  number,
): boolean {
  const estimatedCost = estimateTokenCost(promptLength, modelSlug)
  return estimatedCost > creditsRemaining * 0.5 // downgrade if task would use >50% of remaining
}

// ── Strategy: task type + complexity → tier ──────────────────────────────────

function getModelTier(
  taskType:   TaskType,
  complexity: Complexity,
): 'fast' | 'smart' | 'heavy' | 'reader' {
  // Read-only tasks always use reader model regardless of complexity
  if (isReadTask(taskType)) return 'reader'

  switch (taskType) {
    case 'ui':
      // UI can be complex — large components need smarter model
      return complexity === 'complex' ? 'smart' : 'fast'

    case 'backend':
    case 'db':
    case 'integration':
      return complexity === 'complex' ? 'heavy' : 'smart'

    case 'fix':
      // Fix is always at least smart — bugs need careful reasoning
      return complexity === 'complex' ? 'heavy' : 'smart'

    case 'planning':
      // Planning always uses Qwen (strict JSON) — complexity upgrades to heavy on paid
      return complexity === 'complex' ? 'heavy' : 'smart'

    case 'lightweight':
      return 'reader'

    default:
      return 'fast'
  }
}

// ── Core model builder ────────────────────────────────────────────────────────

type OpenRouterModel = OpenAiAiAdapter & {
  run(messages: { role: string; content: string | unknown[] }[]): Promise<string>
}

const OPENROUTER_MAX_RETRIES = 3
const OPENROUTER_RETRY_BASE_MS = 1000

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function parseRetryAfter(res: Response, json: any): number {
  const headerValue = res.headers.get('Retry-After')
  if (headerValue) {
    const seconds = Number(headerValue)
    if (!Number.isNaN(seconds)) return seconds * 1000
  }

  if (json?.error?.metadata?.retry_after_seconds) {
    return Number(json.error.metadata.retry_after_seconds) * 1000
  }

  if (json?.error?.metadata?.retry_after_seconds_raw) {
    return Number(json.error.metadata.retry_after_seconds_raw) * 1000
  }

  return OPENROUTER_RETRY_BASE_MS
}

function buildModel(modelSlug: string, temperature: number): OpenRouterModel {
  const apiKey = process.env.OPENROUTER_API_KEY ?? ''
  const adapter = openai({
    apiKey,
    model: modelSlug,
    baseUrl: 'https://openrouter.ai/api/v1/',
    defaultParameters: {
      temperature,
    },
  }) as OpenAiAiAdapter

  return Object.assign(adapter, {
    async run(messages: { role: string; content: string | unknown[] }[]) {
      if (!process.env.OPENROUTER_API_KEY) {
        throw new Error(
          'OPENROUTER_API_KEY is not set. Add it to .env.local and your deployment environment.',
        )
      }

      let lastError: Error | undefined
      for (let attempt = 1; attempt <= OPENROUTER_MAX_RETRIES; attempt++) {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'HTTP-Referer':  process.env.NEXT_PUBLIC_APP_URL ?? 'https://isotope.app',
            'X-Title':       'Isotope',
          },
          body: JSON.stringify({
            model:       modelSlug,
            messages,
            max_tokens:  8192,
            temperature,
          }),
        })

        const text = await res.text()
        let data: any
        try {
          data = text ? JSON.parse(text) : null
        } catch {
          data = null
        }

        if (res.ok) {
          return data?.choices?.[0]?.message?.content ?? ''
        }

        const retryAfterMs = parseRetryAfter(res, data)
        const errorMessage = `OpenRouter API error ${res.status}: ${text}`
        lastError = new Error(errorMessage)

        const isRetryable = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504
        if (!isRetryable || attempt === OPENROUTER_MAX_RETRIES) {
          throw lastError
        }

        const backoffMs = Math.max(retryAfterMs, OPENROUTER_RETRY_BASE_MS * attempt)
        console.warn(
          `[openrouter] request throttled (status ${res.status}), retrying in ${backoffMs}ms (attempt ${attempt}/${OPENROUTER_MAX_RETRIES})`,
        )
        await wait(backoffMs)
      }

      throw lastError ?? new Error('OpenRouter API request failed')
    },
  })
}

// ── Dynamic model selection ───────────────────────────────────────────────────

export interface DynamicModelOptions {
  plan:              string
  taskType:          RouterTaskType  // accepts both executor types and router-only types
  creditsRemaining?: number
  complexity?:       ComplexityHints
}

/**
 * Returns the best model for the given plan + task type + complexity.
 *
 * Decision order:
 *  1. Read vs write — read tasks always go to Gemini Flash (large context)
 *  2. Free vs paid — free users always stay on free models
 *  3. Low credits — downgrade to free model regardless of plan
 *  4. Cost check — if estimated cost > 50% of remaining credits, downgrade
 *  5. Complexity — complex tasks upgrade tier (if paid and allowed)
 */
export function getDynamicModel(opts: DynamicModelOptions) {
  const { plan, taskType, creditsRemaining, complexity: complexityHints } = opts
  const temperature  = TASK_TEMPERATURE[taskType] ?? 0.3
  const paidEnabled  = process.env.PAID_USERS_GET_CLAUDE === 'true'
  const isPaid       = plan === 'pro' || plan === 'team'
  const isLowCredits = creditsRemaining !== undefined && creditsRemaining < 5

  // 1. Read tasks — always use reader model (Gemini Flash), free for everyone
  if (isReadTask(taskType)) {
    return buildModel(MODELS.free.reader, temperature)
  }

  // 2 & 3. Free users or low credits — always free coding model
  if (!isPaid || !paidEnabled || isLowCredits) {
    return buildModel(MODELS.free.fast, temperature)
  }

  // 4. Complexity classification
  const complexity = complexityHints
    ? classifyComplexity(complexityHints)
    : 'medium'

  // 5. Get tier from task type + complexity
  const tier      = getModelTier(taskType, complexity)
  const modelSlug = tier === 'reader'
    ? MODELS.paid.reader
    : MODELS.paid[tier as 'fast' | 'smart' | 'heavy']

  // 6. Cost intelligence — downgrade if this task would eat too many credits
  if (creditsRemaining !== undefined) {
    const promptLength = complexityHints?.promptLength ?? 1000
    if (shouldDowngrade(promptLength, modelSlug, creditsRemaining)) {
      console.log(
        `[model-router] Cost downgrade: ${modelSlug} → ${MODELS.free.fast} ` +
        `(estimated cost vs ${creditsRemaining} credits remaining)`,
      )
      Sentry.addBreadcrumb({
        message: `[model-router] cost downgrade`,
        data: { original: modelSlug, fallback: MODELS.free.fast, creditsRemaining },
        level: 'info',
      })
      return buildModel(MODELS.free.fast, temperature)
    }
  }

  return buildModel(modelSlug, temperature)
}

// ── Automatic fallback execution ──────────────────────────────────────────────
// Wraps any async call. If the primary model throws, automatically re-executes
// the fallbackFn with the free model — no manual retry needed at call sites.

export async function withFallback<T>(
  primary:     () => Promise<T>,
  fallback:    () => Promise<T>,
  context:     string,
): Promise<T> {
  try {
    return await primary()
  } catch (err) {
    Sentry.captureException(err, {
      extra: {
        context,
        fallbackModel: MODELS.free.fast,
        note: 'Automatically retrying with free model',
      },
    })
    console.warn(
      `[model-router] ${context} failed — automatically retrying with ${MODELS.free.fast}`,
    )
    // Execute the fallback — caller provides it so we don't need to reconstruct the call
    return await fallback()
  }
}

// ── Legacy exports — backwards compatibility ──────────────────────────────────

/** @deprecated Use getDynamicModel() */
export function getOpenRouterModel(plan: string) {
  const isPaid      = plan === 'pro' || plan === 'team'
  const paidEnabled = process.env.PAID_USERS_GET_CLAUDE === 'true'
  const modelSlug   = isPaid && paidEnabled ? MODELS.paid.fast : MODELS.free.fast
  return buildModel(modelSlug, 0.3)
}

/** Default Qwen model — for codeAgent/fixAgent direct use */
export const openRouterModel = buildModel(MODELS.free.fast, 0.3)

/** Gemini Flash — for reading agents (title, response, architecture map) */
export const readerModel = buildModel(MODELS.free.reader, 0.3)
