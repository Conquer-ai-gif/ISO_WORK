# Isotope — End-to-End Testing Guide

Test each gate in order. **Do not move to the next gate until the current one passes.**
A failure at Gate 3 means Gates 4–10 will also fail — fix it before continuing.

---

## Before You Start

```bash
# Extract the zip, then:
npm install
npx prisma migrate dev --name add_doc_cache   # required — creates DocCache table
npm run dev                                    # starts on http://localhost:3000
```

Open a second terminal:
```bash
npx inngest-cli@latest dev                     # starts Inngest dev server on port 8288
```

---

## Gate 1 — Environment & Boot

**What you're testing:** the app starts, DB connects, all required services are reachable.

### Checklist
- [ ] Copy `.env.example` → `.env.local` and fill in all required vars
- [ ] `npm run dev` starts without errors in terminal
- [ ] `http://localhost:3000` loads in browser (no blank screen, no 500)
- [ ] `http://localhost:8288` shows Inngest dev UI
- [ ] No red errors in browser console on first load

### How to verify DB connection
```bash
npx prisma studio
# Should open http://localhost:5555 showing all tables including DocCache
```

### ✅ Pass condition
App loads, Prisma Studio shows tables, Inngest UI is running.

### ❌ Common failures
| Error | Fix |
|---|---|
| `PrismaClientInitializationError` | Check `DATABASE_URL` in `.env.local` |
| `Module not found` | Run `npm install` again |
| Port 3000 in use | `npx kill-port 3000` then retry |
| Inngest won't start | Make sure `INNGEST_EVENT_KEY` is set |

---

## Gate 2 — Auth Flow

**What you're testing:** Clerk auth works, new users get credits initialized.

### Checklist
- [ ] Click **Sign Up** → creates account with email
- [ ] Redirected to dashboard after signup
- [ ] Open Prisma Studio → `Credits` table → new row exists for your userId
- [ ] `balance` shows `50` (= 5 credits × 10 internal units)
- [ ] `plan` shows `free`
- [ ] Sign out → Sign in → works correctly

### How to verify
```bash
# In Prisma Studio, check Credits table
# You should see: { userId: "user_xxx", balance: 50, plan: "free" }
```

### ✅ Pass condition
Credits row exists with `balance: 50` after signup.

### ❌ Common failures
| Error | Fix |
|---|---|
| No Credits row after signup | Clerk webhook not firing — check `CLERK_WEBHOOK_SECRET` and webhook URL in Clerk dashboard |
| Redirect loop after login | Check `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` matches your Clerk app |

---

## Gate 3 — Project Creation

**What you're testing:** creating a project spins up an E2B sandbox.

### Checklist
- [ ] Click **New Project** from dashboard
- [ ] Enter any project name → confirm
- [ ] Project page loads (not a 404 or spinner forever)
- [ ] Open Prisma Studio → `Project` table → new row exists
- [ ] `sandboxId` field is populated (not null)

### ✅ Pass condition
Project row in DB has a non-null `sandboxId`.

### ❌ Common failures
| Error | Fix |
|---|---|
| `sandboxId` is null | Check `E2B_API_KEY` — sandbox creation failed silently |
| Project page 404 | Check that `[projectId]` dynamic route exists |
| E2B quota error | Check your E2B dashboard for usage limits |

---

## Gate 4 — Planner (Human-in-the-Loop)

**What you're testing:** a prompt generates a task graph and the approval UI works.

### Test prompt (use this exact one — it's simple and predictable)
```
Build a simple counter app with a button to increment and decrement
```

### Checklist
- [ ] Type the prompt and submit
- [ ] Loading state appears (SSE stream active)
- [ ] Plan approval UI renders with a task list (not blank)
- [ ] Tasks shown make sense for the prompt (at least 1 UI task)
- [ ] **Approve** button works → moves to execution
- [ ] **Edit** a task title → saves correctly
- [ ] **Reject** → returns to prompt input

### How to verify the task graph
Open browser DevTools → Network → filter `trpc` → look for `messages.getMany` response.
The message should have `planStatus: "pending"` and a `plan` JSON field.

### ✅ Pass condition
Plan renders, all three actions (approve/edit/reject) work without errors.

