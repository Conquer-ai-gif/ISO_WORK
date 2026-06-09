# Isotope — Codebase Notes

This file tracks architectural decisions, known issues, fixes applied, and production
deployment steps. It lives alongside `INSTRUCTIONS.md` (dev setup) and `PRODUCTION_CHECKLIST.md`.

---

## Architecture Overview

```
User Prompt
    ↓
[Plan Phase]     generateTaskGraph()  →  Zod-validated TaskGraph (max 15 tasks)
    ↓
[Human Gate]     PlanApproval UI      →  Approve / Edit tasks / Reject
    ↓
[Exec Phase]     TaskExecutor         →  Wave-based parallel DAG
    ├── Wave 1: tasks with no deps run in parallel via Promise.all
    ├── Wave 2: tasks whose deps are all 'done'
    └── ... until all tasks are done or failed
    ↓
[Per-task]       runTsc()             →  TypeScript validation
                 runFixAgent()        →  Auto-fix on type errors
    ↓
[Post-gen]       vector store upsert + project memory archive
    ↓
Fragment saved → SSE stream (DB-polled) → UI updated
```

### Key Design Decisions

- **TaskExecutor merges results AFTER each wave** (not inside executeTask) to avoid
  race conditions when tasks run concurrently via Promise.all.
- **DB-backed event emitter** (`createDbEmitter`) decouples execution from transport —
  the SSE endpoint just polls `GenerationEvent` rows. Safe on serverless.
- **Persistent E2B sandbox per project** — `project.sandboxId` is reused across
  generations. Falls back to a new sandbox if the old one expired.
- **Plan phase runs first and pauses** — the Inngest function returns
  `{ status: 'awaiting_approval' }` after storing the plan. The coding phase only
  runs when the plan status is set to `approved` via tRPC mutation.

---

## Fixes Applied

### 2026-05-03

#### 1. `userId` undeclared in `archive-project-memory` step (`src/inngest/functions.ts`)
**Problem:** `userId` was used in the `archive-project-memory` step but never declared
in scope — the coding phase only destructured `{ messageId, projectId, value, imageUrl }`
from `event.data`. This would throw `ReferenceError: userId is not defined` at runtime
whenever a user had Supabase configured.

**Fix:** Refactored the `get-user-plan` step to return both `userPlan` and `userId`
from the same DB query (no extra round-trip). The destructured `userId` is now in
scope for the entire coding phase.

```ts
// Before
const userPlan = await step.run('get-user-plan', async () => { ... return plan })

// After
const { userPlan, userId } = await step.run('get-user-plan', async () => {
  ...
  return { userPlan: credits?.plan ?? 'free', userId: project.userId }
})
```

#### 2. Orphaned `inngest2.ts` at project root
**Problem:** An old Gemini-based single-agent draft was sitting at the project root.
It referenced `gemini()` from AgentKit and a deprecated `PROMPT` export — neither
compatible with the current architecture. Not imported anywhere but caused confusion.

**Fix:** Deleted the file.

#### 3. Stale Claude model string (`src/lib/openrouter.ts`)
**Problem:** `CLAUDE_MODEL` was set to `'anthropic/claude-sonnet-4-5'`. The current
model slug on OpenRouter is `claude-sonnet-4-6`.

**Fix:** Updated to `'anthropic/claude-sonnet-4-6'`.

#### 4. Bare error boundary fallback (`src/app/projects/[projectId]/page.tsx`)
**Problem:** `<ErrorBoundary fallback={<p>Error!</p>}>` — plain text, no recovery path,
no context for the user. Also used the deprecated `fallback` prop instead of
`FallbackComponent` (which receives `resetErrorBoundary`).

**Fix:** Replaced with a proper `ProjectErrorFallback` component that shows an icon,
a human-readable message, and a "Try again" button that calls `resetErrorBoundary()`.
Also replaced `<p>loading..</p>` Suspense fallback with a centred spinner.

---

## Production Deployment Notes

> Add any step here that is required when going to production but not needed locally.

### Environment Variables
All required vars are documented in `INSTRUCTIONS.md`. Before deploying:
- Confirm `ENCRYPTION_SECRET` is exactly 32 characters — keys encrypted with a
  different value will be unreadable after the fact.
- Set `PAID_USERS_GET_CLAUDE=true` in Vercel env vars to enable Claude Sonnet for
  paid users (costs OpenRouter credits). Leave unset or `false` to use Qwen for all.
