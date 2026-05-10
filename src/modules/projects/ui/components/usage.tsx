'use client'

import Link from 'next/link'
import { formatDuration, intervalToDuration } from 'date-fns'
import { CrownIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@clerk/nextjs'
import { useMemo } from 'react'

interface Props {
  points:       number
  msBeforeNext: number
  plan?:        string  // 'free' | 'pro' | 'team'
}

export const Usage = ({ msBeforeNext, points, plan = 'free' }: Props) => {
  const { has } = useAuth()
  const hasProAccess = has?.({ plan: 'pro' })

  const resetLabel = useMemo(() => {
    if (msBeforeNext <= 0) return 'soon'
    try {
      const duration = formatDuration(
        intervalToDuration({
          start: new Date(),
          end:   new Date(Date.now() + msBeforeNext),
        }),
        { format: ['months', 'days', 'hours'] },
      )
      return duration || 'soon'
    } catch {
      return 'soon'
    }
  }, [msBeforeNext])

  // Free: daily top-up. Pro/Team: monthly reset.
  const resetCopy = plan === 'free'
    ? `Tops up in ${resetLabel}`
    : `Resets in ${resetLabel}`

  return (
    <div className="rounded-t-xl bg-background border border-b-0 px-3 py-2">
      <div className="flex items-center gap-x-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm">
            <span className="font-medium">{points}</span>
            {' '}{hasProAccess ? 'pro' : 'free'}{' '}
            {points === 1 ? 'credit' : 'credits'} remaining
          </p>
          <p className="text-xs text-muted-foreground">
            {resetCopy}
          </p>
        </div>
        {!hasProAccess && (
          <Button asChild size="sm" variant="outline" className="ml-auto flex-shrink-0">
            <Link href="/pricing">
              <CrownIcon className="size-3.5" /> Upgrade
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}
