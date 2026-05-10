'use client'

import { useState } from 'react'
import { HelpCircleIcon, ChevronDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const FAQS = [
  {
    category: 'Credits & Billing',
    items: [
      { q: 'How many credits do I get on the free plan?', a: '5 credits per day, topping up at midnight UTC. If you already have 5 unused credits, nothing is added — they never stack above 5.' },
      { q: 'Do unused credits roll over?', a: 'No — credits reset to your plan limit on your reset date. Unused ones don\'t carry over.' },
      { q: 'How do I get more credits without upgrading?', a: 'Share your referral link from /usage. Both you and the new user get +5 bonus credits when they sign up.' },
      { q: 'What happens when I run out of credits?', a: 'You can still view projects, browse version history, and use Ask mode. Only Build mode (code generation) requires credits.' },
      { q: 'How does the Team plan billing work?', a: 'The workspace owner\'s credits are used for all generations by team members. Editors generate, owner pays.' },
    ],
  },
  {
    category: 'AI Generation',
    items: [
      { q: 'How long does generation take?', a: 'Usually 30–90 seconds depending on the complexity of what you\'re building.' },
      { q: 'Can I edit the generated code?', a: 'Yes — connect a GitHub repo and push changes. Isotope will pull them back in automatically.' },
      { q: 'Does each follow-up prompt cost a credit?', a: 'Yes — every generation (including follow-ups on the same project) costs 1 credit.' },
      { q: 'Can I attach images to prompts?', a: 'Yes — use the image upload button to attach screenshots, mockups, or designs as visual reference.' },
    ],
  },
  {
    category: 'GitHub & Vercel',
    items: [
      { q: 'Do I need a GitHub account?', a: 'No — GitHub sync is optional. You can use Isotope without connecting GitHub.' },
      { q: 'Does pulling commits from GitHub cost credits?', a: 'No — only AI generations cost credits. Pulling commits is free.' },
      { q: 'Can I deploy to my own Vercel account?', a: 'Yes — add your Vercel token in Settings and all deployments go to your own Vercel account.' },
    ],
  },
  {
    category: 'Supabase & Figma',
    items: [
      { q: 'Is Supabase provisioning free?', a: 'Supabase itself has a free tier, but the auto-provisioning feature in Isotope requires a Pro or Team plan.' },
      { q: 'Can I use Figma import on the free plan?', a: 'Figma import is available to Pro and Team plan users.' },
      { q: 'What file types can I import from Figma?', a: 'Isotope works with Figma frames and components. Paste any Figma share link and it\'ll import the design.' },
    ],
  },
]

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between py-4 text-left gap-4"
      >
        <span className="text-sm font-medium text-foreground">{q}</span>
        <ChevronDownIcon className={cn('size-4 text-muted-foreground flex-shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <p className="text-sm text-muted-foreground pb-4 leading-relaxed">{a}</p>
      )}
    </div>
  )
}

export default function FaqPage() {
  const [search, setSearch] = useState('')
  const filtered = FAQS.map(cat => ({
    ...cat,
    items: cat.items.filter(
      item => item.q.toLowerCase().includes(search.toLowerCase()) || item.a.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(cat => cat.items.length > 0)

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <HelpCircleIcon className="size-5 text-primary" />
          <h1 className="text-2xl font-bold">Frequently Asked Questions</h1>
        </div>
        <p className="text-muted-foreground">Everything you wanted to know about Isotope.</p>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search questions..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
      />

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No results for "{search}"</p>
      )}

      {filtered.map(cat => (
        <div key={cat.category} className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{cat.category}</p>
          <div className="rounded-xl border border-border bg-card px-5">
            {cat.items.map(item => <FaqItem key={item.q} {...item} />)}
          </div>
        </div>
      ))}
    </div>
  )
}