- `NEXT_PUBLIC_APP_URL` must be set to your production domain — it is used in the
  `HTTP-Referer` header sent to OpenRouter.

### Inngest
- Register the production webhook URL in the Inngest dashboard:
  `https://your-domain.com/api/inngest`
- Ensure `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` match the production app keys.
- Test by triggering a `code-agent/run` event from the Inngest dashboard after deploy.

### Database Migrations
Run `npx prisma migrate deploy` (not `dev`) in CI/CD before the app starts:
```bash
npx prisma migrate deploy
```
Never run `prisma migrate dev` in production — it can prompt interactively and
will drop/recreate the shadow database.

### E2B Sandbox Template
The sandbox template ID is hardcoded as `'isotope-git'` in `sandboxManager.ts`.
Ensure this template exists in your E2B account before going live. To verify:
```bash
e2b template list
```

### Clerk Webhooks
Register these events on your production Clerk webhook endpoint
(`https://your-domain.com/api/clerk/webhook`):
- `user.created`
- `user.deleted`
- `session.created`

Register billing webhook separately at `/api/clerk/billing-webhook`.

### Sentry
Source maps are uploaded during `next build` via `SENTRY_AUTH_TOKEN`. Ensure
this is set in your CI environment, not just Vercel env vars, if you build in CI.

### GitHub App
If using GitHub sync, the App's callback URL must match production:
`https://your-domain.com/api/github/webhook`

Update the GitHub App settings before switching DNS.

---

## Model Reference

| Tier | Model | Activated by |
|---|---|---|
| Free users | `qwen/qwen3-coder` | Default — always |
| Paid users | `anthropic/claude-sonnet-4-6` | `PAID_USERS_GET_CLAUDE=true` in env |
| Lightweight agents (title, response, arch map) | `qwen/qwen3-coder` | Always — `openRouterModel` constant |

---

## Known Limitations / Future Work

- `TaskExecutor` deadlock detection throws immediately when no tasks are ready but
  some are still `pending`. In practice this only fires on a malformed plan (bad
  `dependsOn` refs). The planner's Zod validation should catch this upstream.
- Conversation history is capped at 200 messages with a rolling summary for older
  ones. Long-running projects may lose nuanced early context.
- The `search` task type fetches and caches library docs into the sandbox but does
  not invalidate stale cache entries. Consider a TTL-based cache key.


---

## Changes — 2026-05-04 (3-prompt build)

### Prompt 1 — Search Agent V2 (`src/lib/search-agent.ts`)

Upgraded in place. Key changes:

- **Cache key is now a SHA-256 hash** of `libraryName + description.slice(0,200)` — prevents collisions across different use contexts for the same library name
- **In-memory fallback cache** (`Map`) — when Supabase is not configured, docs are cached for 7 days in process memory. On warm serverless instances this survives across requests at zero cost. Cold starts re-fetch — acceptable.
- **Tiered Tavily retrieval** — Stage 1 fetches from official/strict domains (npmjs, github, react.dev etc.). If confidence is below 0.4 or content is thin (<500 chars), Stage 2 does a broader search with no domain filter (StackOverflow, blogs, community).
- **Confidence scoring** — heuristic 0–1 score based on source count, content length, presence of import statements, function signatures, and usage examples.
- **Sentry breadcrumbs** on cache hit/miss and errors.
- **Fixed free model slug** — `qwen/qwen3-coder:free` (`:free` suffix is required for the zero-cost tier on OpenRouter).
- **Sandbox write is non-fatal** — wrapped in try/catch so a sandbox timeout doesn't abort the whole generation.

**Supabase schema note:** The cache table now needs a `cache_key` column (text, unique) in addition to `library_name`. Run this migration if upgrading from V1:
```sql
ALTER TABLE isotope_doc_cache ADD COLUMN IF NOT EXISTS cache_key text;
UPDATE isotope_doc_cache SET cache_key = encode(sha256((library_name || '::')::bytea), 'hex') WHERE cache_key IS NULL;
ALTER TABLE isotope_doc_cache ALTER COLUMN cache_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS isotope_doc_cache_cache_key_idx ON isotope_doc_cache (cache_key);
```

---

### Prompt 2 — Dynamic Model Router (`src/lib/openrouter.ts`)

Replaced `getOpenRouterModel(plan)` with `getDynamicModel({ plan, taskType, creditsRemaining })`.