### ❌ Common failures
| Error | Fix |
|---|---|
| Plan never appears (spinner forever) | Check Inngest dev UI at `:8288` — is the `code-agent` function running? |
| Plan appears but tasks are empty | OpenRouter key issue — check `OPENROUTER_API_KEY` |
| JSON parse error in console | Planner returned malformed JSON — retry once, if persistent check prompt.ts `TASK_GRAPH_PLAN_PROMPT` |

---

## Gate 5 — Code Generation

**What you're testing:** the task executor runs, SSE streams to UI, files are written.

### Checklist (continuing from Gate 4 — same counter app)
- [ ] After approving the plan, generation starts automatically
- [ ] UI shows task progress in real time (not frozen)
- [ ] Each task shows a status update as it completes
- [ ] Generation finishes without an error banner
- [ ] Code preview / fragment appears in the right panel

### How to verify files were written
Check Inngest dev UI → `code-agent` function → expand the run → look for `task:result` events.
Each task should show `status: "done"` with files listed.

### ✅ Pass condition
All tasks reach `done` status, fragment renders in right panel.

### ❌ Common failures
| Error | Fix |
|---|---|
| Tasks stuck at `pending` | TaskExecutor deadlock — check for circular `dependsOn` in the plan |
| SSE disconnects immediately | Check `NEXT_PUBLIC_APP_URL` is set to `http://localhost:3000` |
| Generation errors on every task | Check OpenRouter quota — free model may be rate-limited, wait 60s and retry |

---

## Gate 6 — Search Agent & Cache

**What you're testing:** search tasks fetch docs, cache layers work, no Tavily key doesn't crash.

### Test prompt (forces a search task)
```
Add framer-motion animations to the counter buttons
```

### Checklist
- [ ] Generation runs and completes (with or without Tavily key)
- [ ] Open Prisma Studio → `DocCache` table → row exists for `framer-motion`
- [ ] Run the **same prompt again** on a new message → check Inngest logs
  - Second run should show `[search-agent] Prisma cache hit: framer-motion` in terminal
  - Should NOT make a Tavily network request
- [ ] Remove `TAVILY_API_KEY` from `.env.local`, restart, run again
  - Generation should still complete (placeholder doc written, no crash)

### ✅ Pass condition
DocCache row exists after first run. Second run logs cache hit. Works without Tavily key.

### ❌ Common failures
| Error | Fix |
|---|---|
| DocCache table missing | Run `npx prisma migrate dev --name add_doc_cache` |
| No cache hit on second run | Check `cacheKey` — description must match exactly |
| App crashes without Tavily key | Should not happen — if it does, check `fetchFromTavily` returns `{ content: '', sourceCount: 0 }` |

---

## Gate 7 — Fix Agent

**What you're testing:** TypeScript errors trigger the fix loop and respect plan limits.

### How to trigger
The fix agent runs automatically after code generation when `tsc --noEmit` finds errors.
To force it manually, introduce a type error in a generated file via the sandbox terminal.

### Checklist
- [ ] A generation with type errors shows fix loop activity in the Inngest UI
- [ ] Fix loop runs at most `maxFixLoops` times for the user's plan (free = 1)
- [ ] After fix loop, check if errors are resolved (generation succeeds)
- [ ] Inngest logs show `[fixAgent] attempt 1` (and stops at plan limit)

### ✅ Pass condition
Fix agent runs, respects the loop limit, doesn't run forever.

---

## Gate 8 — Preview & Fragment

**What you're testing:** the sandbox URL renders the generated app in the iframe.

### Checklist
- [ ] After generation completes, preview iframe loads (not blank, not 404)
- [ ] The counter app (from Gate 5) actually works — buttons increment/decrement
- [ ] Open Prisma Studio → `Fragment` table → row exists with `sandboxUrl`
- [ ] Refreshing the page preserves the preview

### ✅ Pass condition
Generated app is interactive in the preview iframe.

### ❌ Common failures
| Error | Fix |
|---|---|
| Iframe blank | E2B sandbox may have expired — try re-generating |
| `sandboxUrl` null in DB | Check E2B logs — sandbox boot may have failed |
| Preview loads but app broken | Fix agent may not have resolved all errors — check Inngest logs |

---

## Gate 9 — Billing

**What you're testing:** credits are deducted after generation, atomically, with no overdraft.

