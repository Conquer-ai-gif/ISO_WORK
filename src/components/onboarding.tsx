'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import { useQuery } from '@tanstack/react-query'
import { useTRPC } from '@/trpc/client'
import { SparklesIcon, GithubIcon, RocketIcon, CheckIcon, ArrowRightIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Link from 'next/link'

const STEPS = [
  {
    icon: SparklesIcon,
    title: 'Describe what you want to build',
    description: 'Type anything — a SaaS dashboard, e-commerce store, landing page, chat app. Isotope turns your words into a working Next.js app in seconds.',
    action: 'Got it',
  },
  {
    icon: CheckIcon,
    title: 'Approve the plan first',
    description: 'Before any code is written, Isotope shows you a structured plan — exactly which files will be created, the approach, and estimated time. You approve, then it builds.',
    action: 'Nice',
  },
  {
    icon: RocketIcon,
    title: 'Deploy instantly',
    description: 'Every generation gets a live preview. Connect GitHub for auto-push and Vercel for a real URL after every build. Your app is live in minutes.',
    action: 'Let\'s go',
  },
  {
    icon: GithubIcon,
    title: 'You have 5 free credits',
    description: 'Each generation costs 1 credit. Your credits top up to 5 every day at midnight UTC. Refer a friend to get +5 bonus credits instantly.',
    action: 'Start building',
  },
]

const ONBOARDING_KEY = 'isotope_onboarding_complete'

export function Onboarding() {
  const { user, isLoaded } = useUser()
  const trpc = useTRPC()
  const { data: projects } = useQuery({
    ...trpc.projects.getMany.queryOptions(),
    enabled: isLoaded && !!user,
  })
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!isLoaded || !user) return
    // Only show for new users with no projects and haven't seen onboarding
    const done = localStorage.getItem(ONBOARDING_KEY)
    if (!done && projects !== undefined && projects.length === 0) {
      setVisible(true)
    }
  }, [isLoaded, user, projects])

  const dismiss = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true')
    setVisible(false)
  }

  const next = () => {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1)
    } else {
      dismiss()
    }
  }

  if (!visible) return null

  const current = STEPS[step]
  const Icon = current.icon
  const isLast = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">

        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <div
            className="h-1 bg-primary transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Icon className="size-5 text-primary" />
            </div>
            <button
              onClick={dismiss}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <XIcon className="size-4" />
            </button>
          </div>

          {/* Content */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {step + 1} of {STEPS.length}
            </p>
            <h2 className="text-xl font-bold text-foreground">{current.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{current.description}</p>
          </div>

          {/* Step dots */}
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  i === step ? 'bg-primary w-6' : i < step ? 'bg-primary/40 w-1.5' : 'bg-muted w-1.5',
                )}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button onClick={next} className="flex-1 gap-2">
              {current.action}
              {!isLast && <ArrowRightIcon className="size-3.5" />}
            </Button>
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep(s => s - 1)}>
                Back
              </Button>
            )}
          </div>

          {isLast && (
            <p className="text-xs text-center text-muted-foreground">
              Need help anytime? Check out{' '}
              <Link href="/docs" className="text-primary hover:underline" onClick={dismiss}>
                the docs
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
