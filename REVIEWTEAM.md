# 📘 Isotope AI Platform — Architecture & Implementation Guide
**Version:** 1.0  
**Last Updated:** April 2026  
**Purpose:** Central reference for engineering team covering design system, AI planning/execution pipeline, frontend UI components, approval workflows, secure integration handling, and prompt architecture.

---

## 🏗️ 1. System Architecture Overview
Isotope is a human-in-the-loop AI app builder that generates, executes, and iterates on Next.js 15 + Tailwind + Shadcn applications inside an isolated E2B sandbox. The system follows a strict **Plan → Approve → Execute → Continue** lifecycle.

### Core Data Flow
1. User submits prompt → `TASK_GRAPH_PLAN_PROMPT` generates scoped JSON plan
2. Plan saved to `Message.plan` with `planStatus: pending`
3. Frontend renders **Plan Approval UI**
4. User approves → backend emits `code-agent/run` Inngest event
5. `TaskExecutor` runs tasks via DAG (parallel/sequential based on `dependsOn`)
6. Execution finishes → `Message.type: RESULT` saved with files & sandbox URL
7. Frontend renders **Next Step Suggestion** → user clicks to continue iteratively

---

## 🎨 2. Design System & UI Guidelines
**Theme:** Vercel-inspired Dark Mode (Infrastructure-grade, minimal, content-first)

### Strict Color Mapping (HSL Format for Shadcn)
| Token | Hex Value | Purpose |
|-------|-----------|---------|
| `--background` | `#0B0F14` | Dominant app background |
| `--card` / `--popover` | `#0F141A` | Panels, sidebars, containers |
| `--muted` | `#111827` | Elevated surfaces, secondary containers |
| `--border` | `#1F2937` | Thin, subtle dividers |
| `--foreground` | `#E5E7EB` | Primary text |
| `--muted-foreground` | `#9CA3AF` | Secondary/descriptive text |
| `--primary` / `--ring` | `#3B82F6` | Buttons, active states, links, focus rings |

### UI Rules
- **80/15/5 Rule:** 80% neutral dark surfaces, 15% text hierarchy, 5% accent usage
- **Single Accent:** Only `#3B82F6` allowed. No competing colors or neon gradients
- **Semantic Tokens Only:** Use `bg-background`, `text-foreground`, `border-border`, etc. Zero hardcoded hex in components
- **Content-First:** Video/code output dominates. UI chrome recedes using `--muted`/`--border`
- **Accessibility:** WCAG AA contrast, visible focus rings (`--ring`), keyboard navigable

---

## 🤖 3. AI Planning & Execution Pipeline

### Planner Output Schema (`TASK_GRAPH_PLAN_PROMPT`)
```json
{
  "tasks": [
    {
      "id": "task_1",
      "type": "ui | backend | db | integration",
      "description": "Atomic, actionable instruction",
      "files": ["exact/relative/path.ts"],
      "dependsOn": [],
      "priority": 1
    }
  ],
  "riskFlags": ["Deferred: Feature — request next"],
  "nextStep": "To continue, type: '...'"
}
```

### Scope Management Rules (Enforced in Planner)
- **MVP-First:** 1 main page → 1 data flow → basic UI → working preview
- **Hard Limits:** Max 8 tasks, 3 DB tables, 4 API routes, 12 components per cycle
- **Phasing:** DB → Backend → Integration → UI (strict dependency order)
- **Anti-Patterns:** No placeholder/mock UI for complex systems, no empty routes, no platform/app logic mixing
- **Iteration Handoff:** `nextStep` field provides exact prompt for next cycle

### Execution Model (DAG)
- `TaskExecutor` resolves `dependsOn` arrays to build execution graph
- Parallel execution where dependencies are met
- Sequential execution where `dependsOn` chains exist
- Per-task TypeScript validation → automatic fix agent on failure
- E2B sandbox persists across tasks; files restored from last fragment

---

## 🖥️ 4. Frontend UI Components

### Plan Approval Component
- **Trigger:** `message.planStatus === 'pending'`
- **Behavior:** Renders task list, risk flags (warning section), Approve/Reject buttons
- **State:** Loading states, optimistic updates, polling/subscription for status changes
- **Design:** Semantic Tailwind, Vercel dark theme, keyboard accessible, mobile responsive
- **Action:** Calls approval mutation → updates DB → triggers Inngest → UI transitions to "Building..."

### Next Step Suggestion Chip
- **Trigger:** `message.type === 'RESULT'` && valid `nextStep` in `message.plan`
- **Behavior:** Cleans text (removes prefixes/quotes), renders as subtle clickable chip
- **Action:** Auto-fills chat input on click, shifts focus, does NOT auto-submit
- **Design:** `bg-muted/50`, `border-border`, `text-muted-foreground`, hover/focus states aligned
- **Edge Cases:** Silently hides if parsing fails, no layout shift, mobile-safe tap targets

---

## 🔐 5. Approval Workflow & Backend Integration

### Mutation/API Contract
- **Endpoint:** tRPC mutation or `/api/plan-status`
- **Payload:** `{ messageId: string, action: 'approve' | 'reject' }`
- **Approve Path:** Updates `planStatus: approved` → emits `code-agent/run` event → Inngest resumes
- **Reject Path:** Updates `planStatus: rejected` → clears UI → chat remains interactive
- **Security:** Input validation, Sentry error logging, no double-submission (disabled buttons)

