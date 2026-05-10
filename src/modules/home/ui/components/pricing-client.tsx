'use client'

import Image from 'next/image'
import { useClerk, useUser, SignInButton } from '@clerk/nextjs'
import { CheckIcon, ZapIcon, UsersIcon, SparklesIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── Plan definitions ──────────────────────────────────────────────────────────
// ACTION REQUIRED: Replace the clerkPlanId values with your real Clerk plan IDs.
// See INSTRUCTIONS.md → Pricing Page Activation for step-by-step instructions.

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: '',
    credits: '5 credits',
    creditDetail: 'per day — tops up at midnight UTC',
    highlight: false,
    badge: null,
    icon: SparklesIcon,
    clerkPlanId: null, // Free plan — no checkout needed
    cta: 'Get started free',
    features: [
      'AI code generation',
      'Live preview',
      'GitHub sync',
      'Public sharing',
      'Version history',
      '"Built with Isotope" badge',
    ],
  },
  {
    name: 'Pro',
    price: '$25',
    period: '/month',
    credits: '100 credits',
    creditDetail: 'per month, reset on billing date',
    highlight: true,
    badge: 'Most popular',
    icon: ZapIcon,
    clerkPlanId: process.env.NEXT_PUBLIC_CLERK_PRO_PLAN_ID ?? null,
    cta: 'Upgrade to Pro',
    features: [
      'Everything in Free',
      'Hide "Built with Isotope" badge',
      'Custom domain on deployments',
      'Supabase database per project',
      'Figma import',
      'Model choice (coming soon)',
    ],
  },
  {
    name: 'Team',
    price: '$39',
    period: '/month',
    credits: '300 credits',
    creditDetail: 'per month, shared across team',
    highlight: false,
    badge: null,
    icon: UsersIcon,
    clerkPlanId: process.env.NEXT_PUBLIC_CLERK_TEAM_PLAN_ID ?? null,
    cta: 'Start team plan',
    features: [
      'Everything in Pro',
      'Up to 5 workspace members',
      'Owner pays for all generations',
      'Shared project workspace',
      'Role-based access (Owner/Editor/Viewer)',
      'Priority support',
    ],
  },
]

// ── Plan card ─────────────────────────────────────────────────────────────────

interface PlanCardProps {
  plan: typeof PLANS[number]
  onUpgrade: (planId: string) => void
  isSignedIn: boolean
}

