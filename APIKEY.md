# TASK: Build Secure Multi-Layer Integration System for Third-Party API Keys

## 🎯 Objective
Implement a complete, secure pipeline for handling third-party service keys (Resend, Supabase, Stripe, etc.) across five distinct layers: Database, Platform UI, Backend/Inngest Injection, AI Prompt Enforcement, and Fallback/Mock Behavior. Ensure secrets never reach AI prompts, frontend state, or logs, and are only injected at runtime into the E2B sandbox.

## 📐 Architecture Layers to Build
1. **Database Layer**: Secure storage schema for project-specific integration configs
2. **Platform UI Layer**: User-facing Integrations settings page to add, update, and mask keys
3. **Backend/Inngest Layer**: Secure key retrieval and runtime injection into the E2B sandbox before AI execution
4. **AI Prompt Layer**: Strict coding rules forbidding hardcoded secrets, enforcing `process.env` usage, and handling missing keys gracefully
5. **Fallback/Mock Layer**: Stub implementations that keep previews functional when keys are missing, with clear user setup instructions

## 🧭 Step-by-Step Guidance

### Step 1: Database & Schema Extension
- Extend your Prisma schema to store integration keys securely per project
- Options: Add nullable string fields to the `Project` model, or create a dedicated `IntegrationConfig` model linked by `projectId`
- Include fields for common services: `resendApiKey`, `supabaseUrl`, `supabaseAnonKey`, `supabaseServiceKey`, `stripeSecretKey`
- Run `npx prisma generate` to update TypeScript types
- Ensure no sensitive data is exposed in GraphQL/tRPC queries unless explicitly masked

### Step 2: Platform UI Layer (Integrations Settings)
- Create a dedicated settings page: `/project/[id]/settings/integrations`
- Build a clean, sectioned form grouping services by type (Email, Database, Payments, etc.)
- Implement input fields that:
  - Mask stored values by default (show dots or asterisks)
  - Reveal on click with an "eye" toggle
  - Validate format (e.g., key length, prefix patterns like `sk_` or `pk_`)
  - Show "Saved" confirmation with loading states
- Wire inputs to a secure tRPC mutation that updates the project's integration fields
- Add clear helper text: "These keys are securely stored and only used during code execution. They never appear in AI prompts or frontend code."

### Step 3: Backend/Inngest Sandbox Injection
- In `function.ts`, locate the step that initializes or prepares the E2B sandbox for execution
- Before the AI agent runs, fetch the project's integration config from Prisma
- Inject keys into the sandbox environment using the official E2B environment injection method (`sandbox.env.set()` or equivalent)
- Map each stored field to a consistent `process.env` variable name (e.g., `RESEND_API_KEY`, `SUPABASE_SERVICE_KEY`)
- Ensure keys are only available during the execution step. Do not log, stringify, or expose them in Inngest payloads, Sentry breadcrumbs, or response payloads
- If a key is missing, inject an empty string so the sandbox environment remains consistent

### Step 4: AI Prompt Enforcement
- Update `PROMPT` and `BACKEND_AGENT_PROMPT` in `prompt.ts` with a new security section
- Explicitly forbid:
  - Hardcoding keys, tokens, or secrets in generated code
  - Creating `.env` files via `createOrUpdateFiles`
  - Logging or printing secret values in console, error messages, or UI
- Explicitly require:
  - Using `process.env.VARIABLE_NAME` for all sensitive values
  - Adding a top comment listing required env vars when a service is implemented
  - Throwing clear runtime errors if a required env var is undefined
- Align this with your existing `ENVIRONMENT` and `CODE QUALITY` sections

### Step 5: Fallback & Mock System
- Instruct the AI to implement a graceful fallback when `process.env` values are missing at runtime
- Generate stub/mock implementations that simulate successful API responses so the UI preview still works
- Add clear inline comments: `// MOCK: Replace with real API call when keys are provided in Project Settings → Integrations`
- Ensure the UI displays a non-blocking setup prompt if a critical feature is in mock mode
- Never block the preview or crash the app due to missing keys