### Inngest Event Flow
1. Frontend calls approve mutation
2. Server updates Prisma `Message.planStatus`
3. Server calls `inngest.send({ name: 'code-agent/run', data: { messageId } })`
4. `function.ts` detects `planStatus === 'approved'` → skips planning → starts `TaskExecutor`
5. Post-execution: Architecture map update, vector store upsert, GitHub push, Vercel URL refresh

---

## 🔑 6. Secure API Key & Integration System

### 5-Layer Architecture
| Layer | Responsibility |
|-------|----------------|
| **Database** | Store keys per-project (nullable strings in `Project` or dedicated model) |
| **Platform UI** | `/project/[id]/settings/integrations` with masked inputs, format validation, secure save |
| **Backend Injection** | Fetch all keys → format to `.env.local` string → single `sandbox.files.write()` |
| **AI Enforcement** | Strict `process.env.*` rules, no hardcoded secrets, mock fallbacks |
| **Fallback/Mock** | Stub implementations + UI banners when keys missing |

### Key Handling Rules
- **NEVER** pass keys to AI prompts, frontend state, or Inngest payloads
- **ALWAYS** inject via single `.env.local` file (scales to 100+ keys without code changes)
- Next.js auto-loads `.env.local` → zero custom runtime parsing
- Missing keys → graceful mock + non-blocking setup prompt
- Platform UI masks keys by default, reveals on explicit toggle

### Guided Setup Flow (Generated App)
1. AI generates code with `process.env.VARIABLE_NAME`
2. If missing, renders: `🔑 [Service] key required` banner + "Setup" button
3. Button opens modal: masked input + save action
4. Modal calls platform API → key saved encrypted → preview reloads
5. OAuth supported? Show "Connect" button. Else: "Paste Key" flow only

---

## 📜 7. Prompt Architecture (`prompt.ts`)

### Core Prompts
| Prompt | Purpose | Key Constraints |
|--------|---------|-----------------|
| `TASK_GRAPH_PLAN_PROMPT` | Generates execution plan JSON | Strict schema, scope limits, MVP-first, `riskFlags`/`nextStep` output |
| `PROMPT` | Main coding agent | 5-step workflow, anti-overengineering, dynamic package installs, `` output |
| `BACKEND_AGENT_PROMPT` | API/backend logic | Zod validation, proper HTTP codes, Prisma/Supabase patterns, error handling |
| `DESIGN_LIBRARY` | UI component rules | Semantic tokens only, Shadcn imports, no hardcoded colors, 80/15/5 rule |

### Mandatory Output Format
All coding agents must finish with:
```xml

[High-level summary of what was built/changed]

```
- Printed once at the very end
- Never wrapped in backticks
- Parsed by `parseAgentOutput` for response generation & title creation

---

## 🗄️ 8. Data Models (Prisma Highlights)

### `Message`
- `plan`: `String?` (JSON string of task graph)
- `planStatus`: `PlanStatus?` (`pending | approved | rejected`)
- `type`: `MessageType` (`RESULT | ERROR`)
- `fragment`: Relation to generated files, sandbox URL, branch name

### `Project`
- `sandboxId`: `String?` (Persistent E2B sandbox)
- `contextDocument`: `String?` (Architecture map injected into prompts)
- Integration fields: `resendApiKey`, `supabaseUrl`, `supabaseAnonKey`, `stripeSecretKey`, etc.

### `Fragment`
- `files`: `Json` (Snapshot of generated codebase)
- `branchName`: `String?` (Git branch per generation)
- `sandboxUrl` / `deployUrl`: `String` (Preview & production links)

---

## ✅ 9. Verification & Testing Checklist

| Area | Validation Step |
|------|-----------------|
| **Planner** | Outputs valid JSON, 4–8 tasks, `riskFlags` & `nextStep` present |
| **Execution** | DAG resolves correctly, parallel where safe, `tsc` validates per task |
| **UI Components** | PlanApproval renders on `pending`, NextStep chip auto-fills input cleanly |
| **Approval Flow** | Mutation updates DB, emits Inngest event, frontend polls status correctly |
| **API Keys** | `.env.local` injected in 1 step, AI uses `process.env.*`, missing keys → mock |
| **Security** | Zero secrets in prompts/logs/frontend, encrypted storage, masked UI inputs |
| **Type Safety** | `npx tsc --noEmit` passes, `TaskGraph` type includes optional fields |

---

## 🚀 10. Future Roadmap & Scaling Notes
- **Risk Flags as Clickable Chips:** Allow users to click deferred features to auto-continue
- **Telemetry:** Track approval rates, `nextStep` click-through, task failure patterns
- **Mid-Execution Cancellation:** Inngest signal + UI cancel button for long runs
- **Team Collaboration:** Workspace-level key sharing, role-based access to integrations
- **Agent Specialization:** Split `PROMPT` into domain-specific agents (UI, DB, Auth, Deploy)
- **Sandbox Optimization:** Warm pool, incremental file sync, faster `tsc` validation

---

## 📝 How to Use This Document
1. **Engineering Onboarding:** Share as architecture baseline for new contributors
2. **Code Reviews:** Reference UI rules, prompt constraints, and data flow during PRs
3. **Feature Planning:** Use scope management & DAG rules to estimate task graphs
4. **Security Audits:** Verify `.env.local` injection, key masking, and zero-leak guarantees
5. **Iterative Updates:** Append new sections as