### Checklist
- [ ] Before generating: note the `balance` in Prisma Studio → `Credits`
- [ ] Run a generation (3 tasks + 1 search = base 2 + tasks 6 + search 3 = 11 units)
- [ ] After generation: `balance` should be lower by the calculated amount
- [ ] Open Prisma Studio → `CreditEvent` table → new row with `reason: "generation"`
- [ ] Set balance to `1` manually in Prisma Studio, try to generate
  - Should fail gracefully with an insufficient credits message (not a 500)

### How to manually set balance for testing
```bash
# In Prisma Studio → Credits → edit balance to 1 → save
```

### ✅ Pass condition
Credits deducted correctly. Low-balance generation fails gracefully.

### ❌ Common failures
| Error | Fix |
|---|---|
| Balance unchanged after generation | `charge-credits-v2` Inngest step failed — check Inngest UI for errors |
| Negative balance | `updateMany` atomic check not working — check `consumeCreditsV2` in `usage.ts` |
| 500 on insufficient credits | Should return structured error — check `estimateCostFromTaskGraph` |

---

## Gate 10 — GitHub Sync (Optional)

**What you're testing:** GitHub integration connects and pushes generated code.

> Skip this gate if `GITHUB_APP_ID` / `GITHUB_PRIVATE_KEY` are not configured.

### Checklist
- [ ] Go to project Settings → GitHub
- [ ] Connect a GitHub repository
- [ ] After a generation, click **Push to GitHub**
- [ ] Check the repo on GitHub — new commit should appear with generated files
- [ ] Webhook fires on push → Inngest logs show `github/push` event received

### ✅ Pass condition
Generated code appears in GitHub repo after push.

---

## Full Pass — You're Production Ready

If all gates pass:

```
Gate 1  ✅  App boots
Gate 2  ✅  Auth + credits
Gate 3  ✅  Project + sandbox
Gate 4  ✅  Planner + approval
Gate 5  ✅  Code generation
Gate 6  ✅  Search + cache
Gate 7  ✅  Fix agent
Gate 8  ✅  Preview
Gate 9  ✅  Billing
Gate 10 ✅  GitHub (optional)
```

You're ready to deploy. Refer to the **Production Deployment Notes** section in `CODEBASE_NOTES.md` before pushing to Vercel.

---

## Quick Smoke Test (after every code change)

Run this 3-step check before committing anything:

```bash
# 1. TypeScript — no type errors
npx tsc --noEmit

# 2. Build — no build failures  
npm run build

# 3. Manual — create project, run one prompt, confirm preview loads
# (Gate 3 → Gate 5 → Gate 8 in under 5 minutes)
```

If all three pass, the change is safe to ship.

---

## Gate 11 — Find Work (Job Feed)

**What you're testing:** Remotive jobs load, cache works, search and filters work.

### Checklist
- [ ] Navigate to `/find-work` — page loads without errors
- [ ] Job cards appear (may take a few seconds on first load — fetching from Remotive)
- [ ] Click a category tab (e.g. Frontend) — grid filters correctly
- [ ] Type in the search bar — results update after ~400ms debounce
- [ ] Click "View Job" on any card — opens the original listing in a new tab
- [ ] Open Prisma Studio → `JobCache` table → rows populated after first visit
- [ ] Refresh the page — jobs load instantly from DB cache (no Remotive request)
- [ ] "Find Work" link appears in the footer → navigates correctly

### How to verify cache is working
```bash
# Check terminal — on first visit you should see Remotive fetch logs
# On second visit — no fetch logs, jobs come from JobCache in DB
```

### ✅ Pass condition
Jobs display, filters work, cache populated in DB, footer link works.

### ❌ Common failures
| Error | Fix |
|---|---|
| No jobs appear | Remotive API may be temporarily down — check https://remotive.com/api/remote-jobs |
| `JobCache` table missing | Run `npx prisma migrate dev --name add_find_work` |
| tRPC error on page load | Check `findWork` is wired in `src/trpc/routers/_app.ts` |
| Search not debouncing | Check `useDebounce` hook exists in `src/hooks/use-debounce.ts` |

---

## Gate 12 — Credit Marketplace

**What you're testing:** credit packages display, Stripe checkout opens, credits are added after payment.

