# Isotope — Developer Setup Guide

## Stack Overview

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| API | tRPC |
| Database | PostgreSQL via Prisma |
| Auth | Clerk |
| Background jobs | Inngest |
| AI models | OpenRouter (qwen free / Claude paid) |
| Sandbox | E2B (ephemeral code execution) |
| GitHub sync | Octokit REST API |
| Deployment | Vercel |
| Error tracking | Sentry |

---

## Environment Variables

Below is every environment variable Isotope uses, grouped by service, with instructions on where to get each one.

---

### 🔴 Required — App will not start without these

```bash
# ── Database (Neon / Supabase / any Postgres) ─────────────────────────────────
DATABASE_URL=postgresql://user:password@host:5432/dbname
# Get from: Neon dashboard → Connection string
#           OR Supabase → Project Settings → Database → Connection string (URI mode)
# Format: postgresql://[user]:[password]@[host]/[dbname]?sslmode=require

# ── Clerk Auth ────────────────────────────────────────────────────────────────
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
# Get from: dashboard.clerk.com → your app → API Keys → Publishable key

CLERK_SECRET_KEY=sk_live_...
# Get from: dashboard.clerk.com → your app → API Keys → Secret key

CLERK_WEBHOOK_SECRET=whsec_... left
# Get from: dashboard.clerk.com → Webhooks → your endpoint → Signing secret
# Webhook URL to register: https://your-domain.com/api/clerk/webhook
# Events to enable: user.created, user.deleted, session.created

# ── AI Model (OpenRouter) ─────────────────────────────────────────────────────
OPENROUTER_API_KEY=sk-or-v1-...
# Get from: openrouter.ai → Keys → Create key
# Used for: all AI generation (planning, coding, review, suggestions)

# ── E2B Sandbox ───────────────────────────────────────────────────────────────
E2B_API_KEY=e2b_...
# Get from: e2b.dev → Dashboard → API Keys
# Used for: isolated sandbox where AI-generated code runs and previews

# ── Inngest (background jobs) ─────────────────────────────────────────────────
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...
# Get from: app.inngest.com → your app → Manage → Keys
# INNGEST_EVENT_KEY: used to send events to Inngest
# INNGEST_SIGNING_KEY: used to verify webhook signatures from Inngest
# Webhook URL to register in Inngest: https://your-domain.com/api/inngest

# ── Encryption (for integration API keys) ────────────────────────────────────
ENCRYPTION_SECRET=your-exactly-32-character-secret
# Generate with: openssl rand -base64 24 | cut -c1-32
# MUST be exactly 32 characters — used for AES-256-GCM encryption of user API keys
# ⚠️ NEVER change this after going to production — existing keys will become unreadable
```

---

### 🟡 Required for specific features

```bash
# ── GitHub App (for Push to GitHub + Import Repo) ────────────────────────────
GITHUB_APP_ID=123456
# Get from: github.com → Settings → Developer settings → GitHub Apps → your app → App ID

GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
# Get from: github.com → Settings → Developer settings → GitHub Apps → your app → Generate private key
# Paste the full key as a single line with \n for newlines, wrapped in quotes

GITHUB_CLIENT_ID=Iv1....
GITHUB_CLIENT_SECRET=...
# Get from: github.com → Settings → Developer settings → GitHub Apps → your app → Client ID / Client secret

# ── Resend (for transactional emails) ────────────────────────────────────────
RESEND_API_KEY=re_...
# Get from: resend.com → API Keys → Create API Key
# Used for: welcome emails, password resets, notifications

RESEND_FROM_EMAIL=Isotope <hello@yourdomain.com>
# Must match a domain you have verified in Resend (resend.com → Domains)
# Without this, emails fall back to onboarding@resend.dev (Resend test domain)
# Example: "Isotope <hello@myapp.com>"

# ── Sentry (error monitoring) ────────────────────────────────────────────────
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
# Get from: sentry.io → your project → Settings → Client Keys (DSN)

SENTRY_AUTH_TOKEN=...
# Get from: sentry.io → Settings → Auth Tokens → Create new token
# Used for: uploading source maps during build

# ── Vercel (optional — auto-deploy generated apps) ───────────────────────────
VERCEL_TOKEN=...
# Get from: vercel.com → Settings → Tokens → Create token
NEXT_PUBLIC_VERCEL_ENABLED=true

# ── Figma (optional — import from Figma feature) ─────────────────────────────
FIGMA_ACCESS_TOKEN=figd_...
# Get from: figma.com → Settings → Account → Personal access tokens
FIGMA_FILE_KEY=...
# The key in your Figma file URL: figma.com/file/[FILE_KEY]/...

# ── Google AI (optional — vector store embeddings only) ──────────────────────
GOOGLE_GENERATIVE_AI_API_KEY=AIza...
# Get from: aistudio.google.com → Get API key
# Only needed if you have Supabase vector store enabled (see Vector Store section)

# ── Web Search Agent (optional — for library documentation lookup) ─────────────
TAVILY_API_KEY=tvly-...
# Get from: tavily.com → Dashboard → API Keys (has a free tier)
# Used for: fetching library documentation when AI encounters unfamiliar packages
# Results are cached in isotope_doc_cache so the same library is never fetched twice

# ── Supabase Management (optional — auto-provision feature) ──────────────────
SUPABASE_ACCESS_TOKEN=sbp_...
# Get from: supabase.com/dashboard/account/tokens → Generate new token
# Used for: one-click Supabase project creation for users' apps

SUPABASE_SERVICE_ROLE_KEY=eyJ...
# Get from: Supabase → Project Settings → API → service_role key
# Used for: vector store operations on the PLATFORM Supabase (not user projects)
```

