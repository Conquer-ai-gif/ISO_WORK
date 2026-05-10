'use client'

import { CreditCardIcon, ZapIcon, SearchIcon, WrenchIcon } from 'lucide-react'
import { DocsCallout } from '@/components/docs/docs-callout'
import { CreditCalculator } from '@/components/docs/credit-calculator'

const OPERATION_COSTS = [
  { icon: ZapIcon,    label: 'Base cost',         cost: '0.2',  description: 'Charged on every generation, always' },
  { icon: ZapIcon,    label: 'Per task executed',  cost: '0.2',  description: 'Each item in your task graph' },
  { icon: SearchIcon, label: 'Per doc search',     cost: '0.3',  description: 'Library documentation fetch via Tavily' },
  { icon: WrenchIcon, label: 'Per fix loop',       cost: '0.2',  description: 'Auto-fix TypeScript errors after generation' },
]

export default function BillingPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <CreditCardIcon className="size-5 text-primary" />
          <h1 className="text-2xl font-bold">Billing & Credits</h1>
        </div>
        <p className="text-muted-foreground">How credits work, when they reset, and how to get more.</p>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Plans</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { name: 'Free',  credits: 5,   reset: 'Daily top-up — never exceeds 5',  price: '$0',     maxTasks: 3,  fixLoops: 1 },
            { name: 'Pro',   credits: 100, reset: 'Monthly from billing date',        price: '$25/mo', maxTasks: 10, fixLoops: 3 },
            { name: 'Team',  credits: 300, reset: 'Monthly, shared across team',      price: '$39/mo', maxTasks: 30, fixLoops: 10 },
          ].map((p) => (
            <div key={p.name} className="rounded-xl border border-border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{p.name}</p>
                <p className="text-sm font-bold text-primary">{p.price}</p>
              </div>
              <p className="text-2xl font-bold">{p.credits} <span className="text-sm font-normal text-muted-foreground">credits</span></p>
              <p className="text-xs text-muted-foreground">{p.reset}</p>
              <div className="pt-1 border-t border-border space-y-1">
                <p className="text-xs text-muted-foreground">Up to <strong className="text-foreground">{p.maxTasks} tasks</strong> per generation</p>
                <p className="text-xs text-muted-foreground">Up to <strong className="text-foreground">{p.fixLoops} fix loop{p.fixLoops > 1 ? 's' : ''}</strong> per task</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <DocsCallout type="info">
        Free plan credits top up <strong>every day at midnight UTC</strong>. If your balance is below 5, it gets topped up to 5. If you already have 5 unused credits, nothing changes — they never stack above 5.
      </DocsCallout>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">How credits are charged</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Credits are charged based on <strong>actual work done</strong> — not a flat rate per prompt.
          A simple one-task generation costs less than a complex multi-task build with search and fix loops.
        </p>
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {OPERATION_COSTS.map((op) => (
            <div key={op.label} className="flex items-center gap-3 px-4 py-3">
              <op.icon className="size-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{op.label}</p>
                <p className="text-xs text-muted-foreground">{op.description}</p>
              </div>
              <p className="text-sm font-bold text-primary shrink-0">{op.cost} cr</p>
            </div>
          ))}
        </div>
        <DocsCallout type="tip">
          Example: a generation with 3 tasks + 1 doc search + 1 fix loop costs{' '}
          <strong>0.2 + (3 × 0.2) + (1 × 0.3) + (1 × 0.2) = 1.3 credits</strong>.
          Credits are only deducted <em>after</em> the generation completes successfully.
        </DocsCallout>
      </div>

      <CreditCalculator />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Buy extra credits</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Need more credits without upgrading your plan? Buy a one-time top-up from the <strong>/usage</strong> page. Credits are added to your balance instantly and <strong>never expire</strong> — they stack on top of your monthly allowance.
        </p>
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {[
            { credits: 25,  price: '$9.99',  perCredit: '$0.40/credit' },
            { credits: 50,  price: '$17.99', perCredit: '$0.36/credit', badge: 'Most Popular' },
            { credits: 100, price: '$29.99', perCredit: '$0.30/credit', badge: 'Best Value' },
          ].map((pkg) => (
            <div key={pkg.credits} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{pkg.credits} credits</p>
                {pkg.badge && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    {pkg.badge}
                  </span>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-primary">{pkg.price}</p>
                <p className="text-xs text-muted-foreground">{pkg.perCredit}</p>
              </div>
            </div>
          ))}
        </div>
        <DocsCallout type="tip">
          Monthly plans are always better value for regular builders — Pro gives 100 credits/month for $25 ($0.25/credit). Top-ups are best for occasional overflow when you need a little extra mid-project.
        </DocsCallout>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Referral bonus</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Share your referral link from the <strong>/usage</strong> page. When someone signs up using your link, you both get <strong>+5 bonus credits</strong> added on top of your regular balance. Referral credits don't reset — they stack.
        </p>
        <DocsCallout type="tip">
          Referral credits are additive and don't affect your daily top-up cycle. They stay in your balance until you use them.
        </DocsCallout>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">What happens at zero credits</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          When your credits run out you can still view all your projects, browse version history, and use <strong>Ask mode</strong> to chat without generating. Only <strong>Build mode</strong> (which creates or edits code) requires credits.
        </p>
        <DocsCallout type="warning">
          Free credits never stack above 5. The daily top-up only fills you back up to 5 — it won't add to existing credits. Pro and Team plans reset monthly.
        </DocsCallout>
      </div>
    </div>
  )
}