**Model registry:**
```
FREE TIER (zero cost — works today with no API credits)
  fast:  qwen/qwen3-coder:free   ($0 — 480B MoE, correct free slug)
  smart: qwen/qwen3-coder:free   ($0 — same for now)

PAID TIER (activate with PAID_USERS_GET_CLAUDE=true)
  fast:  openai/gpt-4o-mini      (UI and search tasks)
  smart: deepseek/deepseek-v3.2  (backend, db, integration, fix)
  heavy: anthropic/claude-opus-4 (planning tasks only)
```

**Task → tier mapping:**
- `ui`, `search`, `lightweight` → fast
- `backend`, `db`, `integration`, `fix` → smart
- `planning` → heavy

**Temperature per task type:**
- ui: 0.5, backend: 0.2, db: 0.1, integration: 0.2, search: 0.1, fix: 0.1, planning: 0.3

**Credit-aware downgrade:** If `creditsRemaining < 5`, always uses free model regardless of plan.

`getOpenRouterModel()` kept as deprecated export — still used by lightweight agents (title gen, response gen, architecture map). These always use the free fast model.

**Bug fixed:** old slug `qwen/qwen3-coder` routed to the paid version. Corrected to `qwen/qwen3-coder:free`.

---

### Prompt 3 — V2 Billing System (`src/lib/usage.ts`)

**Core design — integer-scaled credits:**
The DB `balance` column is `Int`. To support fractional credit costs (0.2, 0.3) without a migration, all internal values are scaled ×10:
- 1 credit = 10 DB units
- Free plan: 5 credits = 50 units stored in DB
- `getUsageStatus()` divides by 10 before returning to UI

**Cost table (internal units):**
| Operation | Units | Credits |
|---|---|---|
| Base (always) | 2 | 0.2 |
| Per task | 2 | 0.2 |
| Per search | 3 | 0.3 |
| Per fix loop | 2 | 0.2 |
| Per embedding | 1 | 0.1 |

**`consumeCreditsV2()`** uses atomic `updateMany` with `balance: { gte: cost }` in the WHERE clause — if balance is insufficient the update returns `count: 0` and we throw. Race-condition safe without transactions.

**Charges happen AFTER execution** — `charge-credits-v2` Inngest step runs after the executor completes and the archive step finishes. If charging fails it is logged to Sentry but does not fail the generation response (non-fatal).

**`PLAN_FEATURES`** exported for task graph enforcement:
- free: maxTasks 3, maxFixLoops 1
- pro: maxTasks 10, maxFixLoops 3
- team: maxTasks 30, maxFixLoops 10

**Future migration path (decimal credits in DB):**
When ready to store true decimals, run:
```sql
ALTER TABLE "Credits" ALTER COLUMN balance TYPE FLOAT USING balance::float / 10;
```
Then remove `CREDIT_SCALE` from usage.ts and use raw values. No logic changes beyond that.



---

## Changes — Search Agent Cache Upgrade

### Problem solved
Users without Supabase had zero caching — Tavily was hit on every single generation.
The in-memory Map reset on every cold start, making it useless on serverless.

### 3-Layer Cache Architecture

```
runSearchAgent()
      │
      ▼
┌─────────────────────────────┐
│  Layer 1: globalThis        │  ← fastest, in-process singleton (db.ts pattern)
│  TTL: 30 days               │    survives warm requests, resets on cold start
└──────────┬──────────────────┘
           │ miss
           ▼
┌─────────────────────────────┐
│  Layer 2: Prisma DocCache   │  ← persistent, works for ALL users, no config needed
│  TTL: 30 days               │    survives cold starts and deploys
│  Table: DocCache (Postgres) │    warms Layer 1 on hit
└──────────┬──────────────────┘
           │ miss
           ▼
┌─────────────────────────────┐
│  Layer 3: Supabase          │  ← optional, only if user has Supabase configured
│  TTL: 30 days               │    warms Layers 1 + 2 on hit
└──────────┬──────────────────┘
           │ miss
           ▼
     Tavily fetch
     (strict → broad fallback)
           │
           ▼
     Summarize with Qwen
           │
           ▼
     Save to all available layers
```

### TTL change: 7 days → 30 days
Library APIs change infrequently. 30 days significantly reduces Tavily API spend.

### Required: run migration after download
```bash
npx prisma migrate dev --name add_doc_cache
```
This creates the `DocCache` table in your existing Postgres DB.

### DocCache schema added to prisma/schema.prisma
```prisma
model DocCache {
  id          String   @id @default(uuid())
  cacheKey    String   @unique
  libraryName String
  summary     String
  cachedAt    DateTime @default(now())
  expiresAt   DateTime

  @@index([cacheKey])
  @@index([expiresAt])
}
```