---

### 🟢 Pricing & Admin

```bash
# ── Clerk Billing (for Pro/Team plans) ───────────────────────────────────────
NEXT_PUBLIC_CLERK_PRO_PLAN_ID=plan_...
NEXT_PUBLIC_CLERK_TEAM_PLAN_ID=plan_...
# Get from: dashboard.clerk.com → Billing → Plans → click plan → copy Plan ID
# See INSTRUCTIONS.md → Pricing Page Activation for full setup steps

CLERK_BILLING_WEBHOOK_SECRET=whsec_...
# Get from: dashboard.clerk.com → Webhooks → billing webhook endpoint → Signing secret
# Webhook URL: https://your-domain.com/api/clerk/billing-webhook

# ── Admin ─────────────────────────────────────────────────────────────────────
ADMIN_USER_IDS=user_xxxxxxxxxxxxxxxxxx
# Your Clerk user ID — get from: dashboard.clerk.com → Users → click your account
# Multiple admins: ADMIN_USER_IDS=user_xxx,user_yyy
# Grants access to /admin dashboard

# ── Feature flags ─────────────────────────────────────────────────────────────
PAID_USERS_GET_CLAUDE=true
# Set to true to give Pro/Team users Claude Sonnet instead of Qwen
# Free users always get the free OpenRouter model regardless of this flag

# ── App URLs ──────────────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://your-domain.com
# Used for: OAuth callbacks, email links, absolute URLs
# Local: http://localhost:3000

NEXT_PUBLIC_API_URL=https://your-domain.com
# Usually same as NEXT_PUBLIC_APP_URL

# ── Feedback email ────────────────────────────────────────────────────────────
FEEDBACK_EMAIL=you@yourdomain.com
# Where feedback form submissions are sent
```

---

### Minimal `.env.local` to run locally

Copy this as your starting point — fill in the required ones first:

```bash
# REQUIRED
DATABASE_URL=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=
OPENROUTER_API_KEY=
E2B_API_KEY=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
ENCRYPTION_SECRET=

# RECOMMENDED FOR FULL FUNCTIONALITY
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
RESEND_API_KEY=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=

# OPTIONAL
GOOGLE_GENERATIVE_AI_API_KEY=
SUPABASE_ACCESS_TOKEN=
SUPABASE_SERVICE_ROLE_KEY=
VERCEL_TOKEN=
NEXT_PUBLIC_VERCEL_ENABLED=true
FIGMA_ACCESS_TOKEN=
FIGMA_FILE_KEY=
PAID_USERS_GET_CLAUDE=true
ADMIN_USER_IDS=
FEEDBACK_EMAIL=

# PRICING (after Clerk billing setup)
NEXT_PUBLIC_CLERK_PRO_PLAN_ID=
NEXT_PUBLIC_CLERK_TEAM_PLAN_ID=
CLERK_BILLING_WEBHOOK_SECRET=

# APP URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000
```

