'use client'

import Link from 'next/link'
import {
  SparklesIcon, CreditCardIcon, GithubIcon, RocketIcon,
  DatabaseIcon, FigmaIcon, UsersIcon, HelpCircleIcon,
  PaintbrushIcon, KanbanIcon, ScrollTextIcon, MailIcon,
} from 'lucide-react'

const SECTIONS = [
  { label: 'AI Generation',       href: '/docs/ai-generation',       icon: SparklesIcon,    desc: 'How prompts work, tips for better results, credit costs' },
  { label: 'Billing & Credits',   href: '/docs/billing',             icon: CreditCardIcon,  desc: 'Plans, monthly resets, referrals, and what happens at zero' },
  { label: 'GitHub Sync',         href: '/docs/github-sync',         icon: GithubIcon,      desc: 'Two-way sync, auto-push, pulling commits back into Isotope' },
  { label: 'Vercel Deploy',       href: '/docs/vercel-deploy',       icon: RocketIcon,      desc: 'Auto-deploy on every generation, custom domains, live URLs' },
  { label: 'Supabase Database',   href: '/docs/supabase',            icon: DatabaseIcon,    desc: 'Auto-provisioned DB per project, credentials, Pro-only' },
  { label: 'Figma Import',        href: '/docs/figma',               icon: FigmaIcon,       desc: 'Import designs, generate matching code, access token setup' },
  { label: 'Team Workspaces',     href: '/docs/workspaces',          icon: UsersIcon,       desc: 'Create workspaces, invite members, roles and permissions' },
  { label: 'Visual Edit',         href: '/docs/visual-edit',         icon: PaintbrushIcon,  desc: 'Targeted style changes — colors, text, spacing, and layout without rewriting prompts' },
  { label: 'Task Board',          href: '/docs/task-board',          icon: KanbanIcon,      desc: 'Built-in Kanban board per project — track features, bugs, and work in progress' },
  { label: 'Changelog',           href: '/docs/changelog',           icon: ScrollTextIcon,  desc: 'Publish product updates and notify subscribers automatically via email' },
  { label: 'Email Notifications', href: '/docs/email-notifications', icon: MailIcon,        desc: 'Resend setup, feedback alerts, changelog emails, and unsubscribe flow' },
  { label: 'FAQ',                 href: '/docs/faq',                 icon: HelpCircleIcon,  desc: 'Most common questions answered in one place' },
]

export const DocsClient = () => {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Isotope Documentation</h1>
        <p className="text-muted-foreground text-lg">
          Everything you need to build, deploy, and scale with Isotope.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SECTIONS.map(({ label, href, icon: Icon, desc }) => (
          <Link
            key={href}
            href={href}
            onClick={(e) => {
              e.preventDefault()
              window.location.href = href
            }}
            className="group rounded-xl border border-border bg-card p-5 hover:border-primary/50 hover:bg-primary/5 transition-colors"
          >
            <div className="flex items-start gap-4">
              <div className="size-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                <Icon className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">{label}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
        <p className="text-sm font-semibold text-primary mb-1">Need more help?</p>
        <p className="text-sm text-muted-foreground">
          Can't find what you're looking for?{' '}
          <Link
            href="/feedback"
            onClick={(e) => {
              e.preventDefault()
              window.location.href = '/feedback'
            }}
            className="text-primary hover:underline"
          >
            Send us feedback
          </Link>
          {' '}and we'll get back to you.
        </p>
      </div>
    </div>
  )
}