## 🔒 Security & Data Flow Rules (NON-NEGOTIABLE)
- Secrets must NEVER appear in AI prompts, Inngest event payloads, tRPC responses, or frontend state
- Keys are only injected at runtime into the isolated E2B sandbox environment
- UI must mask stored keys by default; only reveal on explicit user interaction
- Backend must validate and sanitize all integration inputs before saving to Prisma
- Missing keys trigger mock/stub behavior + clear user instructions, never silent failures or crashes
- All env variable names must follow a consistent, documented convention

## ✅ Verification Checklist
- [ ] Prisma schema updated with integration fields, types generated
- [ ] Integrations settings page renders, masks keys, saves securely via tRPC
- [ ] Inngest step fetches project keys and injects them into sandbox before AI runs
- [ ] AI prompts updated with strict secret-handling rules
- [ ] Missing keys generate working stubs + clear setup instructions
- [ ] TypeScript compiles with zero errors
- [ ] No secrets logged, exposed in responses, or leaked to frontend
- [ ] UI shows clear "Add Integration Keys" prompt when running in mock mode

## 🔄 Expected User Flow
1. User requests feature needing third-party API (e.g., "Add email notifications with Resend")
2. AI generates code using `process.env.RESEND_API_KEY` + mock fallback
3. Preview works in stub mode with clear message: "Missing Resend API key. Add it in Settings → Integrations"
4. User navigates to Integrations page, pastes key, saves
5. Next generation run injects key into sandbox → real API works → preview updates
6. User continues building without manual `.env` management or security risks

## 📦 Final Output Requirement
After completing all steps, output exactly:
<task_summary>
Implemented secure multi-layer integration system. Added database schema for project keys, platform Integrations UI with masking, Inngest sandbox injection, AI prompt enforcement against hardcoded secrets, and graceful mock fallbacks. Ensured zero secret leakage and seamless preview-to-production workflow.
</task_summary>



# TASK: Build Scalable Project-Level `.env` Injection System

## 🎯 Objective
Implement a secure, dynamic system that injects all project integration keys (Resend, Supabase, Stripe, etc.) into the E2B sandbox as a single `.env.local` file before AI execution. Avoid hardcoded key handlers, ensure zero secret leakage to AI prompts, and maintain Next.js compatibility.

## 📐 Architecture Layers
1. **Database**: Store integration keys per-project (Prisma)
2. **Platform UI**: Masked inputs in `/project/[id]/settings/integrations`
3. **Inngest Injection**: Fetch all keys → format to `.env.local` string → write to sandbox in 1 step
4. **AI Enforcement**: Strict rules against hardcoded secrets, `process.env` only, graceful mock fallbacks
5. **Runtime**: Next.js auto-loads `.env.local`. No custom env parsing needed

## 🧭 Step-by-Step Guidance

### Step 1: Database & Schema
- Add a `ProjectIntegrations` model or nullable fields to `Project` for common keys: `resendApiKey`, `supabaseUrl`, `supabaseAnonKey`, `supabaseServiceKey`, `stripeSecretKey`
- Keep fields nullable. Missing keys = mock mode, not broken apps
- Run `npx prisma generate`

### Step 2: Platform UI (Integrations Page)
- Build `/project/[id]/settings/integrations`
- Sectioned form grouped by service type
- Inputs must:
  - Mask values by default (show dots)
  - Reveal on toggle
  - Validate format (length, prefixes)
  - Save via secure tRPC mutation
- Add helper text: "Keys are securely stored and injected at runtime. They never appear in AI prompts or frontend code."

### Step 3: Inngest Sandbox Injection (Single Step)
- In `function.ts`, locate the sandbox preparation step
- Before AI runs, fetch project integrations from Prisma
- Dynamically format all present keys into a `.env.local` string:
  `RESEND_API_KEY="sk_..."`
  `SUPABASE_URL="https://..."`
  (Only include keys that are set; skip null/empty)
