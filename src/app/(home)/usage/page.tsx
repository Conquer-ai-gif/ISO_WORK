'use client'

import { Suspense } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useTRPC } from '@/trpc/client'
import { format, formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  SparklesIcon, FolderIcon, CalendarIcon,
  TrendingUpIcon, ExternalLinkIcon, CrownIcon,
} from 'lucide-react'
import { useAuth } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import { ReferralCard } from '@/components/referral-card'
import { CreditMarketplace } from '@/components/credit-marketplace'

function StatCard({
  label, value, sub, icon: Icon,
}: {
  label: string
  value: number | string
  sub?: string
  icon: React.ElementType
}) {
  return (
    <div className="rounded-xl border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-3xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  )
}

function UsageContent() {
  const trpc = useTRPC()
  const { has } = useAuth()
  const hasProAccess = has?.({ plan: 'pro' })

  const { data: status }    = useSuspenseQuery(trpc.usage.status.queryOptions())
  const { data: analytics } = useSuspenseQuery(trpc.usage.analytics.queryOptions())

  const chartData = analytics.activityData.map((d) => ({
    ...d,
    date: format(new Date(d.date), 'MMM d'),
  }))

  const resetDate = status.nextReset

  return (
    <div className="space-y-6">
      {/* Credit status banner */}
      <div className={`rounded-xl border p-5 flex items-center justify-between gap-4 ${
        hasProAccess
          ? 'border-primary/30 bg-primary/5'
          : 'border-amber-300/30 bg-amber-50/50 dark:bg-amber-950/20'
      }`}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            {hasProAccess
              ? <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-medium">Pro</span>
              : <span className="text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">Free</span>
            }
            <span className="font-semibold">{status.remainingPoints} credits remaining</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Resets {formatDistanceToNow(resetDate, { addSuffix: true })} · {format(resetDate, 'MMM d, yyyy')}
          </p>
        </div>
        {!hasProAccess && (
          <Button asChild size="sm">
            <Link href="/pricing">
              <CrownIcon className="size-3.5" /> Upgrade to Pro
            </Link>
          </Button>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total projects"
          value={analytics.totalProjects}
          sub="All time"
          icon={FolderIcon}
        />
        <StatCard
          label="Projects (30d)"
          value={analytics.projects30Days}
          sub="Last 30 days"
          icon={CalendarIcon}
        />
        <StatCard
          label="Total generations"
          value={analytics.totalGenerations}
          sub="All time"
          icon={SparklesIcon}
        />
        <StatCard
          label="Generations (7d)"
          value={analytics.generations7Days}
          sub={analytics.mostActiveDay.count > 0
            ? `Best day: ${analytics.mostActiveDay.count}`
            : 'Last 7 days'
          }
          icon={TrendingUpIcon}
        />
      </div>

      {/* Activity chart */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-medium text-sm">Generation activity — last 30 days</h2>
        </div>
        <div className="p-5">
          {analytics.activityData.every((d) => d.count === 0) ? (
            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
              No generations yet — start building to see your activity here
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(var(--border) / 0.5)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'oklch(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  interval={4}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'oklch(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'oklch(var(--popover))',
                    border: '1px solid okLch(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(v: number) => [v, 'Generations']}
                />
                <Bar dataKey="count" fill="oklch(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Referral program */}
      <Suspense fallback={null}>
        <ReferralCard appUrl={typeof window !== 'undefined' ? window.location.origin : ''} />

        {/* Credit marketplace */}
        <div className="rounded-xl border border-border bg-card p-6">
          <CreditMarketplace />
        </div>
      </Suspense>

      {/* Top projects */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-medium text-sm">Most active projects</h2>
        </div>
        {analytics.topProjects.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            No projects yet —{' '}
            <Link href="/" className="text-primary hover:underline">start building</Link>
          </div>
        ) : (
          <div className="divide-y">
            {analytics.topProjects.map((p: { id: string; name: string; createdAt: Date; updatedAt: Date; isPublic: boolean; vercelDeployUrl: string | null; _count: { messages: number } }, i: number) => (
              <div key={p.id} className="px-5 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                <span className="text-xs text-muted-foreground w-5 tabular-nums flex-shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/projects/${p.id}`}
                    className="text-sm font-medium hover:text-primary transition-colors truncate block"
                  >
                    {p.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    Created {formatDistanceToNow(p.createdAt, { addSuffix: true })}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-muted-foreground">{p._count.messages} messages</span>
                  {p.isPublic && (
                    <span className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full">
                      Public
                    </span>
                  )}
                  {p.vercelDeployUrl && (
                    <a href={p.vercelDeployUrl} target="_blank" rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground transition-colors">
                      <ExternalLinkIcon className="size-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function UsagePage() {
  return (
    <div className="max-w-4xl mx-auto w-full py-8 px-4 space-y-2">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Your usage</h1>
          <p className="text-sm text-muted-foreground mt-1">Credits, generations, and project activity</p>
        </div>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Dashboard
        </Link>
      </div>
      <Suspense fallback={
        <div className="space-y-4">
          {Array.from({length: 3}).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card h-32 animate-pulse" />
          ))}
        </div>
      }>
        <UsageContent />
      </Suspense>
    </div>
  )
}
