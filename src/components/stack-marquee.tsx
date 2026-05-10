'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'

const STACK_ROW_1 = [
  { name: 'Next.js',     logo: 'https://cdn.simpleicons.org/nextdotjs' },
  { name: 'React',       logo: 'https://cdn.simpleicons.org/react/61DAFB' },
  { name: 'TypeScript',  logo: 'https://cdn.simpleicons.org/typescript/3178C6' },
  { name: 'Tailwind',    logo: 'https://cdn.simpleicons.org/tailwindcss/06B6D4' },
  { name: 'Supabase',    logo: 'https://cdn.simpleicons.org/supabase/3ECF8E' },
  { name: 'Prisma',      logo: 'https://cdn.simpleicons.org/prisma' },
  { name: 'Stripe',      logo: 'https://cdn.simpleicons.org/stripe/635BFF' },
  { name: 'Clerk',       logo: 'https://cdn.simpleicons.org/clerk' },
]

const STACK_ROW_2 = [
  { name: 'Vercel',      logo: 'https://cdn.simpleicons.org/vercel' },
  { name: 'GitHub',      logo: 'https://cdn.simpleicons.org/github' },
  { name: 'OpenAI',      logo: 'https://cdn.simpleicons.org/openai' },
  { name: 'Resend',      logo: 'https://cdn.simpleicons.org/resend' },
  { name: 'Inngest',     logo: 'https://cdn.simpleicons.org/inngest' },
  { name: 'Sentry',      logo: 'https://cdn.simpleicons.org/sentry/362D59' },
  { name: 'shadcn/ui',   logo: 'https://cdn.simpleicons.org/shadcnui' },
  { name: 'Figma',       logo: 'https://cdn.simpleicons.org/figma' },
]

interface MarqueeRowProps {
  items: { name: string; logo: string }[]
  reverse?: boolean
  className?: string
}

function MarqueeRow({ items, reverse, className }: MarqueeRowProps) {
  // Duplicate for seamless loop
  const doubled = [...items, ...items]

  return (
    <div className={cn('flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,white_10%,white_90%,transparent)]', className)}>
      <div
        className={cn(
          'flex gap-4 shrink-0',
          reverse ? 'animate-marquee-reverse' : 'animate-marquee',
        )}
        style={{ willChange: 'transform' }}
      >
        {doubled.map((item, i) => (
          <div
            key={`${item.name}-${i}`}
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-border bg-card/80 backdrop-blur-sm shrink-0 hover:border-primary/30 transition-colors"
          >
            <div className="size-5 relative flex-shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.logo}
                alt={item.name}
                className="w-5 h-5 object-contain dark:invert-[var(--logo-invert)]"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </div>
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function StackMarquee() {
  return (
    <section className="py-14 space-y-4 overflow-hidden">
      <div className="text-center space-y-1.5 mb-6">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Powered by the best stack</p>
        <p className="text-sm text-muted-foreground">Your generated apps use industry-standard tools — production-ready from day one</p>
      </div>
      <MarqueeRow items={STACK_ROW_1} />
      <MarqueeRow items={STACK_ROW_2} reverse />
    </section>
  )
}