function PlanCard({ plan, onUpgrade, isSignedIn }: PlanCardProps) {
  const PlanIcon = plan.icon

  const handleClick = () => {
    if (!plan.clerkPlanId) return
    onUpgrade(plan.clerkPlanId)
  }

  const ctaButton = plan.clerkPlanId === null ? (
    // Free plan — sign up or already on free
    isSignedIn ? (
      <Button variant="outline" className="w-full" disabled>
        Current plan
      </Button>
    ) : (
      <SignInButton mode="modal">
        <Button variant="outline" className="w-full">
          {plan.cta}
        </Button>
      </SignInButton>
    )
  ) : (
    <Button
      className={cn('w-full', plan.highlight && 'bg-primary text-primary-foreground hover:bg-primary/90')}
      variant={plan.highlight ? 'default' : 'outline'}
      onClick={handleClick}
      disabled={!plan.clerkPlanId}
    >
      {plan.cta}
    </Button>
  )

  return (
    <div
      className={cn(
        'relative rounded-2xl border bg-card p-6 flex flex-col gap-5 transition-shadow',
        plan.highlight
          ? 'border-primary shadow-lg shadow-primary/10 ring-1 ring-primary/20'
          : 'border-border hover:border-border/80',
      )}
    >
      {/* Most popular badge */}
      {plan.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="text-xs font-medium bg-primary text-primary-foreground px-3 py-1 rounded-full whitespace-nowrap">
            {plan.badge}
          </span>
        </div>
      )}

      {/* Plan name + icon */}
      <div className="flex items-center gap-2.5">
        <div className={cn(
          'size-8 rounded-lg flex items-center justify-center',
          plan.highlight ? 'bg-primary/10' : 'bg-muted',
        )}>
          <PlanIcon className={cn('size-4', plan.highlight ? 'text-primary' : 'text-muted-foreground')} />
        </div>
        <p className="font-semibold text-sm">{plan.name}</p>
      </div>

      {/* Price */}
      <div>
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold tracking-tight">{plan.price}</span>
          {plan.period && (
            <span className="text-muted-foreground text-sm">{plan.period}</span>
          )}
        </div>
      </div>

      {/* Credits badge */}
      <div className={cn(
        'rounded-lg px-3 py-2 border',
        plan.highlight
          ? 'bg-primary/5 border-primary/20'
          : 'bg-muted/50 border-border',
      )}>
        <p className={cn('text-sm font-semibold', plan.highlight ? 'text-primary' : 'text-foreground')}>
          {plan.credits}
        </p>
        <p className="text-xs text-muted-foreground">{plan.creditDetail}</p>
      </div>

      {/* CTA */}
      {ctaButton}

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Features */}
      <ul className="space-y-2.5 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm">
            <CheckIcon className={cn(
              'size-4 flex-shrink-0 mt-0.5',
              plan.highlight ? 'text-primary' : 'text-muted-foreground',
            )} />
            <span className="text-muted-foreground">{f}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export const PricingClient = () => {
  const { openCheckout } = useClerk()
  const { isSignedIn } = useUser()

  const handleUpgrade = (planId: string) => {
    openCheckout({ planId })
  }

  return (
    <div className="flex flex-col max-w-5xl mx-auto w-full px-4">
      <section className="space-y-14 pt-[10vh] pb-20">

        {/* Header */}
        <div className="flex flex-col items-center gap-4 text-center">
          <Image
            src="/logo.svg"
            alt="Isotope"
            width={48}
            height={48}
            className="hidden md:block"
          />
          <div className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-bold">Simple pricing</h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              Start free. Upgrade when you need more. Cancel any time.
            </p>
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.name}
              plan={plan}
              onUpgrade={handleUpgrade}
              isSignedIn={!!isSignedIn}
            />
          ))}
        </div>

        {/* Credit explainer */}
        <div className="rounded-xl border bg-muted/30 p-6 max-w-2xl mx-auto text-center space-y-2">
          <p className="font-medium text-sm">How credits are charged</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Credits are charged based on <strong>actual work done</strong> — not a flat rate per prompt.
            A simple one-task generation costs as little as <strong>0.4 credits</strong>. A complex build
            with multiple tasks, doc searches, and fix loops costs more — but never more than the work done.
            Browsing, Ask mode, GitHub sync, and version history are always free.
          </p>
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto space-y-4 w-full">
          <h2 className="text-lg font-semibold text-center">Common questions</h2>
          <div className="space-y-3">
            {[
              {
                q: 'What happens when I run out of credits?',
                a: 'You can still view your projects, chat in Ask mode, and browse your history. Only code generation (Build mode) requires credits.',
              },
              {
                q: 'Do unused credits roll over?',
                a: 'No — free credits top up daily at midnight UTC back to 5. They never stack above 5.',
              },
              {
                q: 'How does the Team plan work?',
                a: "The workspace owner pays for the plan. Team members (Editors) can generate code and it charges from the owner's 300 monthly credits. Viewers can browse projects for free.",
              },
              {
                q: 'Can I get extra credits without upgrading?',
                a: 'Yes — share your referral link and you both get 5 bonus credits when someone signs up.',
              },
              {
                q: 'Can I cancel any time?',
                a: 'Yes. Cancel from your account settings and you keep access until the end of the billing period.',
              },
            ].map((item) => (
              <div key={item.q} className="rounded-xl border bg-card p-4 space-y-1.5">
                <p className="font-medium text-sm">{item.q}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>

      </section>
    </div>
  )
}
