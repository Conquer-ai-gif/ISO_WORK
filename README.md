# Isotope

An AI-powered app builder. Describe what you want, get a working Next.js app — with live preview, GitHub sync, Vercel deploy, Figma import, and Supabase databases.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 App Router, Tailwind CSS, Shadcn UI |
| API | tRPC v11 + React Query |
| Database | Prisma + PostgreSQL (Neon) |
| Auth + Billing | Clerk |
| AI agent | Inngest AgentKit + Gemini 2.0 Flash |
| Sandbox preview | E2B |
| GitHub sync | Octokit |
| Vercel deploy | Vercel REST API |
| Supabase provisioning | Supabase Management API |
| Figma import | Figma REST API |

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.local.example .env.local
# Fill in all values — see Environment Variables section below

# 3. Run database migrations
npx prisma migrate dev

# 4. Start the app (two terminals)
npm run dev                          # Terminal 1
npx inngest-cli@latest dev          # Terminal 2
```

## Environment Variables

All 12 keys are required. See `.env.local` for the full file with instructions.

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | clerk.com → API Keys |
| `CLERK_SECRET_KEY` | clerk.com → API Keys |
| `CLERK_WEBHOOK_SECRET` | clerk.com → Webhooks → Add endpoint (event: `user.updated`) |
| `DATABASE_URL` | neon.tech → New project → Connection string |
| `GOOGLE_GENERATIVE_AI_API_KEY` | aistudio.google.com → Get API key |
| `E2B_API_KEY` | e2b.dev → Dashboard → API Keys |
| `INNGEST_EVENT_KEY` | inngest.com → App → Event Key |
| `INNGEST_SIGNING_KEY` | inngest.com → App → Signing Key |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally, your domain in production |
| `NEXT_PUBLIC_API_URL` | Same as APP_URL |
| `VERCEL_TOKEN` | vercel.com → Account Settings → Tokens (optional) |
| `NEXT_PUBLIC_VERCEL_ENABLED` | Set to `true` when VERCEL_TOKEN is set |
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens (optional) |
| `SUPABASE_ORGANIZATION_ID` | supabase.com → Account → Organizations (optional) |
| `FIGMA_ACCESS_TOKEN` | figma.com → Account Settings → Personal access tokens (optional) |

## E2B sandbox setup (required before first use)

The AI code generation runs inside an E2B sandbox. The template `lune-vibe-3` must be built once:

```bash
npm install -g @e2b/cli
e2b auth login
cd sandbox-templates/nextjs
e2b template build
```

This takes 5–10 minutes. Once done, the template ID is saved in `e2b.toml` and all future sandboxes use it automatically.

## Clerk setup

### GitHub OAuth (for two-way sync)
1. Clerk Dashboard → Social Connections → GitHub → Enable
2. Add scope: `repo`
3. Set callback URL to your Clerk domain's OAuth callback

### Billing (for pro plan)
1. Clerk Dashboard → Billing → Connect Stripe
2. Create a "Pro" plan
3. The `has({ plan: 'pro' })` check in the codebase will work automatically

### Webhooks
Create a webhook at: `https://your-app/api/clerk/webhook`
Subscribe to: `user.updated`

## GitHub webhook (for inbound sync)
When users bind a repo, Isotope registers a webhook on their GitHub repo automatically pointing to `https://your-app/api/github/webhook`. No manual setup needed.

## Features

- **AI code generation** — describe anything, get a working Next.js app
- **Persistent preview** — preview served from DB, never expires
- **Version history** — every generation saved, click any to restore
- **Image uploads** — attach screenshots or mockups to prompts
- **Visual element selection** — click any element in the preview to target it
- **GitHub two-way sync** — auto-push every generation, pull commits back
- **Vercel auto-deploy** — live URL updated after every generation
- **Supabase per-project** — generated apps get a real database
- **Figma import** — paste a Figma URL, get matching code
- **Project management** — rename, delete, public sharing, shareable links
- **Mobile layout** — full chat + preview on mobile
- **Clerk billing** — free tier (5 credits) + pro tier (100 credits)

REAL ENV

DATABASE_URL="postgresql://neondb_owner:npg_klUDAOTNP6x8@ep-nameless-sunset-a4be413g-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require" 