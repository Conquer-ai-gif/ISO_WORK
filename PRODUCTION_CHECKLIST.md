# Isotope — Production Launch Checklist

Work through this list top to bottom before going live.
Every item has exact instructions — no guessing.

---

## AI MODEL CONFIGURATION

### Current setup
All users (free and paid) currently use **qwen/qwen3-coder** via OpenRouter.
This model is free — you only need an OpenRouter account and API key.

**Required env var (set in `.env.local` locally and in Vercel for production):**
```
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxx
```
Get your key at: https://openrouter.ai → Sign in → Keys

---

### Switching paid users to Claude Sonnet (no code changes needed)

When you are ready to give Pro and Team users access to Claude Sonnet:

1. **Top up your OpenRouter balance** at https://openrouter.ai → Billing
   - Claude Sonnet costs roughly $3–$15 per million tokens
   - Each generation uses ~3–8k tokens, so $10 goes a long way

2. **Flip the switch in Vercel — just one variable:**
   - Go to your Vercel project → Settings → Environment Variables
   - Find `PAID_USERS_GET_CLAUDE` → set value to **`true`**
   - (If it doesn't exist yet, add it with value `true`)

3. **Redeploy** — click Redeploy in Vercel (no new code needed)

That's it. Free users stay on qwen forever. Pro and Team users automatically get Claude.

**To go back:** Set `PAID_USERS_GET_CLAUDE` = `false` in Vercel and redeploy.
**Both users on qwen** (default): Leave `PAID_USERS_GET_CLAUDE` unset or set to `false`.

---

### Increasing the free user credit limit

Free users currently get **5 credits** per month (each generation costs 1 credit).

To increase this:

1. Open `src/lib/usage.ts`
2. Find this block near the top:
   ```ts
   export const PLAN_CREDITS: Record<Plan, number> = {
     free: 5,    // ← change this number
     pro:  100,
     team: 300,
   }
   ```
3. Change `free: 5` to your desired number (e.g. `free: 10`)
4. Deploy the change

**Important:** Existing users keep their current balance until their next monthly reset.
New users will receive the new limit when they sign up.

---

## 0. LOCAL DEVELOPMENT SETUP

Follow this section first if you want to run the app on your own machine before deploying.

### 0a. Prerequisites — install these once

- [ ] **Node.js 20+**
  ```bash
  node -v   # should print v20 or higher
  ```
  If not installed: https://nodejs.org (download LTS)

- [ ] **pnpm** (package manager)
  ```bash
  npm install -g pnpm
  pnpm -v   # confirm it works
  ```

- [ ] **E2B CLI** (required to build the sandbox template)
  ```bash
  npm install -g @e2b/cli
  ```

---

### 0b. Clone and install dependencies

```bash
# 1. Unzip the project (or clone from your repo)
unzip isotope_updated_4.zip -d isotope
cd isotope

# 2. Install all packages
npm install
# or if using pnpm:
pnpm install
```

---

### 0c. Create your `.env.local` file

Copy this template and fill in each value:

```bash
# Create the file
touch .env.local
```

Paste the following into `.env.local` and fill in each value:

```env
# ── Clerk auth ────────────────────────────────────────────────────
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxx
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxx

# ── Database (Neon free tier is fine for local dev) ───────────────
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# ── Google Gemini AI ──────────────────────────────────────────────
GOOGLE_GENERATIVE_AI_API_KEY=AIzaxxxxxxxxxxxxxxxx

# ── E2B sandbox ───────────────────────────────────────────────────
E2B_API_KEY=e2b_xxxxxxxxxxxxxxxx

# ── Inngest (auto-generated for local dev — leave as-is) ──────────
INNGEST_EVENT_KEY=local
INNGEST_SIGNING_KEY=local

# ── App URLs (use localhost for local dev) ────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000

# ── Optional: leave blank to disable these features ───────────────
VERCEL_TOKEN=
NEXT_PUBLIC_VERCEL_ENABLED=
SUPABASE_ACCESS_TOKEN=
SUPABASE_ORGANIZATION_ID=
FIGMA_ACCESS_TOKEN=
RESEND_API_KEY=
ADMIN_EMAIL=
ADMIN_USER_IDS=
OPENROUTER_API_KEY=
```

Where to get each key:
| Key | Where to get it |
|-----|----------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | clerk.com → Create app → API Keys |
| `CLERK_SECRET_KEY` | Same page as above |
| `DATABASE_URL` | neon.tech → New project → Connection string (choose "Node.js") |
| `GOOGLE_GENERATIVE_AI_API_KEY` | aistudio.google.com → Get API Key |
| `E2B_API_KEY` | e2b.dev → Sign up → Dashboard → API Keys |

---

### 0d. Set up the database

```bash
# Run all migrations (creates every table including the new GenerationEvent table)
npx prisma migrate dev

# Optional: open Prisma Studio to inspect your data
npx prisma studio
```

If you see an error about missing tables, run:
```bash
npx prisma generate
npx prisma migrate dev --name init
```

---

### 0e. Build the E2B sandbox template (do this ONCE — takes 5–10 minutes)

```bash
# Login to E2B
e2b auth login

# Build the template
cd sandbox-templates/nextjs
e2b template build

# Go back to project root
cd ../..
```

After building, copy the new template ID and update:
- `sandbox-templates/nextjs/e2b.toml`
- In `src/sandbox/sandboxManager.ts` → change the `TEMPLATE_ID` constant

---

### 0f. Start the development servers

You need TWO terminal windows:

**Terminal 1 — Next.js app:**
```bash
npm run dev
```
App runs at: http://localhost:3000

**Terminal 2 — Inngest dev server (required for AI generation to work):**
```bash
npx inngest-cli@latest dev
```
Inngest UI runs at: http://localhost:8288
This is where you can see and replay AI generation runs.

---

### 0g. Verify everything works

- [ ] Open http://localhost:3000 — the app loads
- [ ] Sign up with a test account — Clerk login works
- [ ] Create a project → type a prompt → approve the plan → confirm generation starts
- [ ] Check the Inngest UI at http://localhost:8288 → you should see the `code-agent` function running
- [ ] After generation: confirm the sandbox preview loads in the iframe

---

### 0h. New migrations added in this version

Two new database migrations were added as part of the re-architecture.
Run them if you already have an existing database:

```bash
# Migration 1: adds sandboxId to Project (persistent sandbox per project)
npx prisma migrate dev --name project-sandbox-id

# Migration 2: adds GenerationEvent table (real-time streaming)
npx prisma migrate dev --name generation-events

# Or run all pending migrations at once:
npx prisma migrate dev
```

---

## 1. DATABASE

- [ ] Run migrations (includes new Credits + CreditEvent tables, drops old Usage table)
  ```bash
  npx prisma migrate dev --name billing-redesign
  ```
  This creates all tables:
  Credits, CreditEvent, Workspace, Member, Invite, Referral, ReferralUse,
  Project, Message, Fragment, GitHubToken, SyncConflict, contextDocument,
  customDomain, hideBadge

- [ ] Verify connection
  ```bash
  npx prisma studio
  ```
  Opens a browser UI — confirm all tables exist, especially Credits and CreditEvent.
  The old Usage table should be gone.

---

## 2. E2B SANDBOX (CRITICAL BLOCKER — nothing works without this)

- [ ] Install E2B CLI
  ```bash
  npm install -g @e2b/cli
  ```

- [ ] Login to E2B
  ```bash
  e2b auth login
  ```

- [ ] Build the sandbox template (takes 5–10 minutes, done ONCE ever)
  ```bash
  cd sandbox-templates/nextjs
  e2b template build
  ```

- [ ] Confirm the template ID matches e2b.toml
  The file already has: template_id = "cmwr0tjwqitw06r03s9i"
  If you rebuilt it, copy the new ID into:
    - sandbox-templates/nextjs/e2b.toml
    - src/inngest/functions.ts  (line: Sandbox.create('lune-vibe-3'))

---

## 3. ENVIRONMENT VARIABLES

Fill every value in .env.local for local dev.
For production, add all of these in your Vercel dashboard under Settings → Environment Variables.

### Required (app won't start without these)
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY    clerk.com → API Keys
CLERK_SECRET_KEY                     clerk.com → API Keys
DATABASE_URL                         neon.tech → New project → Connection string
GOOGLE_GENERATIVE_AI_API_KEY         aistudio.google.com → Get API Key
E2B_API_KEY                          e2b.dev → Dashboard → API Keys
INNGEST_EVENT_KEY                    inngest.com → App → Event Key
INNGEST_SIGNING_KEY                  inngest.com → App → Signing Key
NEXT_PUBLIC_APP_URL                  https://your-app.vercel.app
NEXT_PUBLIC_API_URL                  https://your-app.vercel.app
```

### Required for billing (both webhooks need separate secrets)
```
CLERK_WEBHOOK_SECRET                 clerk.com → Webhooks → user webhook endpoint → Signing secret
CLERK_BILLING_WEBHOOK_SECRET         clerk.com → Webhooks → billing webhook endpoint → Signing secret
```

### Required for email notifications (Changelog + Feedback alerts)
```
RESEND_API_KEY                       resend.com → API Keys → Create API Key
ADMIN_EMAIL                          your@email.com — receives feedback alert emails
```
See Section 17 for full Resend setup.

### Optional features (leave blank to disable)
```
VERCEL_TOKEN                         vercel.com → Account Settings → Tokens (Full Access)
NEXT_PUBLIC_VERCEL_ENABLED           Set to: true  (only after VERCEL_TOKEN is set)
SUPABASE_ACCESS_TOKEN                supabase.com → Account → Access Tokens
SUPABASE_ORGANIZATION_ID             supabase.com → Account → Organizations → copy ID
FIGMA_ACCESS_TOKEN                   figma.com → Account Settings → Personal access tokens
ADMIN_USER_IDS                       Your own Clerk user ID (find in clerk.com → Users)
OPENROUTER_API_KEY                   openrouter.ai → Dashboard → API Keys  (see Section 21)
```

---

## 4. CLERK SETUP

### 4a. User Webhook (REQUIRED — credits, referrals, and GitHub sync break without this)
- [ ] Go to clerk.com → Dashboard → Webhooks → Add Endpoint
- [ ] URL: https://your-app.vercel.app/api/clerk/webhook
- [ ] Subscribe to BOTH events:
  - user.created   ← seeds 5 free credits + referral code + applies referral if used
  - user.updated   ← captures GitHub OAuth token for two-way sync
- [ ] Copy the Signing Secret → paste as CLERK_WEBHOOK_SECRET in Vercel

### 4b. Billing Webhook (REQUIRED — paid plan upgrades and renewals break without this)
- [ ] Go to clerk.com → Dashboard → Webhooks → Add Endpoint (this is a SECOND separate endpoint)
- [ ] URL: https://your-app.vercel.app/api/clerk/billing-webhook
- [ ] Subscribe to BOTH events:
  - subscriptionItem.created   ← fires when a user upgrades to Pro or Team
  - payment.attempt            ← fires on every payment; code filters to recurring + paid only
- [ ] Copy the Signing Secret → paste as CLERK_BILLING_WEBHOOK_SECRET in Vercel

### 4c. GitHub OAuth (for two-way GitHub sync)
- [ ] Clerk Dashboard → Social Connections → GitHub → Enable
- [ ] Add OAuth scope: repo
- [ ] Set callback URL to your Clerk domain OAuth callback

### 4d. Billing / Stripe (for paid plans)
- [ ] Clerk Dashboard → Billing → Connect Stripe
- [ ] Create plans with these exact slugs (the code maps against them):
  - Slug: "pro"  — Name: Pro  — $25/month
  - Slug: "team" — Name: Team — $49/month
- [ ] The PricingTable on /pricing will automatically show these once created
- [ ] When a user subscribes, the billing webhook fires and resets their credits automatically

### 4e. Find your Admin User ID
- [ ] Sign in to your live app
- [ ] clerk.com → Dashboard → Users → click your name → copy the ID
- [ ] Paste into ADMIN_USER_IDS env var (format: user_2abc123xyz)
- [ ] You can add multiple admins: user_abc,user_xyz

---

## 5. INNGEST PRODUCTION SETUP

- [ ] inngest.com → Create account → New App
- [ ] Copy Event Key → INNGEST_EVENT_KEY
- [ ] Copy Signing Key → INNGEST_SIGNING_KEY
- [ ] After deploying to Vercel, go to inngest.com → Apps → Sync App
- [ ] Point it to: https://your-app.vercel.app/api/inngest
- [ ] Confirm BOTH functions appear in the Inngest dashboard:
  - code-agent              ← runs on every user generation
  - free-credits-reset      ← cron job, runs daily at midnight UTC

Note: Local dev uses npx inngest-cli@latest dev which auto-generates keys.
Production MUST use the real keys from inngest.com.

---

## 6. DEPLOY TO VERCEL

- [ ] Push code to GitHub
  ```bash
  git add .
  git commit -m "production ready"
  git push
  ```

- [ ] Go to vercel.com → New Project → Import your GitHub repo
- [ ] Add ALL environment variables in Vercel dashboard
- [ ] Deploy

- [ ] After first deploy, update these two env vars in Vercel:
  NEXT_PUBLIC_APP_URL  →  https://your-actual-domain.vercel.app
  NEXT_PUBLIC_API_URL  →  https://your-actual-domain.vercel.app
  Then redeploy (Settings → Deployments → Redeploy)

---

## 7. CUSTOM DOMAIN (optional)

- [ ] Vercel dashboard → your project → Settings → Domains → Add domain
- [ ] Follow Vercel's DNS instructions (add CNAME or A record at your registrar)
- [ ] Update NEXT_PUBLIC_APP_URL and NEXT_PUBLIC_API_URL to your custom domain
- [ ] Redeploy

---

## 8. POST-LAUNCH CHECKS

Test every feature end to end before announcing:

### Auth & Credits
- [ ] Sign up as a new user → confirm you receive exactly 5 credits
- [ ] Check /usage → credit balance shows 5, plan shows "free", next reset date is 30 days from today
- [ ] Use 1 credit (run a generation) → balance drops to 4
- [ ] Referral link works: open in incognito → sign up → both accounts get +5 credits

### Billing
- [ ] Go to /pricing → both Pro and Team plans are visible in the Clerk PricingTable
- [ ] Subscribe to Pro → credits reset to 100, plan shows "pro" in /usage
- [ ] Check Inngest dashboard → confirm billing webhook fired with subscriptionItem.created

### Generations
- [ ] Create a project → type a prompt → confirm generation runs
- [ ] Preview loads in the iframe
- [ ] Version history shows the generated version

### Integrations
- [ ] GitHub bind works (connect a repo, check if auto-push fires)
- [ ] Public share link works
- [ ] /admin is accessible with your user ID and shows real data

### Team
- [ ] Workspace create → invite link → second account accepts → can see project

---

## 9. MONITORING

- [ ] Inngest dashboard — watch for failed functions after go-live
  Pay special attention to free-credits-reset — confirm it ran on day 1
- [ ] Vercel dashboard → Functions tab — watch for errors
- [ ] Neon dashboard — watch DB connections under load
- [ ] E2B dashboard — watch sandbox usage and costs

---

## 10. COST ESTIMATES AT LAUNCH (monthly)

| Service    | Free tier                        | Paid starts at         |
|------------|----------------------------------|------------------------|
| Vercel     | Generous free tier               | $20/month (Pro)        |
| Neon       | 0.5GB free                       | $19/month              |
| E2B        | 100 sandbox hours free           | $0.08/sandbox hour     |
| Inngest    | 50k events/month free            | $25/month              |
| Clerk      | 10k MAU free                     | $25/month              |
| Gemini     | Free tier available              | Pay per token          |
| Resend     | 3,000 emails/month free          | $20/month              |

Realistically you can run at zero cost until you hit ~50-100 daily active users.

---

## 11. USER DOCUMENTATION

The /docs section is fully built and accessible at /docs in the app.
It is a public route — no login required.

### What's included
- /docs                         ← landing page with all section cards
- /docs/ai-generation           ← how generation works + interactive prompt demo
- /docs/billing                 ← plans, credits, referrals + credit calculator
- /docs/github-sync             ← two-way sync guide + flow diagram
- /docs/vercel-deploy           ← deploy setup + custom domains
- /docs/supabase                ← database provisioning guide
- /docs/figma                   ← figma import setup + what works/doesn't
- /docs/workspaces              ← team setup + interactive role permissions table
- /docs/visual-edit             ← Visual Edit modes, element picker, step-by-step guide
- /docs/task-board              ← Kanban board guide, columns, priorities, workspace access
- /docs/changelog               ← publishing entries, email subscriptions, entry types
- /docs/email-notifications     ← Resend setup, triggers, unsubscribe flow, rate limits
- /docs/faq                     ← searchable FAQ with accordion

All 12 doc pages are included in the sitemap at the correct change frequencies and priorities.

### Your side — nothing required
The docs are fully static and built into the app. No external service needed.
- [ ] Visit https://your-app.vercel.app/docs — confirm landing page loads with all 12 section cards
- [ ] Click each section — confirm all 12 pages load correctly
- [ ] Confirm sidebar shows all sections including Visual Edit, Task Board, Changelog, Email Notifications
- [ ] Test FAQ search — type a keyword and confirm filtering works
- [ ] Test on mobile — confirm sidebar opens/closes correctly
- [ ] Verify sitemap: https://your-app.vercel.app/sitemap.xml — confirm all doc routes appear

---

## 12. PLAN-FIRST MODE & BRANCH-PER-INSTRUCTION

Both features are fully built and active automatically.

### Plan-First Mode
- Activates on EVERY prompt — no toggle needed
- Agent generates a structured plan before writing any code
- User sees Approve & Build / Edit prompt buttons in the chat
- Credit is refunded automatically if user rejects the plan

### Branch-per-Instruction
- Activates ONLY when a GitHub repo is connected to the project
- Every approved generation creates a branch: isotope/task-name-xxxxx
- User can merge to main or discard from the chat UI

### Migration required
```bash
npx prisma migrate dev --name plan-first-and-branches
```

### Post-launch checks
- [ ] Submit a prompt → confirm plan card appears before generation
- [ ] Approve plan → confirm generation runs and fragment appears
- [ ] Reject plan → confirm credit is refunded in /usage
- [ ] Connect a GitHub repo → generate → confirm branch appears in fragment card
- [ ] Click Merge → confirm branch merges to main in GitHub
- [ ] Click Discard → confirm branch is deleted in GitHub
---

## 12b. GITHUB REPO SEEDING (automatic — no setup needed)

This feature is active automatically once a GitHub repo is connected to a project.

### What it does
When a user connects an existing GitHub repo to a project and generates for the
**first time**, Isotope reads the repo's current files and loads them into the
sandbox before the AI agent runs. The agent sees the real existing codebase
and makes targeted changes — instead of starting from scratch.

On every **subsequent** generation, the agent restores from the last Isotope-generated
fragment (the existing behaviour). GitHub seeding only runs on the very first generation.

### How it works (no action needed from you)
1. User connects their GitHub repo in the project settings
2. User types a prompt and approves the plan
3. During the `exec-restore-files` step, Isotope checks: is there a previous fragment?
   - Yes → restore from that fragment (normal flow)
   - No → read all files from the connected GitHub repo via the GitHub API and write them into the sandbox
4. The agent runs with the full repo codebase already present

### Requirements (already covered by earlier sections)
- GitHub OAuth must be enabled in Clerk with the `repo` scope (Section 4c)
- User must have connected their GitHub account via Clerk OAuth
- User must have linked a GitHub repo to their project via the project settings

### Post-launch check
- [ ] Connect an existing GitHub repo to a new project (one with no generations yet)
- [ ] Type a prompt (e.g. "add a dark mode toggle")
- [ ] Approve the plan → watch the Inngest run at http://localhost:8288
- [ ] In the `exec-restore-files` step, confirm the log shows files restored from GitHub (not 0)
- [ ] Confirm the generated output modifies your existing components — not a blank new project

### Files changed
- `src/sandbox/sandboxManager.ts` → `restoreFilesIntoSandbox()` now falls back to GitHub seeding
- `src/inngest/functions.ts` → `allFiles` is now pre-populated from the restore step



---

## 13. PLAN FEATURES — CLERK BILLING REFERENCE

### 🆓 FREE PLAN
Slug: (no plan metadata — default) | Price: $0

- 5 credits per day, AI generation, Ask mode, GitHub sync, Version history,
  Public sharing, Referral program, Plan-First mode, Branch-per-instruction,
  Task board, Visual Edit, "Built with Isotope" badge

Cannot: hide badge, Supabase, Figma, custom domain, team workspaces

---

### 💜 PRO PLAN
Slug: pro | Price: $25/month

Everything in Free, PLUS: 100 credits/month, hide badge, Supabase per project,
Figma import, custom domain on Vercel deployments

---

### 👥 TEAM PLAN
Slug: team | Price: $49/month

Everything in Pro, PLUS: 300 credits/month (shared pool), team workspaces (5 members),
invite links, role-based access (Owner / Editor / Viewer)

---

### ⚠️ Clerk Plan Slugs — MUST be exactly:
  - "pro"  (not "Pro", not "PRO", not "pro-plan")
  - "team" (not "Team", not "TEAM", not "team-plan")

---

### Feature Gate Summary
| Feature               | Free | Pro | Team |
|-----------------------|------|-----|------|
| Credits/month         | 5    | 100 | 300  |
| AI generation         | ✅   | ✅  | ✅   |
| GitHub sync           | ✅   | ✅  | ✅   |
| Task board            | ✅   | ✅  | ✅   |
| Visual Edit           | ✅   | ✅  | ✅   |
| Changelog page        | ✅   | ✅  | ✅   |
| Hide Isotope badge       | ❌   | ✅  | ✅   |
| Supabase database     | ❌   | ✅  | ✅   |
| Figma import          | ❌   | ✅  | ✅   |
| Custom domain         | ❌   | ✅  | ✅   |
| Team workspaces       | ❌   | ❌  | ✅   |
| Shared credits pool   | ❌   | ❌  | ✅   |
| Role-based access     | ❌   | ❌  | ✅   |

---

## 14. SENTRY ERROR MONITORING

- [ ] sentry.io → Create account → New Project → Select Next.js
- [ ] Copy DSN → paste as NEXT_PUBLIC_SENTRY_DSN in Vercel
- [ ] Settings → Auth Tokens → Create Token → paste as SENTRY_AUTH_TOKEN in Vercel
- [ ] Set SENTRY_ORG to your org slug
- [ ] Set SENTRY_PROJECT to: isotope
  ```bash
  npm install @sentry/nextjs
  ```
- [ ] After deploying, trigger a test error → confirm it appears in Sentry dashboard
- [ ] Set up an alert: Sentry → Alerts → Create Alert → email on first occurrence

---

## 15. ONBOARDING & LANDING PAGE

- Onboarding is automatic — shows to new users with zero projects
- Landing page: signed-out users see hero + features; signed-in users see dashboard
- No action needed — works out of the box

### SEO
- [ ] Replace https://isotope.app in sitemap.ts with your actual domain
- [ ] Create og-image.png (1200×630px) and place in /public/og-image.png
  - Background: #09090B | Logo center-left | Headline: "Build Apps with AI" (64px, #FAFAFA)
  - Subtitle: "Describe what you want — get a working app in seconds" (28px, #71717A)
  - Verify at: https://opengraph.xyz
- [ ] Verify sitemap: https://your-domain.com/sitemap.xml
- [ ] Submit to Google Search Console

---

## 16. TEMPLATES MARKETPLACE

Built and live at /marketplace — no setup needed.

### Post-launch checks
- [ ] Visit /marketplace — confirm page loads
- [ ] Publish a template → confirm it appears
- [ ] Fork a template → confirm new project is created
- [ ] Like a template → confirm like is recorded
- [ ] /admin → Marketplace tab → confirm link works

---

## 17. EMAIL NOTIFICATIONS (Resend)

Used for: feedback alerts to you, and changelog update emails to subscribers.

### Setup
- [ ] resend.com → Create account
- [ ] Dashboard → API Keys → Create API Key → copy
- [ ] Add to Vercel: RESEND_API_KEY = your key
- [ ] Add to Vercel: ADMIN_EMAIL = your@email.com
- [ ] Resend → Domains → Add Domain → verify DNS records with your registrar
- [ ] Update the `from` address in src/lib/email.ts:
  ```ts
  from: 'Isotope <hello@yourdomain.com>',
  ```
  Replace yourdomain.com with your verified Resend domain.

### What triggers emails
- Feedback submission → alert sent to ADMIN_EMAIL
- Changelog entry published → notification sent to all active ChangelogSubscriber rows

### Post-launch checks
- [ ] Submit test feedback at /feedback → confirm email arrives at ADMIN_EMAIL
- [ ] Subscribe to changelog at /changelog with a test email address
- [ ] /admin → Changelog → create entry → click "Publish + Notify"
- [ ] Confirm the test email receives the notification with correct content

---

## 18. VISUAL EDIT

Lets users tweak the look of their generated app without rewriting a full prompt.

### How it works
- The "Visual Edit" button (paintbrush icon) appears in the preview toolbar when
  an active fragment is loaded (only on the Preview tab — hidden on Code and Tasks)
- Choose a mode: Colors, Text, Spacing, or Layout
- Quick-suggestion chips let you apply common changes in one click
- Submitting sends a prefixed message: "[Visual Edit — Colors] make background dark"
- The agent applies only the targeted change, preserving the rest of the UI

### No setup required — works out of the box

### Post-launch checks
- [ ] Open a project with a generated fragment → switch to Preview tab
- [ ] Confirm the "Visual Edit" button appears in the top-right toolbar
- [ ] Click it → select Colors → type "make the background dark" → submit
- [ ] Confirm a new generation runs and only the background changes
- [ ] Switch to Code or Tasks tab → confirm the Visual Edit button is hidden

---

## 19. TASK BOARD (Kanban)

Every project has a built-in Kanban board accessible via the Tasks tab.

### Migration required
```bash
npx prisma migrate dev --name changelog-taskboard
```
Creates the Task table (columns: todo, in_progress, in_review, done).

### How it works
- Click the Tasks tab (kanban icon) in the project view — sits next to Preview and Code
- Four columns: To Do | In Progress | In Review | Done
- "+ Add task" button at the bottom of each column opens a creation dialog
- Set title and priority (low / medium / high) on creation
- Card kebab menu → move to any other column or delete
- Tasks are project-scoped; workspace members can all read and edit them
- Labels are stored as string arrays — add them via the tRPC procedure directly
  (UI label editor is a future enhancement)

### Post-launch checks
- [ ] Run the migration (above)
- [ ] Open a project → click the Tasks tab → confirm the board loads with 4 columns
- [ ] Click "+ Add task" in the To Do column → enter a title, choose High priority → confirm
- [ ] Use the card menu → "Move to In Progress" → confirm the card moves
- [ ] Delete the card → confirm it disappears
- [ ] Open the project as a workspace member → confirm tasks are visible

---

## 20. CHANGELOG PAGE

A public /changelog page shows users what's new. Entries are managed from /admin.

### Migration required
Same migration as Section 19:
```bash
npx prisma migrate dev --name changelog-taskboard
```
Creates: ChangelogEntry and ChangelogSubscriber tables.

### How it works
- Users visit /changelog to read all published entries
- They enter their email to subscribe to notifications
- You create entries in /admin → Changelog tab (types: Feature, Improvement, Bug Fix, Breaking)
- Clicking "Publish + Notify" publishes the entry AND emails all active subscribers
- Unsubscribe link is auto-included in every notification email
- The /changelog page is linked in the navbar and included in the sitemap (changeFrequency: weekly)

### Post-launch checks
- [ ] Run the migration (above)
- [ ] Visit /changelog → confirm the page loads (empty is fine)
- [ ] /admin → Changelog → create entry (title, type, content) → "Save Draft"
- [ ] Confirm entry appears with "Draft" badge in the admin list
- [ ] Click "Publish + Notify" → confirm badge changes to "Published"
- [ ] Visit /changelog → confirm the entry now appears publicly
- [ ] Subscribe with a test email → publish another entry → confirm notification email arrives
- [ ] Confirm "Changelog" link is visible in the navbar

---

## 21. OPENROUTER — OPTIONAL MODEL SWAP (disabled by default)

OpenRouter lets you replace Gemini with any AI model (Claude, GPT-4o, Llama, etc.)
Everything is already wired in the code — just commented out. Nothing runs until you enable it.

There are **2 files** to change and **7 agent swap points** in total.

---

### Step 1 — Get your API key
- Sign up at https://openrouter.ai
- Dashboard → API Keys → Create → copy the key (starts with `sk-or-v1-`)

---

### Step 2 — Add env var
In `.env.local` and in Vercel → Settings → Environment Variables:
```
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxx
```

---

### Step 3 — Uncomment `src/lib/openrouter.ts`

Open the file and make these 3 edits:

1. **Delete** this line (around line 40):
   ```
   // /*  ← REMOVE THIS LINE to uncomment the block
   ```

2. **Delete** this line (near the bottom of the block):
   ```
   // */  ← REMOVE THIS LINE to uncomment the block
   ```

3. **Delete** the placeholder export at the very bottom:
   ```ts
   export const openRouterModel = null
   ```

4. **Optional** — change the model slug inside the file:
   ```ts
   const OPENROUTER_MODEL = 'anthropic/claude-sonnet-4-6'
   // Other options:
   // 'openai/gpt-4o'
   // 'openai/gpt-4o-mini'
   // 'google/gemini-2.0-flash-001'
   // 'meta-llama/llama-3.1-405b-instruct'
   ```
   Full model list: https://openrouter.ai/models

---

### Step 4 — Enable in `src/inngest/functions.ts`

**4a — Uncomment the import** at the top of the file (around line 26):
```ts
// import { openRouterModel } from '@/lib/openrouter'
```
Remove the `//` to activate it.

**4b — Swap all 7 agents** — search for `← OpenRouter swap` to find each one.
For every agent, replace:
```ts
model: gemini({ model: 'gemini-2.0-flash' }),
```
With:
```ts
model: openRouterModel,
```

The 7 agents and their line numbers (approximate — may shift if you've edited the file):

| Agent                    | Approx. line |
|--------------------------|--------------|
| plan-agent               | ~191         |
| ui-agent                 | ~378         |
| backend-agent            | ~444         |
| fragment-title-generator | ~534         |
| response-generator       | ~539         |
| fix-agent                | ~574         |
| architecture-map-agent   | ~664         |

**4c — Optional**: remove the now-unused Gemini import at the top:
```ts
// gemini,   ← remove from the @inngest/agent-kit import block if you've swapped all agents
```

---

### Step 5 — Deploy and test
- Push to GitHub → Vercel redeploys automatically
- Create a project → run a generation → confirm it completes without errors
- Check https://openrouter.ai/activity → confirm the request appears with the correct model slug

---

### Popular model recommendations

| Model                               | Best for                         | Cost (approx/1M tokens) |
|-------------------------------------|----------------------------------|-------------------------|
| anthropic/claude-sonnet-4-6         | Best code quality, follows rules | ~$3                     |
| openai/gpt-4o                       | Fast, reliable, well-rounded     | ~$5                     |
| openai/gpt-4o-mini                  | Budget, simple tasks             | ~$0.15                  |
| google/gemini-2.0-flash-001         | Same as default, via OpenRouter  | ~$0.10                  |
| meta-llama/llama-3.1-405b-instruct  | Open-weight, privacy-friendly    | ~$3                     |

### Monitoring & limits
- Live usage dashboard: https://openrouter.ai/activity
- Set a monthly spending cap: https://openrouter.ai/settings → Limits

### Post-enable checks
- [ ] OPENROUTER_API_KEY is set in `.env.local` and Vercel env vars
- [ ] `src/lib/openrouter.ts` block is fully uncommented — `export const openRouterModel = null` line is deleted
- [ ] `src/inngest/functions.ts` — import is uncommented at the top
- [ ] All 7 agents have `model: openRouterModel,` — no remaining `gemini(...)` calls (search the file to confirm)
- [ ] Create a project → run a generation → no errors in Vercel Functions log
- [ ] https://openrouter.ai/activity → request appears with the correct model slug

---

## QUICK MIGRATION REFERENCE

Run these in order when setting up fresh or pulling new code:

```bash
# Original schema — users, credits, projects, messages, fragments
npx prisma migrate dev --name billing-redesign

# Plan-first mode + branch-per-instruction
npx prisma migrate dev --name plan-first-and-branches

# Changelog + task board  ← NEW in this update
npx prisma migrate dev --name changelog-taskboard
```

On a fully fresh database (e.g. new Neon project), run all at once:
```bash
npx prisma migrate deploy
```

---

## ARCHITECTURAL REASONING UPGRADE — New Setup Required

The following sections cover setup for the 9 new features added to the system.
Work through these BEFORE going live with the upgraded version.

---

## FEATURE 4 & VECTOR STORE — Supabase pgvector Setup

This uses the **project's Supabase instance** (the generated app DB) — NOT Prisma.
Each project that has Supabase connected will automatically get component deduplication.

- [ ] Run this SQL in the Supabase SQL editor for each project that uses vector search:
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;

  CREATE TABLE IF NOT EXISTS isotope_component_store (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id text NOT NULL,
    file_path text NOT NULL,
    content text NOT NULL,
    embedding vector(768),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(project_id, file_path)
  );

  CREATE INDEX ON isotope_component_store
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

  -- RPC function for similarity search
  CREATE OR REPLACE FUNCTION match_components(
    query_embedding vector(768),
    match_project_id text,
    match_threshold float,
    match_count int
  )
  RETURNS TABLE (
    file_path text,
    content text,
    similarity float
  )
  LANGUAGE sql STABLE
  AS $$
    SELECT file_path, content, 1 - (embedding <=> query_embedding) AS similarity
    FROM isotope_component_store
    WHERE project_id = match_project_id
      AND 1 - (embedding <=> query_embedding) > match_threshold
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
  $$;
  ```

- [ ] Add Supabase service role key to environment variables:
  ```
  SUPABASE_SERVICE_ROLE_KEY    supabase.com → Project Settings → API → service_role key
  ```
  Note: This is the service role key (bypasses RLS) — keep it secret, server-side only.

---

## FEATURE 6 — Figma → tailwind.config.ts Auto-Generation

- [ ] Add Figma environment variables:
  ```
  FIGMA_ACCESS_TOKEN    figma.com → Account Settings → Personal Access Tokens
  FIGMA_FILE_KEY        from your Figma file URL: figma.com/file/[FILE_KEY]/...
  ```
- [ ] Figma tailwind config is automatically written to sandbox before every generation
- [ ] The generated tailwind.config.ts is committed to GitHub with each push
- [ ] If you update your Figma variables, the next generation will pick them up automatically

---

## FEATURE 1 — Architecture Map (Auto-Generated contextDocument)

- [ ] No setup required — works automatically
- [ ] After every successful generation, the AI writes a structured JSON architecture map
  to `Project.contextDocument` in your Prisma DB
- [ ] This replaces the manual user-typed context with a living document
- [ ] You can still manually override contextDocument per project via the UI
- [ ] The map includes: routes, components, hooks, API routes, data models, Inngest functions

---

## FEATURE 7 — Smart GitHub Push

- [ ] No setup required — replaces the old push automatically
- [ ] Only changed files are pushed (diff-aware) — saves GitHub API calls
- [ ] Commit messages are auto-generated from the task summary
- [ ] `autoMerge` is set to `false` by default — user controls merge via UI
- [ ] To enable auto-merge (merge branch to main after every successful build):
  Change `autoMerge: false` to `autoMerge: true` in `src/inngest/functions.ts` Step 11

---

## FEATURE 9 — Backend Agent

- [ ] No setup required — activates automatically when the plan detects backend files
- [ ] The backend agent handles: API routes, Inngest functions, Server Actions,
  webhooks, database logic, email, auth, queues, cron jobs
- [ ] The router runs backend agent FIRST, then UI agent — so UI can import backend types

---

## FEATURE 11 — Multi-Agent Network

- [ ] No setup required — activates automatically
- [ ] For UI-only tasks: only the UI agent runs
- [ ] For backend-only tasks: only the backend agent runs
- [ ] For full-stack tasks: backend agent runs first, then UI agent
- [ ] The review agent is available in REVIEW_AGENT_PROMPT — wire it in functions.ts if needed

---

## NEW ENVIRONMENT VARIABLES SUMMARY

Add all of these to `.env.local` and to Vercel → Settings → Environment Variables:

```
# Feature 4 — Vector Store
SUPABASE_SERVICE_ROLE_KEY    supabase.com → Project Settings → API → service_role

# Feature 6 — Figma Tailwind
FIGMA_ACCESS_TOKEN           figma.com → Account Settings → Personal Access Tokens
FIGMA_FILE_KEY               figma.com/file/[THIS_PART]/your-file-name
```

FOLDER STRUCTURE FOR MODULES/PROJECTS/SERVER/PROCEDURE.TS
src/server/
  trpc/
    routers/
      projects/
        index.ts
        crud.ts
        github.ts
        vercel.ts
        supabase.ts
        figma.ts
        domains.ts
        conflicts.ts
        index.ts   (main router)

        WHAT SHOULD BE IN THE  index.ts   (main router)

        import { createTRPCRouter } from '@/trpc/init'

import { projectsCrudRouter } from './crud'
import { projectsGithubRouter } from './github'
import { projectsVercelRouter } from './vercel'
import { projectsSupabaseRouter } from './supabase'
import { projectsFigmaRouter } from './figma'
import { projectsDomainRouter } from './domains'
import { projectsConflictRouter } from './conflicts'

export const projectsRouter = createTRPCRouter({
  ...projectsCrudRouter,
  ...projectsGithubRouter,
  ...projectsVercelRouter,
  ...projectsSupabaseRouter,
  ...projectsFigmaRouter,
  ...projectsDomainRouter,
  ...projectsConflictRouter,
})


GITHUB PUSH AARCHECTURE

generate code
   ↓
push to GitHub branch
   ↓
merge branch → main
   ↓
pull latest main
   ↓
update Isotope DB + sandbox