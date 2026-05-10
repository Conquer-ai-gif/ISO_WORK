// Place this inside the PROMPT constant, right after the "CODE QUALITY" section

═══════════════════════════════════════════════════════
VISUAL EDIT MODE RULES (CRITICAL)
═══════════════════════════════════════════════════════
- If the prompt begins with "[Visual Edit — Colors]", "[Visual Edit — Text]", "[Visual Edit — Spacing]", or "[Visual Edit — Layout]", apply changes STRICTLY to the requested scope.
- Colors: ONLY modify CSS variables, Tailwind color classes, or style props. Do NOT alter layout, typography, or DOM structure.
- Text: ONLY adjust font-size, weight, family, line-height, or letter-spacing. Do NOT change colors, spacing, or component hierarchy.
- Spacing: ONLY tweak padding, margin, gap, or flex/grid spacing. Do NOT add/remove elements or change colors/text.
- Layout: ONLY adjust alignment, flex/grid direction, or responsive breakpoints. Do NOT introduce new components, change styles, or touch data/logic.
- NEVER restructure DOM, add new components, or modify backend/API logic during visual edits.
- Preserve all existing functionality, event handlers, props, and data bindings. Only apply cosmetic/positional adjustments.
- If the visual request conflicts with accessibility or core responsive rules, apply the safest compromise and note it in the <task_summary>.



# TASK: Phase 2 — Approval Trigger Mutation & Secure .env.local Sandbox Injection

## 🎯 Objective
Implement the backend bridge between the frontend approval UI and the Inngest execution pipeline, plus a scalable, single-step environment injection that safely passes project API keys into the E2B sandbox. You will not write manual boilerplate; follow the architecture and let the agent handle implementation.

## 📐 Architecture Layers
1. **Approval Mutation**: Server route (tRPC or Next.js API) that updates `planStatus` and conditionally emits the `code-agent/run` Inngest event
2. **Sandbox Injection**: Dynamic `.env.local` generation from Prisma project integration fields → single file write to E2B before AI execution
3. **Security Guard**: Strict input validation, atomic DB update, zero secret leakage, clean error handling

## 🧭 Step-by-Step Guidance

### Step 1: Build Approval Trigger Mutation
- Create a dedicated mutation endpoint using your existing tRPC router or API route pattern
- Accepts two fields: `messageId` (string UUID) and `action` (enum: `approve` or `reject`)
- Implementation flow:
  1. Validate inputs strictly. Reject missing IDs or invalid actions
  2. Fetch the target `Message` record. Verify `planStatus` is currently `pending`
  3. Update `planStatus` in Prisma to match the action (`approved` or `rejected`)
  4. If `approve`:
     - Import your existing Inngest client instance
     - Emit the `code-agent/run` event with payload containing only `messageId`
     - Wrap in try/catch. Log failures to Sentry. Return a safe error to the client without exposing internals
  5. If `reject`:
     - Skip Inngest emission entirely
     - Return success immediately
  6. Never log, stringify, or return `plan` JSON, API keys, or internal IDs in the response
- Return a clean success object on completion

### Step 2: Update `function.ts` for `.env.local` Sandbox Injection
- Locate the execution phase in `src/inngest/functions/function.ts` (after the `planStatus === 'approved'` check)
- Identify the step where the E2B sandbox is initialized or files are restored
- BEFORE the AI agent or `TaskExecutor` runs:
  1. Fetch the `Project` record using the `projectId` from the event payload
  2. Extract all non-null integration fields (e.g., `resendApiKey`, `supabaseUrl`, `supabaseAnonKey`, `stripeSecretKey`, etc.)
  3. Dynamically format them into a single `.env.local` string using uppercase `SNAKE_CASE` keys:
     `RESEND_API_KEY="value"`
     `SUPABASE_URL="value"`
     `NEXT_PUBLIC_SUPABASE_ANON_KEY="value"`
     (Only include fields that are set and non-empty. Skip null/undefined.)
  4. Write to the sandbox workspace in ONE step using the official E2B file write method