### Future: cleanup cron
Add an Inngest cron to purge expired DocCache rows monthly:
```ts
await prisma.docCache.deleteMany({ where: { expiresAt: { lt: new Date() } } })
```


---

## Find Work — Level 3 (Future Implementation)

Level 2 (live job feed) is live at `/find-work`.
Level 3 adds a **portfolio + hire me** layer on top of it as a second tab.

### What Level 3 Adds

```
/find-work
  ├── Tab: Browse Jobs    ← Level 2 (already built)
  └── Tab: My Portfolio   ← Level 3 (future)

/u/[username]             ← public hire page, no login needed
```

**My Portfolio tab (inside /find-work):**
- Grid of the user's public Isotope projects
- Each card shows: project name, description, live preview link, tech stack tags
- Tech stack auto-detected from generated file extensions and imports

**Public profile page (/u/[username]):**
- Avatar + name pulled from Clerk
- One-line bio (editable from settings)
- "Available for hire" toggle — shows a green badge on the profile
- Grid of public projects (same cards as the tab)
- Contact button — opens `mailto:` or a simple contact form

### Prisma Changes Needed for Level 3

```prisma
model UserProfile {
  id               String   @id @default(uuid())
  userId           String   @unique
  username         String   @unique   // used in /u/[username]
  bio              String?
  availableForHire Boolean  @default(false)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}
```

Migration:
```bash
npx prisma migrate dev --name add_user_profile
```

### Files To Create for Level 3

| File | Purpose |
|---|---|
| `src/app/u/[username]/page.tsx` | Public profile route — no auth required |
| `src/modules/find-work/ui/views/portfolio-view.tsx` | My Portfolio tab |
| `src/modules/find-work/ui/components/portfolio-card.tsx` | Project card on profile |
| `src/modules/find-work/ui/components/profile-header.tsx` | Avatar, bio, hire toggle |
| `src/modules/find-work/ui/components/find-work-tabs.tsx` | Tab switcher wrapping Level 2 + Level 3 |
| `src/modules/users/server/procedures.ts` | tRPC — getPublicProfile, updateProfile |

### Integration Note

When adding Level 3, wrap the existing `FindWorkView` in a tab component:
```tsx
<Tabs defaultValue="jobs">
  <TabsList>
    <TabsTrigger value="jobs">Browse Jobs</TabsTrigger>
    <TabsTrigger value="portfolio">My Portfolio</TabsTrigger>
  </TabsList>
  <TabsContent value="jobs"><FindWorkView /></TabsContent>
  <TabsContent value="portfolio"><PortfolioView /></TabsContent>
</Tabs>
```
No changes needed to the existing Level 2 code — it becomes a tab.

### Username Generation

On first visit to `/find-work` → My Portfolio tab, auto-generate a username from
their Clerk display name (slug + random suffix if taken). Let them edit it once.
Store in `UserProfile.username`.



---

## Changes — Credit Marketplace

### New files
- `src/lib/stripe.ts` — Stripe client singleton + `CREDIT_PACKAGES` config
- `src/app/api/stripe/webhook/route.ts` — Stripe webhook handler
- `src/components/credit-marketplace.tsx` — Buy credits UI (4 packages)
- `src/modules/usage/server/procedures.ts` — 3 new endpoints added

### Credit packages
| Package | Credits | Price | Per credit |
|---|---|---|---|
| Starter | 10 | $4.99 | $0.50 |
| Popular | 25 | $9.99 | $0.40 |
| Best Value | 60 | $19.99 | $0.33 |
| Pro | 150 | $39.99 | $0.27 |

### Required env vars (production)
```
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Stripe dashboard setup
1. Create a new webhook endpoint: `https://your-domain.com/api/stripe/webhook`
2. Subscribe to event: `checkout.session.completed`
3. Copy the webhook signing secret → `STRIPE_WEBHOOK_SECRET`

### CreditEventReason note
The webhook uses `plan_upgrade` as the credit event reason for purchases.
This is the closest existing enum value. When you run the future decimal credits
migration, also add `credit_purchase` to the `CreditEventReason` enum:
```prisma
enum CreditEventReason {
  ...existing values...
  credit_purchase   // one-time top-up via Stripe
}
```

### Migration required after download
```bash
npx prisma migrate dev --name add_credit_purchase
```

### Testing locally with Stripe CLI
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
# Use test card: 4242 4242 4242 4242, any future date, any CVC
```