---

## Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Install Shiki (syntax highlighting — replaces PrismJS)
pnpm add shiki

# 3. Set up database — run ALL migrations in order
pnpm prisma migrate dev --name init     #initial
pnpm prisma migrate dev --name add_doc_cache        # DocCache table (30-day doc cache)
pnpm prisma migrate dev --name add_find_work         # JobCache table (Remotive job feed)
pnpm prisma migrate dev --name add_credit_purchase   # CreditPurchase table + PurchaseStatus enum
pnpm prisma migrate dev --name schema_cleanup        # Credits balance default, IntegrationProvider, indexes
pnpm prisma migrate dev --name add_github_token_iv   # GitHubToken.iv column (encryption)
pnpm prisma migrate dev --name add_figma_token       # figma_token to IntegrationProvider enum
pnpm prisma generate

# 4. Run dev server
pnpm dev

# 5. Run Inngest locally (separate terminal)
npx inngest-cli@latest dev
```

---

## AI Model Architecture

All AI calls go through **OpenRouter** — one API key, multiple models.

```
Free users  → qwen/qwen3-coder        (always)
Paid users  → qwen/qwen3-coder        (default)
            → anthropic/claude-sonnet-4-5  (when PAID_USERS_GET_CLAUDE=true)
```

**To activate Claude for paid users:**
1. Buy OpenRouter credits at https://openrouter.ai → Billing
2. Set `PAID_USERS_GET_CLAUDE=true` in Vercel environment variables
3. Redeploy — paid users get Claude, free users stay on qwen

**Model usage by feature:**

| Feature | Model | Credit cost |
|---|---|---|
| Planning (PLAN_PROMPT) | free model | 0 (pre-approval) |
| Code generation (TASK_GRAPH) | user's plan model | 1 credit |
| Fix agent | user's plan model | included |
| Ask mode | free model | 0 |
| Suggestions | free model | 0 |
| Architecture map | free model | 0 |
| Fragment title / response | free model | 0 |

---

## Prompt Architecture

Isotope uses 5 prompts, all in `src/prompt.ts`:

| Prompt | Used by | Purpose |
|---|---|---|
| `DESIGN_LIBRARY` | UI agent | Design system rules — tokens, components, animation |
| `PROMPT` | UI agent | Full coding rules — environment, security, quality |
| `BACKEND_AGENT_PROMPT` | Backend agent | API routes, DB, integrations |
| `TASK_GRAPH_PLAN_PROMPT` | `planner.ts` | Plans the task graph AND generates the human-readable plan approval card |
| `REVIEW_AGENT_PROMPT` | Review agent | Post-generation review — TypeScript, imports, animation checks |

**`PLAN_PROMPT` — ARCHIVED**
`PLAN_PROMPT` is still in `src/prompt.ts` but is **not used anywhere**. It has been archived for reference only. Its fields (`summary`, `approach`, `complexity`, `estimatedTime`, `agentPlan`, `riskFlags`, `deferredTasks`) have been merged directly into `TASK_GRAPH_PLAN_PROMPT` so one prompt serves both the plan approval UI and the task executor in a single AI call.

**How planning works now:**
`TASK_GRAPH_PLAN_PROMPT` outputs one JSON object that contains both:
- Human-readable fields → `plan-approval.tsx` renders the plan card for user approval
- `tasks[]` array → `TaskExecutor` runs the actual generation

This eliminates the extra AI call that `PLAN_PROMPT` would have required.

Two separate prompts serve two different audiences:

**`PLAN_PROMPT`** → human readable, shown in `PlanApproval.tsx`
- Output: `summary`, `approach`, `filesToCreate`, `filesToModify`, `riskFlags`, `deferredTasks`, `complexity`, `estimatedTime`
- User reads this and approves or rejects before any code is written

**`TASK_GRAPH_PLAN_PROMPT`** → machine executable, consumed by `TaskExecutor`
- Output: `tasks[]` with `id`, `type`, `description`, `files`, `dependsOn`, `priority`
- Runs after approval — drives the DAG execution engine

Both prompts share **`COMMON_RULES`** (`src/agent/prompts/commonRules.ts`) — injected at the top of each to avoid duplication.

---

## Vector Store (Component Deduplication)

Isotope uses Supabase pgvector to store embeddings of every file the AI writes. Before each generation, it searches for semantically similar existing components so the agent reuses them instead of rebuilding.

### How it works
1. After every generation → `upsert-vector-store` step embeds all written files using Google `text-embedding-004` and stores them in Supabase
2. Before each generation → `search-components-for-coding` searches the vector store with the user's prompt and injects matching components into the agent context

### Does it index imported repo files?
**Yes — as of the latest build.** When a user imports a repo, Isotope fires an Inngest background job `embedRepoFilesFunction` that:
1. Fetches all files from the GitHub repo
2. Embeds them using Google `text-embedding-004`
3. Stores them in `isotope_component_store` scoped to the project
4. Sets `isIndexing: false` on the project when done

The project card shows a pulsing **"Indexing codebase..."** badge while this runs. By the time the user sends their first prompt, the repo files are indexed and the AI can find existing components instead of rebuilding them.

**Requires:** Supabase configured on the project + `GOOGLE_GENERATIVE_AI_API_KEY` + `SUPABASE_SERVICE_ROLE_KEY` set on the server.

### Required SQL — run once in your Supabase SQL editor

Go to your Supabase project → **SQL Editor** → paste and run:

```sql
-- Enable the vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Component store (existing files per project) ─────────────────────────────
CREATE TABLE IF NOT EXISTS isotope_component_store (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  text NOT NULL,
  file_path   text NOT NULL,
  content     text NOT NULL,
  embedding   vector(768),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(project_id, file_path)
);