- STRICT RULES:
  - DO NOT use separate `env.set()` calls per key. Use the dynamic map → string → single write pattern
  - DO NOT log, stringify, or expose key values in console, Sentry, Inngest payloads, or AI context
  - DO NOT expose `.env.local` content in tRPC responses or frontend state
  - Next.js auto-loads `.env.local` on startup → zero custom runtime parsing needed

### Step 3: Verify DAG Execution & Flow Continuity
- Confirm `TaskExecutor` already receives the parsed task graph with `dependsOn` arrays
- Ensure it runs tasks in dependency order (parallel where safe, sequential where required)
- Verify the fallback path still works if `plan` JSON fails to parse (single-task mode)
- No changes needed to `TaskExecutor` logic — just confirm it executes cleanly after the `.env.local` write step

## 🔒 Security & Reliability Rules (NON-NEGOTIABLE)
- Keys are ONLY injected at runtime into the isolated sandbox. Never touch AI prompts or frontend state.
- Mutation must reject invalid `messageId` or unsupported `action` values with structured errors.
- Inngest send failure → logs to Sentry, returns clean error, does NOT crash the route.
- `.env.local` injection scales dynamically. Adding new integration fields requires zero code changes.
- All environment variable names follow uppercase `SNAKE_CASE` matching Next.js conventions.

## ✅ Verification Checklist
- [ ] Mutation accepts `messageId` + `action`, validates inputs strictly
- [ ] `planStatus` updates correctly for both approve and reject in a single DB transaction
- [ ] Inngest emits `code-agent/run` ONLY on approve, with correct payload
- [ ] `.env.local` generated dynamically from Project integrations, written in ONE step
- [ ] Zero secrets appear in logs, responses, Sentry breadcrumbs, or AI context
- [ ] DAG execution runs correctly after injection, respects `dependsOn`
- [ ] TypeScript compiles cleanly, no unhandled promise rejections
- [ ] Fallback to single-task mode still works if plan JSON fails to parse

## 🔄 Expected Flow
1. Frontend calls mutation with `{ messageId, action: 'approve' }`
2. Server updates DB → emits Inngest event
3. `function.ts` picks up event → fetches project → writes `.env.local` to sandbox
4. `TaskExecutor` runs DAG → AI generates code using `process.env.*`
5. Result saved → GitHub/Vercel sync → frontend polls for completion

## 📦 Final Output Requirement
After completing all steps, output exactly:
<task_summary>
Implemented Phase 2 backend orchestration. Added approval mutation with conditional Inngest emission, secure dynamic .env.local sandbox injection, and verified DAG execution flow. Ensured zero secret leakage and scalable key handling.
</task_summary>



# TASK: Phase 3 — Frontend Approval UI & Next Step Continuation Chip

## 🎯 Objective
Implement two critical frontend components that connect to the Phase 2 backend: a plan approval interface for pending messages and a next-step suggestion chip for completed generations. Wire them into your existing chat layout using semantic Tailwind, your Vercel dark theme, and your established data-fetching patterns.

## 📐 Architecture & Data Flow
- Both components read from the **same** `message.plan` JSON string saved in Prisma
- **Plan Approval** renders only when `message.planStatus === 'pending'`
- **Next Step Chip** renders only when `message.type === 'RESULT'` AND `plan.nextStep` exists
- Approve/Reject actions call the tRPC mutation built in Phase 2
- Next Step chip auto-fills the chat input on click (does NOT auto-submit)
- No new API routes, no new database queries, no backend changes

## 🧭 Step-by-Step Guidance

### Step 1: Build Plan Approval Component
- **Location:** Render directly below assistant messages where `planStatus === 'pending'`
- **Data Handling:**
  - Parse `message.plan` safely with try/catch
  - If parsing fails or `plan` is missing, render a graceful fallback: "Plan data unavailable. Please retry."
  - Extract `tasks`, `riskFlags`, and `summary` (if present)