> Requires `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` in `.env.local`
> For local testing install Stripe CLI: `brew install stripe/stripe-cli/stripe`

### Checklist
- [ ] Navigate to `/usage` — credit packages appear below the referral card
- [ ] All 3 packages display with correct prices ($9.99, $17.99, $29.99)
- [ ] Click "Buy for $17.99" (50 credits) — redirected to Stripe Checkout
- [ ] Use test card `4242 4242 4242 4242`, any future date, any CVC
- [ ] After payment — redirected to `/usage?purchase=success&credits=50`
- [ ] Open Prisma Studio → `Credits` table → balance increased by 500 units (50 credits)
- [ ] Open Prisma Studio → `CreditPurchase` table → row with `status: "completed"`
- [ ] Open Prisma Studio → `CreditEvent` table → new row with `reason: "plan_upgrade"`

### Local webhook testing
```bash
# Terminal 1
stripe listen --forward-to localhost:3000/api/stripe/webhook

# Terminal 2
npm run dev
```

### ✅ Pass condition
Credits added to balance after successful test payment.

### ❌ Common failures
| Error | Fix |
|---|---|
| Packages don't show | Check `getCreditPackages` in usage procedures |
| Checkout redirect fails | Check `STRIPE_SECRET_KEY` is set and valid |
| Credits not added after payment | Webhook not firing — run `stripe listen` CLI |
| `CreditPurchase` table missing | Run `npx prisma migrate dev --name add_credit_purchase` |

---

## Gate 13 — Figma Import

**What you're testing:** Figma URL import generates matching code.

> Requires a Figma personal access token. Skip if not configured yet.

### Setup
1. Go to figma.com → Account Settings → Personal access tokens
2. Generate a new token with **File content (read)** scope
3. Add it to Isotope in Settings → Integrations

### Checklist
- [ ] Go to Settings → Integrations → paste Figma token → save
- [ ] On the dashboard click "Import from Figma"
- [ ] Paste a Figma frame URL (must be set to "Anyone with the link can view")
- [ ] Generation starts — task graph includes UI tasks referencing the Figma frame
- [ ] Generated code visually resembles the Figma frame layout
- [ ] Preview renders the generated UI correctly

### ✅ Pass condition
Generated code reflects the Figma frame structure — components, layout, and colours match reasonably well.

### ❌ Common failures
| Error | Fix |
|---|---|
| "Invalid Figma token" | Regenerate token — make sure File content (read) scope is enabled |
| "File not accessible" | Set the Figma file to "Anyone with the link can view" |
| Generation produces generic UI | The frame may be too abstract — use a frame with clear component boundaries |

---

## Gate 14 — Import Repo (GitHub Import)

**What you're testing:** importing an existing GitHub repo, framework detection, and AI generation using the existing codebase as context.

> Requires GitHub integration. Skip if not configured yet.

### Setup
Go to Settings → GitHub and authorise Isotope to access your repositories.

### Checklist
- [ ] From the dashboard click "Import Repo"
- [ ] Select a repository (use a simple React or Next.js repo for this test)
- [ ] Isotope analyses the repo — framework is detected correctly
- [ ] Analysis summary shows key files and dependencies
- [ ] Confirm import → project is created with `contextDocument` populated
- [ ] Open Prisma Studio → `Project` table → `contextDocument` field is not null
- [ ] Send a prompt: **"Add a dark mode toggle to the navbar"**
- [ ] Generation runs — AI references existing files, doesn't start from scratch
- [ ] Generated code integrates with existing components (not duplicate files)

### Framework conversion test (optional)
- [ ] Import a Vue or Svelte repo
- [ ] First generation should convert components to React/Next.js syntax
- [ ] Check that `<template>` blocks are gone, replaced with JSX

### ✅ Pass condition
Project created with populated `contextDocument`. AI generation references existing codebase correctly.

### ❌ Common failures
| Error | Fix |
|---|---|
| Framework not detected | Check `package.json` exists in repo root with recognisable dependencies |
| `contextDocument` is null | GitHub token may lack repo read permissions — reauthorise |
| AI ignores existing files | Vector store embedding may have failed — check Inngest logs for `embed-repo` event |
| Vue/Svelte conversion incomplete | Normal — complex framework-specific patterns need follow-up prompts to clean up |
