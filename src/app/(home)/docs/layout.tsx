'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  SparklesIcon, CreditCardIcon, GithubIcon, RocketIcon,
  DatabaseIcon, FigmaIcon, UsersIcon, HelpCircleIcon, MenuIcon, XIcon,
  PaintbrushIcon, KanbanIcon, ScrollTextIcon, MailIcon, KeyIcon,
} from 'lucide-react'

const NAV = [
  { label: 'AI Generation',        href: '/docs/ai-generation',       icon: SparklesIcon },
  { label: 'Billing & Credits',    href: '/docs/billing',             icon: CreditCardIcon },
  { label: 'GitHub Sync',          href: '/docs/github-sync',         icon: GithubIcon },
  { label: 'Vercel Deploy',        href: '/docs/vercel-deploy',       icon: RocketIcon },
  { label: 'Supabase Database',    href: '/docs/supabase',            icon: DatabaseIcon },
  { label: 'Integrations',         href: '/docs/integrations',        icon: KeyIcon },
  { label: 'Figma Import',         href: '/docs/figma',               icon: FigmaIcon },
  { label: 'Team Workspaces',      href: '/docs/workspaces',          icon: UsersIcon },
  { label: 'Visual Edit',          href: '/docs/visual-edit',         icon: PaintbrushIcon },
  { label: 'Task Board',           href: '/docs/task-board',          icon: KanbanIcon },
  { label: 'Changelog',            href: '/docs/changelog',           icon: ScrollTextIcon },
  { label: 'Email Notifications',  href: '/docs/email-notifications', icon: MailIcon },
  { label: 'FAQ',                  href: '/docs/faq',                 icon: HelpCircleIcon },
]

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background flex">

      {/* ── Sidebar desktop ── */}
      <aside className="hidden md:flex flex-col w-60 border-r border-border bg-background fixed top-14 bottom-0 overflow-y-auto z-40">
        <div className="p-4 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Documentation</p>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={(e) => {
                e.preventDefault()
                window.location.href = href
              }}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                pathname === href
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              <Icon className="size-4 flex-shrink-0" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-border">
          <p className="text-xs text-muted-foreground">Need help?</p>
          <Link
            href="/feedback"
            onClick={(e) => {
              e.preventDefault()
              window.location.href = '/feedback'
            }}
            className="text-xs text-primary hover:underline"
          >
            Send us feedback →
          </Link>
        </div>
      </aside>

      {/* ── Mobile sidebar ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-background border-r border-border flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Documentation</p>
              <button onClick={() => setMobileOpen(false)}><XIcon className="size-4" /></button>
            </div>
            <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
              {NAV.map(({ label, href, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={(e) => {
                    e.preventDefault()
                    setMobileOpen(false)
                    window.location.href = href
                  }}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                    pathname === href
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  )}
                >
                  <Icon className="size-4 flex-shrink-0" />
                  {label}
                </Link>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* ── Main content ── */}
      <main className="flex-1 md:ml-60 min-h-screen">
        {/* Mobile header */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border sticky top-14 bg-background z-30">
          <button onClick={() => setMobileOpen(true)} className="text-muted-foreground hover:text-foreground">
            <MenuIcon className="size-5" />
          </button>
          <p className="text-sm font-medium">
            {NAV.find(n => n.href === pathname)?.label ?? 'Docs'}
          </p>
        </div>
        <div className="max-w-3xl mx-auto px-6 py-10">
          {children}
        </div>
      </main>
    </div>
  )
}