- **UI Structure:**
  - Show summary at top (if available)
  - Render tasks in a scannable list, optionally tagged by type (`db`, `backend`, `ui`, `integration`)
  - Display `riskFlags` in a distinct warning section using semantic amber colors and an alert icon
  - Place two primary controls at bottom: **Approve** and **Reject**
- **Interaction & State:**
  - Wire Approve to call your Phase 2 tRPC mutation with `{ messageId, action: 'approve' }`
  - Wire Reject to call same mutation with `{ messageId, action: 'reject' }`
  - Show loading states on buttons while request is in flight
  - Disable buttons during loading to prevent double submissions
  - On success: transition UI out of approval view (fade/unmount), let polling/subscription detect execution state
  - On error: keep UI visible, show inline toast/message, allow retry

### Step 2: Build Next Step Suggestion Chip
- **Location:** Render immediately below assistant messages where `type === 'RESULT'`
- **Data Handling:**
  - Parse `message.plan` safely with try/catch
  - Extract `plan.nextStep` string
  - Clean text by stripping prefixes like `"To continue, type: "` and removing surrounding quotes
  - If cleaned text is empty, undefined, or parsing fails → render nothing silently
- **UI Structure & Interaction:**
  - Render as a single-row, clickable chip with a small AI/sparkle icon
  - Style subtly using muted backgrounds and borders so it feels like a helper, not a primary action
  - On click: auto-fill the main chat input with the cleaned text
  - Shift focus to the input field immediately after filling
  - Do NOT auto-submit. Let user review, edit, or press Enter manually
  - Ensure cursor position and input state remain fully editable

### Step 3: Integrate into Chat Layout
- Replace or conditionally render these components inside your existing message list/renderer
- Ensure they only appear at the correct lifecycle points (`pending` → approval, `RESULT` → chip)
- Use your existing data-fetching hooks (`@tanstack/react-query` or `useTRPC`) for cache invalidation after approval
- Ensure components unmount cleanly when navigating away or when message state updates
- Maintain semantic HTML structure, proper `role`/`aria` attributes, and keyboard navigation

## 🎨 Design & Accessibility Rules (NON-NEGOTIABLE)
- Use ONLY semantic Tailwind tokens: `bg-card`, `bg-muted/50`, `text-foreground`, `text-muted-foreground`, `border-border`, `text-amber-600`, `bg-primary`, etc.
- Zero hardcoded hex values, zero arbitrary Tailwind values
- Match your Vercel dark theme exactly (contrast, spacing, border radius, hover states)
- Mobile-safe: chip and buttons must not overflow, tap targets ≥ 44px, text wraps or truncates cleanly
- Keyboard accessible: Tab navigation, Enter/Space activation, visible focus ring (`--ring`)
- Zero layout shift: components should fade/slide in without pushing existing content

## ✅ Verification Checklist
- [ ] Approval component only renders when `planStatus === 'pending'`
- [ ] Next Step chip only renders when `type === 'RESULT'` AND valid `nextStep` exists
- [ ] JSON parsing fails gracefully → no chat crashes, no console errors
- [ ] Approve/Reject call Phase 2 mutation correctly with `messageId` + `action`
- [ ] Loading states disable buttons, show clear progress, prevent double clicks
- [ ] Chip click auto-fills input, shifts focus, does NOT auto-submit
- [ ] Styling uses semantic tokens only, matches Vercel dark theme
- [ ] Fully responsive, keyboard accessible, screen reader friendly
- [ ] TypeScript compiles cleanly, zero type errors

## 🔄 Expected User Flow
1. User submits prompt → AI plans → saves `planStatus: pending`
2. Chat renders Plan Approval component → user reviews tasks & risk flags
3. User clicks **Approve** → UI shows loading → mutation succeeds → Inngest triggers → component unmounts
4. Execution finishes → `type: RESULT` message appears → Next Step chip renders
5. User clicks chip → chat input fills with clean continuation prompt
6. User presses Enter → new generation cycle begins