- Write to sandbox workspace: `await sandbox.files.write('.env.local', envString)`
- Do NOT use 10 separate `if/else` or `env.set()` calls. Use a single dynamic map → string → write flow
- Ensure keys never appear in logs, Sentry, Inngest payloads, or AI context

### Step 4: AI Prompt Enforcement
- Update `PROMPT` and `BACKEND_AGENT_PROMPT` in `prompt.ts`:
  - NEVER hardcode API keys, tokens, or secrets
  - ALWAYS use `process.env.VARIABLE_NAME`
  - If env var is missing, implement a mock/stub with clear comment: `// MOCK: Add key in Project Settings → Integrations`
  - Throw descriptive runtime errors if a critical service is called without env vars
- Align with existing `ENVIRONMENT` and `CODE QUALITY` sections

### Step 5: Fallback & Mock Behavior
- When `process.env.*` is undefined, apps should run in stub mode
- UI should show a non-blocking banner: "Running in mock mode. Add [Service] keys in Settings → Integrations"
- Never crash or block preview due to missing keys
- Ensure mock implementations simulate realistic responses so the UI remains fully interactive

## 🔒 Security & Scalability Rules
- Zero hardcoded key handling. Use dynamic map → `.env.local` injection
- Secrets NEVER touch AI prompts, tRPC responses, or frontend state
- UI masks all keys by default
- Backend validates/sanitizes inputs before saving
- Missing keys → graceful mock + clear instructions
- Next.js auto-loads `.env.local`. No custom env parsing required

## ✅ Verification Checklist
- [ ] Prisma schema updated, types generated
- [ ] Integrations UI masks keys, saves securely via tRPC
- [ ] Inngest injects keys as single `.env.local` file (not 10 separate calls)
- [ ] AI prompts updated with strict secret-handling rules
- [ ] Missing keys trigger working stubs + clear UI prompts
- [ ] TypeScript compiles cleanly
- [ ] Zero secret leakage in logs, payloads, or frontend
- [ ] Preview works in mock mode without crashing

## 📦 Final Output Requirement
After completing all steps, output exactly:
<task_summary>
Implemented scalable project-level .env injection system. Added secure DB storage, masked Integrations UI, single-step .env.local sandbox injection, AI prompt enforcement against hardcoded secrets, and graceful mock fallbacks. Ensured zero secret leakage and seamless Next.js compatibility.
</task_summary>










# TASK: Build Secure, Scalable Integration System for Third-Party API Keys

## 🎯 Objective
Implement a complete, secure, and scalable pipeline for handling third-party service keys (Resend, Supabase, Stripe, etc.) across five distinct layers: Database, Platform UI, Backend/Inngest Injection, AI Prompt Enforcement, and Fallback/Mock Behavior. Ensure secrets never reach AI prompts, frontend state, or logs, and are injected at runtime into the E2B sandbox via a single `.env.local` file — supporting 1 key or 100 keys with zero code changes.

## 📐 Architecture Layers to Build
1. **Database Layer**: Secure storage schema for project-specific integration configs
2. **Platform UI Layer**: User-facing Integrations settings page to add, update, and mask keys
3. **Backend/Inngest Layer**: Fetch all keys → format to `.env.local` string → write to sandbox in ONE dynamic step
4. **AI Prompt Layer**: Strict coding rules forbidding hardcoded secrets, enforcing `process.env` usage, and handling missing keys gracefully
5. **Fallback/Mock Layer**: Stub implementations that keep previews functional when keys are missing, with clear user setup instructions

## 🧭 Step-by-Step Guidance

