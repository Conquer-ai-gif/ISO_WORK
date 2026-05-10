'use client'

import { useState } from 'react'
import { DocsCallout } from '@/components/docs/docs-callout'
import { DocsSteps } from '@/components/docs/docs-steps'
import { SparklesIcon, ArrowUpIcon, GitBranchIcon } from 'lucide-react'

const EXAMPLES = [
  { label: '🛒 E-commerce', prompt: 'Build an e-commerce store with product listings, cart, and checkout using Stripe' },
  { label: '📊 Dashboard',  prompt: 'Create an analytics dashboard with charts, KPI cards, and a data table' },
  { label: '💬 Chat app',   prompt: 'Build a real-time chat app with rooms, user avatars, and message history' },
  { label: '🔐 Auth app',   prompt: 'Create an app with sign up, sign in, password reset, and a protected dashboard' },
]

const SUPPORTED_FRAMEWORKS = [
  { from: 'React (Vite/CRA)', to: 'Next.js App Router' },
  { from: 'Vue 3',            to: 'React + Next.js' },
  { from: 'Svelte / SvelteKit', to: 'React + Next.js' },
  { from: 'Next.js (Pages Router)', to: 'Next.js App Router' },
]

export default function AiGenerationPage() {
  const [prompt, setPrompt] = useState('')

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <SparklesIcon className="size-5 text-primary" />
          <h1 className="text-2xl font-bold">How AI Generation Works</h1>
        </div>
        <p className="text-muted-foreground">Understand how Isotope turns your descriptions into working Next.js apps.</p>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">How it works</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          When you describe what you want to build, Isotope generates a task graph — a structured plan of what needs to be built. You review and approve the plan, then the AI executes each task in parallel, writing a complete Next.js application including pages, components, API routes, and styling. The generated app is instantly compiled and served in a live preview.
        </p>
        <DocsCallout type="info">
          Credits are charged based on <strong>actual work done</strong> — not a flat rate. A simple one-task generation costs as little as <strong>0.4 credits</strong>. See the <a href="/docs/billing" className="underline underline-offset-2">Billing page</a> for the full cost breakdown.
        </DocsCallout>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Try an example prompt</h2>
        <p className="text-sm text-muted-foreground">Click any example below to load it into the prompt box, then see how a good prompt is structured.</p>

        <div className="flex flex-wrap gap-2 mb-3">
          {EXAMPLES.map((e) => (
            <button
              key={e.label}
              onClick={() => setPrompt(e.prompt)}
              className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-colors"
            >
              {e.label}
            </button>
          ))}
        </div>

        <div className="relative rounded-xl border border-border bg-card p-4">
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={3}
            placeholder="Describe what you want to build..."
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-muted-foreground">This is a demo — go to the home page to actually generate</span>
            <div className="size-7 rounded-full bg-primary flex items-center justify-center">
              <ArrowUpIcon className="size-3.5 text-white" />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Plan-First mode</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Before writing any code, Isotope generates a structured plan showing exactly what tasks will run, which files will be created or modified, and what libraries will be used. You review the plan and either approve it to start generation or reject it to refine your prompt — no credit is consumed until you approve.
        </p>
        <DocsCallout type="tip">
          If you reject a plan your credit is not charged. You only pay for generations you actually approve and run.
        </DocsCallout>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Tips for better results</h2>
        <DocsSteps steps={[
          { title: 'Be specific about features', description: 'Instead of "make a website", try "build a portfolio site with a hero section, about page, project grid, and contact form".' },
          { title: 'Mention the tech you need', description: 'If you need Stripe payments, a database, or auth — say so explicitly. Isotope will wire it up.' },
          { title: 'Describe the design', description: 'Mention colors, layout style, or reference a design system. E.g. "use a dark theme with purple accents".' },
          { title: 'Iterate with follow-up prompts', description: 'You don\'t have to get it perfect in one go. Build the base, then refine with follow-up messages in the same project.' },
        ]} />
      </div>

      {/* ── Import Repo ─────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <GitBranchIcon className="size-4 text-primary" />
          <h2 className="text-lg font-semibold">Import from GitHub</h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Already have a codebase? Connect your GitHub repository and Isotope will analyse it, detect the framework, and let you continue building with AI. Supported frameworks are automatically converted to Next.js App Router.
        </p>

        <DocsSteps steps={[
          { title: 'Connect GitHub', description: 'Go to Settings → GitHub and authorise Isotope to access your repositories.' },
          { title: 'Import a repository', description: 'From the dashboard click "Import Repo", select your repository, and Isotope will analyse the codebase — detecting the framework, key files, and dependencies.' },
          { title: 'Review the analysis', description: 'Isotope shows you a summary of what it found and what will be converted. Confirm to proceed.' },
          { title: 'Start building', description: 'Send your first prompt in the imported project. The AI uses your existing codebase as context so it never starts from scratch.' },
        ]} />

        <div className="space-y-2">
          <p className="text-sm font-medium">Supported framework conversions</p>
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {SUPPORTED_FRAMEWORKS.map((f) => (
              <div key={f.from} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-muted-foreground">{f.from}</span>
                <span className="text-xs text-muted-foreground mx-2">→</span>
                <span className="font-medium text-primary">{f.to}</span>
              </div>
            ))}
          </div>
        </div>

        <DocsCallout type="warning">
          Framework conversion is AI-driven — it uses your existing files as context but rewrites them for Next.js. Complex apps with heavy framework-specific patterns (Vuex, Pinia, Svelte stores) may need manual follow-up prompts to clean up. Always review the first generation carefully.
        </DocsCallout>

        <DocsCallout type="tip">
          After importing, use your first prompt to describe what you want to <strong>change or add</strong> — not to re-describe what already exists. The AI already knows your codebase.
        </DocsCallout>
      </div>

      <DocsCallout type="tip">
        You can attach screenshots or mockups to your prompt using the image upload button. Isotope will use the image as visual reference when generating.
      </DocsCallout>
    </div>
  )
}