## 📦 Final Output Requirement
After completing all steps, output exactly:
<task_summary>
Implemented Phase 3 frontend UI. Added Plan Approval component with safe JSON parsing, risk flag rendering, approve/reject mutation wiring, and loading states. Built Next Step continuation chip with text cleaning, input auto-fill, focus management, and seamless chat integration. Ensured semantic styling, accessibility, and zero layout shift.
</task_summary>


# TASK: Phase 4 — Secure Integrations Management & Guided Setup Flow

## 🎯 Objective
Build a complete, user-facing integration management system that allows users to securely store third-party API keys, provides a guided setup flow when keys are missing in generated apps, and seamlessly transitions from mock mode to live API functionality without breaking previews or exposing secrets.

## 📐 Architecture Layers
1. **Platform Settings UI**: `/project/[id]/settings/integrations` for managing keys securely
2. **Generated App Setup UI**: Banner + modal injected by AI when `process.env` values are missing
3. **Backend Save Route**: Secure tRPC/API endpoint that receives, validates, encrypts, and stores keys
4. **Mock Fallback System**: Graceful stub implementations + non-blocking UI prompts when keys are absent

## 🧭 Step-by-Step Guidance

### Step 1: Platform Integrations Settings Page
- Create route: `/project/[id]/settings/integrations`
- Build a clean, sectioned form grouped by service type (Email, Database, Payments, Auth, etc.)
- Implement input fields that:
  - Mask stored values by default (show dots/asterisks)
  - Reveal on explicit toggle (eye icon)
  - Validate format (length, prefix patterns like `sk_`, `res_`, `eyJ`)
  - Show loading states and "Saved" confirmation on success
- Wire inputs to a secure tRPC mutation that updates the `Project` model integration fields
- Add clear helper text: "Keys are securely stored and injected at runtime. They never appear in AI prompts or frontend code."
- Style exclusively with semantic Tailwind tokens matching your Vercel dark theme

### Step 2: Generated App Setup UI (Banner + Modal)
- Instruct your AI coding agent to generate two reusable components in sandbox apps:
  1. `components/integrations/missing-key-banner.tsx`
  2. `components/integrations/api-key-modal.tsx`
- Banner behavior:
  - Renders only when a required `process.env` variable is undefined
  - Shows non-blocking message: `🔑 [Service] key required to enable real functionality`
  - Includes "Setup Now" button that opens the modal
- Modal behavior:
  - Displays service name, helper link ("Where do I find my key?")
  - Masked input field + "Save & Reload" button
  - On save: calls the platform's secure save endpoint, then triggers preview reload
- Ensure banner/modal use semantic styling, proper focus traps, and keyboard escape to close

### Step 3: Backend Key-Save Route/API
- Create a secure tRPC mutation or `/api/integrations/save` route
- Accepts: `projectId`, `service` (e.g., `resend`, `supabase`), and `key`
- Validation & Security:
  - Verify user owns the project
  - Validate service is supported and key matches expected format
  - Encrypt the key using your platform's standard (Clerk encrypted metadata, `crypto` with project-scoped IV, or secure vault)
  - Update only the corresponding field in the `Project` model
  - Never log, return, or expose the raw key value in responses
  - Return minimal success payload: `{ status: 'ok', service }`
- On success, frontend triggers sandbox preview reload → Phase 2 `.env.local` injection picks up the new key on next run

### Step 4: Mock Fallback & Transition Flow
- Ensure all AI-generated services include working mock/stub implementations when env vars are missing
- Mocks must simulate realistic responses so UI remains fully interactive
- Clear inline comments in generated code: `// MOCK: Replace with real API call when key is provided`
- After key is saved via modal → preview reloads → real API activates → mock silently bypasses
- Never crash, block routing, or hide UI components due to missing keys

