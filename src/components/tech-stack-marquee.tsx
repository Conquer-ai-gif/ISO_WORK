'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'

const STACK_ROW_1 = [
  { name: 'Next.js',     logo: '/logos/nextjs.svg' },
  { name: 'Supabase',    logo: '/logos/supabase.svg' },
  { name: 'Stripe',      logo: '/logos/stripe.svg' },
  { name: 'OpenRouter',  logo: '/logos/openrouter.svg' },
  { name: 'Clerk',       logo: '/logos/clerk.svg' },
  { name: 'E2B',         logo: '/logos/e2b.svg' },
  { name: 'Inngest',     logo: '/logos/inngest.svg' },
  { name: 'GitHub',      logo: '/logos/github.svg' },
]

const STACK_ROW_2 = [
  { name: 'Vercel',      logo: '/logos/vercel.svg' },
  { name: 'Tailwind',    logo: '/logos/tailwind.svg' },
  { name: 'Prisma',      logo: '/logos/prisma.svg' },
  { name: 'Resend',      logo: '/logos/resend.svg' },
  { name: 'shadcn/ui',   logo: '/logos/shadcn.svg' },
  { name: 'TypeScript',  logo: '/logos/typescript.svg' },
  { name: 'Sentry',      logo: '/logos/sentry.svg' },
  { name: 'Postgres',    logo: '/logos/postgres.svg' },
]

interface MarqueeRowProps {
  items: typeof STACK_ROW_1
  direction: 'left' | 'right'
}

function MarqueeRow({ items, direction }: MarqueeRowProps) {
  // Duplicate items for seamless loop
  const doubled = [...items, ...items]

  return (
    <div className="relative overflow-hidden w-full">
      {/* Fade masks on left and right */}
      <div className="absolute left-0 top-0 bottom-0 w-20 z-10 bg-gradient-to-r from-background to-transparent pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-20 z-10 bg-gradient-to-l from-background to-transparent pointer-events-none" />

      <div
        className={cn(
          'flex gap-4 w-max',
          direction === 'left' ? 'animate-marquee-left' : 'animate-marquee-right',
        )}
      >
        {doubled.map((item, i) => (
          <div
            key={`${item.name}-${i}`}
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors flex-shrink-0 group"
          >
            {/* Logo placeholder — uses text fallback if svg not found */}
            <div className="size-5 flex items-center justify-center flex-shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
              <img
                src={item.logo}
                alt={item.name}
                width={20}
                height={20}
                className="object-contain"
                onError={(e) => {
                  // Fallback to first letter if logo not found
                  const target = e.target as HTMLImageElement
                  target.style.display = 'none'
                  const parent = target.parentElement
                  if (parent && !parent.querySelector('span')) {
                    const span = document.createElement('span')
                    span.textContent = item.name[0]
                    span.className = 'text-xs font-bold text-muted-foreground'
                    parent.appendChild(span)
                  }
                }}
              />
            </div>
            <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors whitespace-nowrap">
              {item.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TechStackMarquee() {
  return (
    <section className="py-12 space-y-6 w-full overflow-hidden">
      <div className="text-center space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
          Powered by the best stack in the industry
        </p>
      </div>
      <div className="space-y-3">
        <MarqueeRow items={STACK_ROW_1} direction="left" />
        <MarqueeRow items={STACK_ROW_2} direction="right" />
      </div>
    </section>
  )
}