### Step 1: Database & Schema Extension
- Extend your Prisma schema to store integration keys securely per project
- Options: Add nullable string fields to the `Project` model, or create a dedicated `IntegrationConfig` model linked by `projectId`
- Include fields for common services: `resendApiKey`, `supabaseUrl`, `supabaseAnonKey`, `supabaseServiceKey`, `stripeSecretKey`, `githubToken`, etc.
- Run `npx prisma generate` to update TypeScript types
- Ensure no sensitive data is exposed in GraphQL/tRPC queries unless explicitly masked

### Step 2: Platform UI Layer (Integrations Settings)
- Create a dedicated settings page: `/project/[id]/settings/integrations`
- Build a clean, sectioned form grouping services by type (Email, Database, Payments, Auth, etc.)
- Implement input fields that:
  - Mask stored values by default (show dots or asterisks)
  - Reveal on click with an "eye" toggle
  - Validate format (e.g., key length, prefix patterns like `sk_`, `pk_`, `res_`)
  - Show "Saved" confirmation with loading states
- Wire inputs to a secure tRPC mutation that updates the project's integration fields
- Add clear helper text: "These keys are securely stored and injected at runtime. They never appear in AI prompts or frontend code."

### Step 3: Backend/Inngest Sandbox Injection (SCALABLE PATTERN)
- In `function.ts`, locate the step that initializes or prepares the E2B sandbox for execution
- Before the AI agent runs, fetch the project's integration config from Prisma
- Dynamically format ALL present keys into a single `.env.local` string:

`
  RESEND_API_KEY="sk_..."
  SUPABASE_URL="https://..."
  SUPABASE_ANON_KEY="eyJ..."
  STRIPE_SECRET_KEY="sk_test_..."
  ```
  (Only include keys that are set and non-empty; skip null/undefined)
- Write to sandbox workspace in ONE step: `await sandbox.files.write('.env.local', envString)`
- ⚠️ DO NOT use individual `sandbox.env.set()` calls per key. Use the dynamic map → string → write pattern so it scales to any number of integrations.
- Ensure keys never appear in logs, Sentry breadcrumbs, Inngest payloads, AI context, or response payloads
- Next.js automatically loads `.env.local` on startup — no custom env parsing required

### Step 4: AI Prompt Enforcement
- Update `PROMPT` and `BACKEND_AGENT_PROMPT` in `prompt.ts` with a new security section:
  ```
  ═══════════════════════════════════════════════════════
  SECURE ENVIRONMENT & API KEY HANDLING (CRITICAL)
  ═══════════════════════════════════════════════════════
  - NEVER hardcode API keys, tokens, or secrets in generated code
  - ALWAYS use process.env.VARIABLE_NAME for sensitive values
  - Document required env vars in a comment at the top of the file: // Required: RESEND_API_KEY, SUPABASE_URL
  - If a service requires client-side keys (e.g., Supabase anon key), prefix with NEXT_PUBLIC_ and use env vars
  - If env vars are missing in the sandbox, generate working stub code that throws a clear runtime error:
    throw new Error("Missing RESEND_API_KEY. Add it to your project settings or .env.local")
  - Do NOT create .env files with createOrUpdateFiles. The platform injects them automatically via .env.local
  - NEVER log, print, or expose secret values in console, error messages, or UI
  ```
- Align this with your existing `ENVIRONMENT` and `CODE QUALITY` sections

### Step 5: Fallback & Mock System
- Instruct the AI to implement a graceful fallback when `process.env` values are missing at runtime
- Generate stub/mock implementations that simulate successful API responses so the UI preview still works
- Add clear inline comments: `// MOCK: Replace with real API call when keys are provided in Project Settings → Integrations`
- Ensure the UI displays a non-blocking setup prompt if a critical feature is in mock mode:
  "Running in mock mode. Add [Service] keys in Settings → Integrations to enable real functionality."
- Never block the preview or crash the app due to missing keys