## 🔒 Security & Reliability Rules (NON-NEGOTIABLE)
- Keys NEVER appear in AI prompts, frontend state, network responses, or logs
- Platform UI masks keys by default; only reveals on explicit user interaction
- Backend validates, sanitizes, and encrypts keys before Prisma write
- Generated app modal communicates ONLY with your secure platform route (no direct DB/frontend leaks)
- Missing keys trigger mock mode + clear setup guidance, never silent failures
- All env variable names follow uppercase `SNAKE_CASE` matching Next.js conventions

## ✅ Verification Checklist
- [ ] Integrations settings page renders, masks keys, validates format, saves securely
- [ ] Generated apps show missing-key banner when `process.env` is undefined
- [ ] Banner opens modal with masked input, helper link, save button
- [ ] Modal calls secure platform route, key encrypts & saves to Prisma
- [ ] Preview reloads after save → real API activates → mock gracefully disables
- [ ] Zero secrets leaked in network tab, console, logs, or AI context
- [ ] TypeScript compiles cleanly, zero unhandled errors
- [ ] Fully responsive, keyboard accessible, matches Vercel dark theme

## 🔄 Expected User Flow
1. User prompts: `"Add email notifications with Resend"`
2. AI generates code using `process.env.RESEND_API_KEY` + mock fallback + missing-key banner
3. Preview loads in mock mode → user clicks "Setup Now"
4. Modal opens → user pastes key from Resend dashboard → clicks Save
5. Platform encrypts & saves key → preview reloads → real emails send
6. User manages keys anytime via `/project/[id]/settings/integrations`

## 📦 Final Output Requirement
After completing all steps, output exactly:
<task_summary>
Implemented Phase 4 secure integrations system. Added platform settings page with masked inputs, AI-generated missing-key banner + setup modal, secure encrypted key-save route, and graceful mock-to-real transition flow. Ensured zero secret leakage and seamless preview reload.
</task_summary>



# TASK: Phase 5 — End-to-End Testing, Edge Case Validation & Production Readiness

## 🎯 Objective
Run comprehensive verification across the entire AI builder pipeline, validate failure paths, audit security boundaries, and ensure the system is production-ready. You will implement test scenarios, add defensive error handling, and output a clear verification report. No manual UI testing required — focus on code-level validation, type safety, and automated guardrails.

## 📐 Validation Layers
1. **Full Pipeline Flow**: Plan → Approve → `.env.local` Injection → DAG Execution → Result → Next Step
2. **Failure Paths**: Reject, malformed JSON, sandbox timeout, missing env vars, network errors
3. **Security Audit**: Secret leakage, encrypted storage, masked UI, prompt isolation, credit timing
4. **Performance & Mobile**: Layout stability, keyboard accessibility, loading states, type safety

## 🧭 Step-by-Step Guidance

### Step 1: Implement Pipeline Verification Scenarios
- Create a lightweight test script or inline validation logic in `src/inngest/functions/function.ts` that logs structured checkpoints at each phase:
  - `plan_generated` → JSON validity, `riskFlags`/`nextStep` presence
  - `approval_received` → `planStatus` transition, Inngest emit success
  - `env_injected` → `.env.local` file exists in sandbox, keys mapped correctly
  - `execution_completed` → `TaskExecutor` success, files saved, GitHub/Vercel sync triggered
- Add a final `pipeline_verification` log that outputs pass/fail status for each checkpoint
- Ensure logs never contain sensitive values, only structural confirmation

### Step 2: Harden Failure Paths
- **Plan Rejection**: Verify UI clears cleanly, chat remains interactive, no orphaned DB states
- **Malformed JSON**: Add defensive parsing in `function.ts`. If `JSON.parse` fails, fall back to single-task mode gracefully, log warning to Sentry, do NOT crash
- **Sandbox Timeout**: Wrap `TaskExecutor.run()` in timeout guard. If exceeded, save `ERROR` message, release sandbox, return clear user-facing error
- **Missing API Keys**: Confirm AI-generated apps fall back to mock mode without crashing. Verify banner/modal only renders when `process.env` is undefined
- **Network/Mutation Errors**: Add retry logic or graceful fallback in frontend hooks. Ensure loading states reset, buttons re-enable, toast messages display