CREATE INDEX ON isotope_component_store
  USING ivfflat (embedding vector_cosine_ops);

CREATE OR REPLACE FUNCTION match_components(
  query_embedding   vector(768),
  match_project_id  text,
  match_threshold   float,
  match_count       int
)
RETURNS TABLE (
  file_path  text,
  content    text,
  similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    isotope_component_store.file_path,
    isotope_component_store.content,
    1 - (isotope_component_store.embedding <=> query_embedding) AS similarity
  FROM isotope_component_store
  WHERE
    isotope_component_store.project_id = match_project_id
    AND 1 - (isotope_component_store.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- ── Chat memory (past prompts + summaries per project) ────────────────────────
CREATE TABLE IF NOT EXISTS isotope_chat_memory (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  text NOT NULL,
  user_id     text NOT NULL,
  role        text NOT NULL,
  content     text NOT NULL,
  embedding   vector(768),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX ON isotope_chat_memory
  USING ivfflat (embedding vector_cosine_ops);

CREATE INDEX isotope_chat_memory_project_id_idx
  ON isotope_chat_memory(project_id);

CREATE OR REPLACE FUNCTION match_memories(
  query_embedding   vector(768),
  match_project_id  text,
  match_threshold   float,
  match_count       int
)
RETURNS TABLE (
  role        text,
  content     text,
  similarity  float,
  created_at  timestamptz
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    isotope_chat_memory.role,
    isotope_chat_memory.content,
    1 - (isotope_chat_memory.embedding <=> query_embedding) AS similarity,
    isotope_chat_memory.created_at
  FROM isotope_chat_memory
  WHERE
    isotope_chat_memory.project_id = match_project_id
    AND 1 - (isotope_chat_memory.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;
```

### Required env vars for vector store
```bash
GOOGLE_GENERATIVE_AI_API_KEY=AIza...   # for text-embedding-004
SUPABASE_SERVICE_ROLE_KEY=eyJ...       # for writing to isotope_component_store
TAVILY_API_KEY=tvly-...                # for web search agent (get from tavily.com)
```

### Add to Supabase SQL (run after the vector store SQL above)

```sql
-- ── Documentation cache ───────────────────────────────────────────────────────
-- Stores summarized library docs so the same library is never fetched twice
CREATE TABLE IF NOT EXISTS isotope_doc_cache (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  library_name text NOT NULL UNIQUE,
  summary      text NOT NULL,
  cached_at    timestamptz DEFAULT now()
);

-- Optional: index for fast name lookups
CREATE INDEX IF NOT EXISTS isotope_doc_cache_library_idx
  ON isotope_doc_cache(library_name);
```
The `SUPABASE_SERVICE_ROLE_KEY` here is for the **platform Supabase** (your own Isotope database), not the user's project Supabase.

---

```
Isotope → GitHub (outbound — user triggered):
  User clicks "Push to GitHub" on fragment card
  → Creates isotope/{slug} branch + pushes files
  → Opens PR targeting main
  → Platform auto-merges via GitHub API
  → Webhook: pull_request closed+merged
    → Fetches full main branch files
    → Updates Fragment.files in Prisma
    → Sets Fragment.branchMerged = true
    → Refreshes Vercel deploy URL

GitHub → Isotope (inbound — developer triggered):
  Developer pushes directly to main
  → Webhook: push to default branch
    → Fetches changed files only
    → Updates Fragment.files in Prisma
    → Sandbox gets changes on next generation automatically
```

**Source of truth:**

| Data | Where |
|---|---|
| Generated files | `Fragment.files` in Prisma (Postgres) |
| Sandbox | E2B — ephemeral, restored from Prisma on every generation |
| Vercel URL | `Project.vercelDeployUrl` — updated by webhook on PR merge |

---

## Import Existing Repo Flow

```
User clicks "Import Existing Repo" on home page
→ Pastes github.com/owner/repo URL
→ projects.importRepo analyses package.json via GitHub API (read-only)
→ Detects: framework, language, router, styling, database, auth, risk flags
→ User confirms → Project created with repoOwner/repoName set
→ Inngest event fired: isotope/repo.imported → isIndexing: true on project
→ Background job (embedRepoFilesFunction):
    fetches all repo files from GitHub
    embeds each file via Google text-embedding-004
    stores in isotope_component_store (scoped to projectId)
    sets isIndexing: false when done
→ Project card shows "Indexing codebase..." badge while running
→ User redirected to chat
→ First generation: restoreFilesIntoSandbox seeds from GitHub repo
  (because no Fragment exists yet — falls through to Priority 2)
→ Agent starts with the full real codebase
→ Vector store search finds existing components → AI reuses instead of rebuilding
```

Supported frameworks: Next.js, React, Vue, Svelte.
Private repos require a connected GitHub account.

**Requires for indexing to work:**
```bash
GOOGLE_GENERATIVE_AI_API_KEY=AIza...   # for text-embedding-004
SUPABASE_SERVICE_ROLE_KEY=eyJ...       # for writing to isotope_component_store
```
Also ensure the Supabase SQL has been run — see **Vector Store** section above for the full SQL including `isotope_component_store` table + `match_components` function.

---

## Why These 3 Routes Stay as REST (not tRPC)

| Route | Reason |
|---|---|
| `POST /api/upload` | `multipart/form-data` — tRPC does not support file uploads |
| `GET /api/generation/stream` | Server-Sent Events — tRPC HTTP transport does not support streaming |
| `POST /api/github/webhook` | Needs raw request body for HMAC signature verification |

---

## Database Migration

After pulling this branch, run these commands in order:

```bash
# 1. Apply all pending migrations to your database
pnpm prisma migrate deploy

# 2. Regenerate the Prisma client (TypeScript types)
pnpm prisma generate
```

### Migrations applied (in order)
- `20260410173818_init` — initial schema
- `20260421000000_fragment_pr_url` — adds `prUrl` to `Fragment`
- `20260422000000_integration_configs` — adds `IntegrationConfig` table for encrypted third-party keys
- `20260423000000_connector_system` — adds `custom` provider, `customEnvVar` on `IntegrationConfig`, `requiredIntegrations` on `Message`
- `20260423000001_performance_indexes` — adds `Message.projectId` index and composite `Message(projectId, createdAt)` index
- `20260423000002_chat_memory_and_indexing` — adds `ChatMemory` model, `isIndexing` flag on `Project`
- `20260423000003_daily_reset_label` — renames `monthly_reset` → `daily_reset` in `CreditEventReason` enum

### Generate your encryption secret
```bash
openssl rand -base64 24 | cut -c1-32
```
Add the output as `ENCRYPTION_SECRET` in `.env.local` and Vercel. Must be exactly 32 characters. Never change it after going to production.

### Supabase vector store SQL (run once)
See **Vector Store** section above for the full SQL to run in your Supabase SQL editor.

---

---

## Integrations System

### Approach
Isotope uses **user-supplied keys**. Users paste their own API keys for third-party services. The platform encrypts and injects them — it does not manage shared platform accounts for services.

### Security flow
```
User pastes key → AES-256-GCM encrypt → stored in IntegrationConfig (Prisma)
                                                     ↓
Inngest inject-integration-keys step → decrypt → export into E2B sandbox env
                                                     ↓
AI-generated code reads process.env.VARIABLE_NAME → real API call works
```

### Supported providers + env var names
| Provider | Env var |
|---|---|
| resend | `RESEND_API_KEY` |
| supabase_url | `NEXT_PUBLIC_SUPABASE_URL` |
| supabase_anon_key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| supabase_service_key | `SUPABASE_SERVICE_ROLE_KEY` |
| stripe_secret_key | `STRIPE_SECRET_KEY` |
| stripe_publishable_key | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| openai_api_key | `OPENAI_API_KEY` |
| custom | `(user-defined env var name)` |

### Custom keys ✅ Built
Users can store any arbitrary env var via the `custom` provider type. They supply both the env var name (e.g. `TWILIO_AUTH_TOKEN`) and the value. The key is encrypted and injected like any other. The env var name is stored in `IntegrationConfig.customEnvVar`.

### Missing key notifications ✅ Built
The AI outputs `<required_integrations>resend,stripe_secret_key</required_integrations>` inside its `<task_summary>` whenever it uses a third-party service. The `save-result` step in `functions.ts` parses this tag and stores the provider list as `Message.requiredIntegrations` (JSON array). In `message-card.tsx`, the list is compared against the project's saved `IntegrationConfig` records at render time. If any required key is missing, a non-blocking amber banner appears below the fragment card with a direct link to the Integrations page.

### Connector cards ✅ Built
The Integrations page (`/projects/[projectId]/integrations`) has been redesigned from a plain form into a connector card layout. Each provider shows a **Connected / Not connected** badge. Clicking **Connect** opens a guided modal with:
- Step-by-step instructions for finding the key in that provider's dashboard
- A direct link to the provider's API keys page
- A note on key format / security considerations
- The key input + save button

Custom keys have their own section at the bottom with an **Add** button that opens a two-field modal (env var name + value).

### Key management in the UI
- Keys are masked (`••••••••`) in all API responses — plaintext never leaves the server
- Eye toggle reveals the value client-side during input only
- Keys can be updated (upsert) or deleted per provider
- Each key is stored with its own IV so each encryption is unique

### Inline API key modal in chat (planned — not yet built)
Instead of sending the user to the Integrations page when a key is missing, the banner's "Add key" button should open a modal **directly in the chat**. The modal has:
- A key input field with the provider's placeholder and guided hint
- **Save** button — calls the same upsert mutation, banner disappears on success
- **Later** button — auto-fills a provider-aware mock key (e.g. `re_mock_xxxxxxxx` for Resend) so the sandbox keeps working in stub mode without breaking the preview

Open questions to resolve before building:
- Mock key format: provider-aware (e.g. `re_mock_xxx`) or generic (`mock_key_pending`)?
- Save: optimistic dismiss or wait for mutation confirm?
- Custom providers (raw env var names from `<required_integrations>`): show modal without guided steps, or link to integrations page?

---

## Pricing Page Activation (you do this — not code)

The pricing page has been cleaned up — the duplicate Clerk `<PricingTable />` is removed. Your custom plan cards now call `clerk.openCheckout({ planId })` directly when the user clicks "Upgrade to Pro" or "Start team plan".

**Status checklist — tick these off as you go:**
- [ ] Clerk billing enabled and Stripe connected
- [ ] Pro plan created in Clerk ($25/month)
- [ ] Team plan created in Clerk ($49/month)
- [ ] `NEXT_PUBLIC_CLERK_PRO_PLAN_ID` added to `.env.local`
- [ ] `NEXT_PUBLIC_CLERK_TEAM_PLAN_ID` added to `.env.local`
- [ ] Both env vars added to Vercel environment variables
- [ ] Tested locally — "Upgrade to Pro" opens Clerk checkout modal

**To activate checkout, do these steps in order:**

### Step 1 — Enable Clerk billing
1. Go to [clerk.com/dashboard](https://dashboard.clerk.com) → your app
2. Click **Billing** in the left sidebar
3. Enable billing and connect your Stripe account when prompted

### Step 2 — Create your plans in Clerk
1. In Clerk Dashboard → Billing → **Plans**
2. Create a plan called **Pro** — set price to $25/month
3. Create a plan called **Team** — set price to $49/month
4. After saving each plan, copy its **Plan ID** (looks like `plan_xxxxxxxxxx`)

### Step 3 — Add plan IDs to your environment
Add these two lines to your `.env.local`:
```
NEXT_PUBLIC_CLERK_PRO_PLAN_ID=plan_xxxxxxxxxx
NEXT_PUBLIC_CLERK_TEAM_PLAN_ID=plan_xxxxxxxxxx
```
Also add them to your **Vercel environment variables** (Settings → Environment Variables) for production.

### Step 4 — Verify
- Run `pnpm dev` and go to `/pricing`
- You should see three clean cards with no duplicate section below
- Click "Upgrade to Pro" — Clerk's checkout modal should open
- If the button is disabled, the env var is not set correctly

### Step 5 — Stripe Credit Top-Up Webhook (required for Buy Credits feature)

The credit marketplace (`/usage` → Buy Credits) uses Stripe Checkout directly — separate from Clerk billing. You need to register a webhook so purchased credits are added to the user's account.

**Set these env vars:**
```
STRIPE_SECRET_KEY=sk_live_...           # or sk_test_... for testing
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...         # set after step below
```

**Register the webhook in Stripe dashboard:**
1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) → Developers → Webhooks
2. Click **Add endpoint**
3. Set URL to: `https://your-domain.com/api/stripe/webhook`
4. Under **Select events**, choose: `checkout.session.completed`
5. Click **Add endpoint** → copy the **Signing secret** (`whsec_...`)
6. Add it to `.env.local` as `STRIPE_WEBHOOK_SECRET=whsec_...`

**Test locally with Stripe CLI:**
```bash
# Install Stripe CLI (macOS)
brew install stripe/stripe-cli/stripe

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/stripe/webhook

# In another terminal — trigger a test event
stripe trigger checkout.session.completed

# Use test card: 4242 4242 4242 4242, any future date, any CVC
```

**Note on the Free plan:** Signed-out users see "Get started free" which opens Clerk sign-in. Signed-in users see "Current plan" (disabled).

**Note on the pricing-client.tsx:** The Pro and Team CTA buttons are automatically disabled until the env vars are set — so the page works fine before you activate. Users just can't click upgrade until you wire it up.

---

## Future Milestones

### Generation progress system ✅ Built
Real-time transparency in the chat while AI is generating. Files changed:
- `src/hooks/use-generation-stream.ts` — reconnect logic (1 retry on SSE drop), richer `latestLog` priority: `data.description` → `data.message` → event label
- `src/components/generation-progress.tsx` — collapsible terminal log, `font-mono` + `>` prefix, heartbeat dot, auto-expands on `fix_started`/`task_failed`
- `src/tools/createTools.ts` — `terminal` tool emits `task_started` with human-readable command description, `createOrUpdateFiles` emits `file_updated` with `Writing /path/to/file`
- `src/agents/fixAgent.ts` — `fix_started` includes error count + file names in `description`
- `src/sandbox/sandboxManager.ts` — `restoreFilesIntoSandbox` accepts optional `emit`, emits restore/seed log
- `src/inngest/functions.ts` — `emit` moved before `exec-get-sandbox` so it's available for all steps

### Inline API Key Modal in Chat ✅ Built
Clicking "Add key →" in the missing key banner now opens a modal directly in the chat — no page navigation. The modal has a provider-aware key input with eye toggle, Save button (encrypts via AES-256-GCM), and Later button (injects a provider-aware mock key so preview keeps working in stub mode). Works for all 7 known providers and custom env vars.

### Supabase Auto-Provision ✅ Built
The Integrations page now has a "Supabase Auto-Provision" section using the existing `provisionSupabase` mutation and `SupabaseButton` component.

**To activate — add to `.env.local` and Vercel env vars:**
1. Go to [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
2. Generate a new token → name it "Isotope"
3. Add to environment:
```
SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxxxxxxxxxxxxxxxxxx
```
Requires Pro or Team plan — free users see the section but the button is gated.