## 🔒 Security & Scalability Rules (NON-NEGOTIABLE)
- Secrets must NEVER appear in AI prompts, Inngest event payloads, tRPC responses, or frontend state
- Keys are injected at runtime into the isolated E2B sandbox via a SINGLE `.env.local` file — not individual `env.set()` calls
- UI must mask stored keys by default; only reveal on explicit user interaction
- Backend must validate and sanitize all integration inputs before saving to Prisma
- Missing keys trigger mock/stub behavior + clear user instructions, never silent failures or crashes
- All env variable names must follow a consistent, documented convention (e.g., `RESEND_API_KEY`, `SUPABASE_URL`)
- Next.js auto-loads `.env.local`. No custom runtime env parsing required

## ✅ Verification Checklist
- [ ] Prisma schema updated with integration fields, types generated
- [ ] Integrations settings page renders, masks keys, saves securely via tRPC
- [ ] Inngest step fetches project keys and injects them as SINGLE `.env.local` file (not 10 separate calls)
- [ ] AI prompts updated with strict secret-handling rules
- [ ] Missing keys generate working stubs + clear setup instructions
- [ ] TypeScript compiles with zero errors
- [ ] No secrets logged, exposed in responses, or leaked to frontend
- [ ] UI shows clear "Add Integration Keys" prompt when running in mock mode
- [ ] `.env.local` injection works for 1 key AND 10 keys without code changes

## 🔄 Expected User Flow
1. User requests feature needing third-party API (e.g., "Add email notifications with Resend")
2. AI generates code using `process.env.RESEND_API_KEY` + mock fallback
3. Preview works in stub mode with clear message: "Missing Resend API key. Add it in Settings → Integrations"
4. User navigates to Integrations page, pastes key, saves
5. Next generation run injects key into sandbox via `.env.local` → real API works → preview updates
6. User continues building without manual `.env` management or security risks

## 📦 Final Output Requirement
After completing all steps, output exactly:

Implemented secure, scalable integration system. Added database schema for project keys, masked Integrations UI, single-step .env.local sandbox injection (supports 1-100 keys), AI prompt enforcement against hardcoded secrets, and graceful mock fallbacks. Ensured zero secret leakage, Next.js compatibility, and seamless preview-to-production workflow.