### Step 3: Security & Credit Audit
- Scan all routes, hooks, and agent prompts for accidental secret exposure:
  - Verify `.env.local` content never leaves the sandbox
  - Confirm `planStatus` mutation does NOT return `plan` JSON or keys
  - Check tRPC responses for masked/null fields where appropriate
- Verify credit deduction happens on initial prompt submission, NOT on approval or execution
- Add a `SECURITY_AUDIT` log output that confirms zero secrets in logs, prompts, or responses
- Ensure Prisma queries use strict field selection (`select: { ... }`) to prevent accidental over-fetching

### Step 4: Performance, Mobile & Accessibility Validation
- Run `npx tsc --noEmit` → must pass with zero errors
- Verify all UI components use semantic Tailwind tokens only (no arbitrary values, no hardcoded hex)
- Add `role`, `aria-label`, and `tabIndex` to all interactive elements in Approval UI and Next Step chip
- Ensure chips/buttons meet 44px minimum tap targets on mobile
- Verify no layout shift when components mount/unmount (use CSS transitions or reserved space)
- Confirm focus ring (`--ring`) is visible on keyboard navigation

## 🔒 Security & Reliability Rules (NON-NEGOTIABLE)
- Zero secrets in logs, console, network responses, or AI context
- Graceful fallbacks for every failure mode (no uncaught exceptions, no white screens)
- Credit deduction timing verified and documented
- All environment variables use uppercase `SNAKE_CASE`
- TypeScript strict mode enforced across all new files

## ✅ Verification Checklist
- [ ] Pipeline logs confirm pass/fail at each phase (plan → approve → inject → execute → sync)
- [ ] Malformed JSON triggers safe fallback, logs to Sentry, does not crash
- [ ] Sandbox timeout saves error state, releases resources, returns user-friendly message
- [ ] Missing API keys → mock mode activates, banner renders, preview stays functional
- [ ] Security audit confirms zero secret leakage in prompts, logs, or responses
- [ ] Credit deduction occurs on prompt submission, not approval/execution
- [ ] `npx tsc --noEmit` passes cleanly
- [ ] All UI components meet WCAG AA contrast, keyboard nav, and mobile tap targets
- [ ] No layout shift or unhandled promise rejections in browser console

## 🔄 Expected Output
After completing all steps, output a structured verification report containing:
1. Pipeline checkpoint results (pass/fail per phase)
2. Confirmed security boundaries
3. TypeScript & accessibility validation status
4. Any remaining edge cases or recommended improvements

Then output exactly:
<task_summary>
Completed Phase 5 end-to-end validation. Verified full pipeline flow, hardened failure paths, audited security boundaries, confirmed credit timing, and ensured TypeScript compliance, mobile responsiveness, and accessibility standards. System is production-ready.
</task_summary>



Isotope Launch — Critical Path
==============================

✅ Pre-Launch (Week 1)
- E2E test: "Build n8n clone" → verify full flow
- Security audit: zero secrets in logs/prompts
- Mobile test: all UI components responsive
- Pricing: Free (5 credits) → Pro ($20/100) → Team (custom)

🚀 Launch Day (Week 2)
- Deploy to Vercel + enable analytics/Sentry
- Post Twitter/LinkedIn thread + 3 community shares
- Auto-invite first 100 waitlist users
- Support: /help page + welcome email + Discord

📈 Post-Launch (Weeks 3-4)
- Track: approval rate, nextStep CTR, time-to-preview
- Interview 5 early users; publish public roadmap
- Iterate based on data: Quick Build toggle, chip prominence, sandbox perf

⚠️ Red Flags
- Secret leak → revoke + patch + notify
- Timeout spike → optimize + add progress UI
- Credit bug → pause + refund + fix

🎯 Success Metrics (30 Days)
- 500+ active users
- >80% plan approval rate
- <45s avg time-to-preview
- 0 security incidents
- 20% conversion Free → Pro