```

### 📍 How to Use
1. **Copy the entire block above**
2. **Paste it directly into your AI coding agent's chat**
3. The agent will:
   - Extend your Prisma schema
   - Build the Integrations UI with masked inputs
   - Implement the scalable `.env.local` injection in `function.ts`
   - Update your prompts with security rules
   - Add mock fallback logic
   - Output the required ``

### 🔗 Why This Is the Definitive Version
| Feature | Why It Matters |
|---------|---------------|
| **Single `.env.local` injection** | Scales to any number of keys without code changes. No `if/else` chains. |
| **Next.js native loading** | `.env.local` is auto-loaded. Zero custom runtime parsing. |
| **Zero secret leakage** | Keys never touch AI prompts, frontend, or logs. |
| **Mock fallbacks** | Previews stay functional even without keys. Clear user guidance. |
| **5-layer architecture** | Complete, production-grade pipeline from DB to UI to runtime. |

Pas



ADD TO PROMPT OR BACKEND AGENT PROMPT

APEND IT TO YOU ENVIROMENT OR CODE QUALITY

═══════════════════════════════════════════════════════
SECURE ENVIRONMENT & API KEY HANDLING (CRITICAL)
═══════════════════════════════════════════════════════
- NEVER hardcode API keys, secrets, tokens, or passwords in generated code.
- ALWAYS use process.env.VARIABLE_NAME for sensitive values.
- Document required env vars in a comment at the top of the file: // Required: RESEND_API_KEY, SUPABASE_URL
- If a service requires client-side keys (e.g., Supabase anon key), prefix with NEXT_PUBLIC_ and use env vars.
- If env vars are missing in the sandbox, generate working stub code that throws a clear runtime error: 
  throw new Error("Missing RESEND_API_KEY. Add it to your project settings or .env.local")
- Do NOT create .env files with createOrUpdateFiles. The platform injects them automatically.
- NEVER log, print, or expose secret values in console, error messages, or UI.
- 



# TASK: Implement Guided API Key Setup & Secure Handling Flow

## 🎯 Objective
Create a complete system for handling third-party API keys (Resend, Supabase, Stripe, etc.) where:
1. The AI NEVER hardcodes keys and uses `process.env` only.
2. If a key is missing, the AI generates working mock code + a UI banner prompting the user to add the key.
3. Users can paste keys securely via a modal in the generated app.
4. The platform stores keys encrypted and injects them into the sandbox via `.env.local`.

## 📐 Architecture Layers
1. **Database**: Secure storage for project integration keys.
2. **AI Behavior**: Rules for `process.env` usage and mock generation.
3. **Generated App UI**: "Missing Key" banner + Setup Modal.
4. **Platform Backend**: API to save keys + Sandbox injection.

## 🧭 Step-by-Step Guidance

### Step 1: Database Extension (Prisma)
- Add nullable fields to the `Project` model for common keys:
  `resendApiKey`, `supabaseUrl`, `supabaseAnonKey`, `supabaseServiceKey`, `stripeSecretKey`.
- Run `npx prisma generate` to update types.

### Step 2: AI Prompt Enforcement (Update `prompt.ts`)
Add this section to `PROMPT` and `BACKEND_AGENT_PROMPT`:

ate `prompt.ts`)
Add this section to `PROMPT` and `BACKEND_AGENT_PROMPT`:
```
═══════════════════════════════════════════════════════
SECURE ENVIRONMENT & MISSING KEY HANDLING (CRITICAL)
═══════════════════════════════════════════════════════
- NEVER hardcode API keys. ALWAYS use process.env.VARIABLE_NAME.
- If a required env var (e.g., RESEND_API_KEY) is NOT available:
  1. Generate working mock/stub code so the UI does not crash.
  2. Render a visible banner: "🔑 Missing [Service] Key" with a "Setup" button.
  3. The "Setup" button should open a modal input to save the key.
- Do NOT create .env files manually. The platform injects them automatically.
- NEVER log or print secret values.
```

### Step 3: Generated App UI (Setup Modal)
- Instruct the AI to create a reusable component `components/integrations/api-key-modal.tsx`.
- When the modal opens:
  - Show a masked input field for the key.
  - Show a "Save" button.
  - Include helper text: "This key is stored securely. You can find it in your [Service] dashboard."
- On save: Call a local API route (e.g., `/api/integrations/save`) to send the key to the platform.

### Step 4: Platform Backend (Save Key)
- Create a secure API route or tRPC mutation to receive the key.
- Encrypt the key before saving it to the `Project` model in Prisma.
- Return a success response so the frontend can reload the preview.

### Step 5: Sandbox Injection (`function.ts`)
- In the Inngest execution step (before the AI runs):
  - Fetch all saved integration keys for the project from Prisma.
  - Dynamically format them into a single `.env.local` string:
    `RESEND_API_KEY="sk_..."\nSUPABASE_URL="https://..."`
  - Write to sandbox: `await sandbox.files.write('.env.local', envString)`
- Do NOT use separate `env.set()` calls. Use the single `.env.local` write pattern.
- Ensure keys are NEVER logged or exposed to the AI context.

## ✅ Verification Checklist
- [ ] Prisma schema updated, types generated.
- [ ] AI rules updated to enforce `process.env` and mock generation.
- [ ] Generated app includes "Missing Key" banner + Setup Modal.
- [ ] Backend route securely saves keys to Prisma (encrypted).
- [ ] Sandbox injects keys via `.env.local` before execution.
- [ ] TypeScript compiles with zero errors.
- [ ] No secrets leaked in logs or prompts.

## 📦 Final Output Requirement
After completing all steps, output exactly:

Implemented guided API key setup flow. Adde



