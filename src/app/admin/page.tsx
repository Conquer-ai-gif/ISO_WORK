'use client'

import { Suspense, useState } from 'react'
import { useSuspenseQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTRPC } from '@/trpc/client'
import { formatDistanceToNow, format } from 'date-fns'
import {
  UsersIcon, FolderIcon, SparklesIcon, LayoutGridIcon,
  TrendingUpIcon, CalendarIcon, ExternalLinkIcon, MessageSquareIcon,
  StarIcon, CheckIcon,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon: Icon, accent = false,
}: {
  label: string
  value: number | string
  sub?: string
  icon: React.ElementType
  accent?: boolean
}) {
  return (
    <div className={`rounded-xl border p-5 flex flex-col gap-3 ${accent ? 'border-primary/30 bg-primary/5' : 'bg-card'}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className={`size-4 ${accent ? 'text-primary' : 'text-muted-foreground'}`} />
      </div>
      <div>
        <p className={`text-3xl font-bold ${accent ? 'text-primary' : 'text-foreground'}`}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  )
}

// ── Overview section ─────────────────────────────────────────────────────────
function Overview() {
  const trpc = useTRPC()
  const { data } = useSuspenseQuery(trpc.admin.stats.queryOptions())

  return (
    <>
      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total users"       value={data.totalUsers}        sub="All time"              icon={UsersIcon}      accent />
        <StatCard label="Total projects"    value={data.totalProjects}     sub={`${data.projectsToday} today`} icon={FolderIcon} />
        <StatCard label="Generations"       value={data.totalFragments}    sub={`${data.successfulGenerations7Days} this week`} icon={SparklesIcon} accent />
        <StatCard label="Projects (30d)"    value={data.projects30Days}    sub={`${data.projects7Days} last 7 days`} icon={TrendingUpIcon} />
      </div>

      {/* Recent projects */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center gap-2">
          <CalendarIcon className="size-4 text-muted-foreground" />
          <h2 className="font-medium text-sm">Recent projects</h2>
        </div>
        <div className="divide-y">
          {data.recentProjects.map((p) => (
            <div key={p.id} className="px-5 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">
                  {p.userId} · {p._count.messages} messages
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
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
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(p.createdAt, { addSuffix: true })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ── Activity chart ────────────────────────────────────────────────────────────
function ActivityChart() {
  const trpc = useTRPC()
  const { data } = useSuspenseQuery(trpc.admin.dailyActivity.queryOptions({ days: 30 }))

  const formatted = data.map((d) => ({
    ...d,
    date: format(new Date(d.date), 'MMM d'),
  }))

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center gap-2">
        <TrendingUpIcon className="size-4 text-muted-foreground" />
        <h2 className="font-medium text-sm">Activity — last 30 days</h2>
      </div>
      <div className="p-5">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={formatted} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              interval={4}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Line
              type="monotone" dataKey="projects" name="Projects"
              stroke="hsl(var(--primary))" strokeWidth={2} dot={false}
            />
            <Line
              type="monotone" dataKey="generations" name="Generations"
              stroke="hsl(var(--chart-4))" strokeWidth={2} dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Users table ───────────────────────────────────────────────────────────────
function UsersTable() {
  const trpc = useTRPC()
  const { data } = useSuspenseQuery(trpc.admin.users.queryOptions({ page: 1, limit: 20 }))

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UsersIcon className="size-4 text-muted-foreground" />
          <h2 className="font-medium text-sm">Users</h2>
        </div>
        <span className="text-xs text-muted-foreground">{data.total} total</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">User</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Projects</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Generations</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Last project</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Last active</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.users.map((u) => (
              <tr key={u.userId} className="hover:bg-muted/20 transition-colors">
                <td className="px-5 py-3 max-w-[200px]">
                  <p className="text-sm font-medium truncate">{u.name}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">{u.email || u.userId.slice(-12)}</p>
                </td>
                <td className="px-5 py-3 text-right tabular-nums">{u.projectCount}</td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <span className={u.generationCount > 10 ? 'text-primary font-medium' : ''}>
                    {u.generationCount}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs text-muted-foreground truncate max-w-[180px] hidden md:table-cell">
                  {u.lastProjectName ?? '—'}
                </td>
                <td className="px-5 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                  {u.lastActive ? formatDistanceToNow(u.lastActive, { addSuffix: true }) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Top projects table ────────────────────────────────────────────────────────
function TopProjects() {
  const trpc = useTRPC()
  const { data } = useSuspenseQuery(trpc.admin.topProjects.queryOptions({ limit: 10 }))

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center gap-2">
        <LayoutGridIcon className="size-4 text-muted-foreground" />
        <h2 className="font-medium text-sm">Top projects by activity</h2>
      </div>
      <div className="divide-y">
        {data.map((p, i) => (
          <div key={p.id} className="px-5 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors">
            <span className="text-xs text-muted-foreground w-5 flex-shrink-0 tabular-nums">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{p.name}</p>
              <p className="text-xs text-muted-foreground font-mono truncate">{p.userId}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-muted-foreground tabular-nums">{p._count.messages} msgs</span>
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
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

// ── Feedback table ────────────────────────────────────────────────────────────
const TYPE_STYLES: Record<string, string> = {
  general: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  bug:     'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  feature: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
}
const TYPE_LABEL: Record<string, string> = { general: '💬 General', bug: '🐛 Bug', feature: '✨ Feature' }
const STATUS_STYLES: Record<string, string> = {
  new:      'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  reviewed: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  resolved: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
}

function FeedbackTable() {
  const trpc = useTRPC()
  const [filter, setFilter] = useState<'all' | 'new' | 'reviewed' | 'resolved'>('all')
  const { data, refetch } = useSuspenseQuery(
    trpc.feedback.list.queryOptions({ status: filter, take: 50 }),
  )
  const updateStatus = useMutation(trpc.feedback.updateStatus.mutationOptions({
    onSuccess: () => refetch(),
  }))

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <MessageSquareIcon className="size-4 text-muted-foreground" />
          <h2 className="font-medium text-sm">Feedback</h2>
          <span className="text-xs text-muted-foreground">{data.total} total</span>
        </div>
        <div className="flex gap-1">
          {(['all', 'new', 'reviewed', 'resolved'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors capitalize',
                filter === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      {data.items.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-muted-foreground">No feedback yet.</div>
      ) : (
        <div className="divide-y">
          {data.items.map((f) => (
            <div key={f.id} className="px-5 py-4 flex flex-col gap-2 hover:bg-muted/20 transition-colors">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', TYPE_STYLES[f.type])}>
                  {TYPE_LABEL[f.type]}
                </span>
                <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', STATUS_STYLES[f.status])}>
                  {f.status}
                </span>
                {f.rating && (
                  <span className="flex items-center gap-0.5">
                    {Array.from({ length: f.rating }).map((_, i) => (
                      <StarIcon key={i} className="size-3 text-amber-400 fill-amber-400" />
                    ))}
                  </span>
                )}
                <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                  {formatDistanceToNow(new Date(f.createdAt), { addSuffix: true })}
                </span>
              </div>
              <p className="text-sm text-foreground">{f.message}</p>
              {f.userId && <p className="text-xs text-muted-foreground font-mono">{f.userId}</p>}
              <div className="flex gap-3 mt-1">
                {f.status !== 'reviewed' && (
                  <button onClick={() => updateStatus.mutate({ id: f.id, status: 'reviewed' })}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Mark reviewed
                  </button>
                )}
                {f.status !== 'resolved' && (
                  <button onClick={() => updateStatus.mutate({ id: f.id, status: 'resolved' })}
                    className="text-xs text-green-600 hover:text-green-500 transition-colors flex items-center gap-1">
                    <CheckIcon className="size-3" /> Resolve
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Changelog admin ───────────────────────────────────────────────────────────
function ChangelogAdmin() {
  const trpc = useTRPC()
  const [title, setTitle]       = useState('')
  const [content, setContent]   = useState('')
  const [type, setType]         = useState<'feature'|'improvement'|'bugfix'|'breaking'>('feature')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags]         = useState<string[]>([])

  const queryClient = useQueryClient()

  const { data: entries } = useSuspenseQuery(trpc.changelog.getAll.queryOptions())

  const create = useMutation(trpc.changelog.create.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries(trpc.changelog.getAll.queryOptions())
      setTitle(''); setContent(''); setTags([]); setTagInput('')
    },
  }))

  const publish = useMutation(trpc.changelog.publish.mutationOptions({
    onSuccess: () => queryClient.invalidateQueries(trpc.changelog.getAll.queryOptions()),
  }))

  const del = useMutation(trpc.changelog.delete.mutationOptions({
    onSuccess: () => queryClient.invalidateQueries(trpc.changelog.getAll.queryOptions()),
  }))

  const TYPE_OPTS = [
    { value: 'feature',     label: '🚀 Feature' },
    { value: 'improvement', label: '✨ Improvement' },
    { value: 'bugfix',      label: '🐛 Bug Fix' },
    { value: 'breaking',    label: '⚠️ Breaking' },
  ] as const

  function addTag(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault()
      setTags(t => [...t, tagInput.trim()])
      setTagInput('')
    }
  }

  return (
    <div className="space-y-6">
      {/* Create form */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-medium text-sm">📝 New Changelog Entry</h2>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex gap-2 flex-wrap">
            {TYPE_OPTS.map(opt => (
              <button key={opt.value} onClick={() => setType(opt.value)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  type === opt.value ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'
                )}>
                {opt.label}
              </button>
            ))}
          </div>

          <Input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />

          <Textarea placeholder="Describe what changed..." value={content}
            onChange={e => setContent(e.target.value)} rows={4} />

          <div className="space-y-1">
            <Input placeholder="Add tag (press Enter)" value={tagInput}
              onChange={e => setTagInput(e.target.value)} onKeyDown={addTag} />
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.map(t => (
                  <Badge key={t} variant="secondary" className="text-xs cursor-pointer"
                    onClick={() => setTags(ts => ts.filter(x => x !== t))}>
                    {t} ×
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <Button disabled={!title || !content || create.isPending}
            onClick={() => create.mutate({ title, content, type, tags })}>
            Save Draft
          </Button>
        </div>
      </div>

      {/* Entries list */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-medium text-sm">All Entries</h2>
        </div>
        {(entries as any[]).length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">No entries yet.</div>
        ) : (
          <div className="divide-y">
            {(entries as any[]).map(e => (
              <div key={e.id} className="px-5 py-4 flex items-start justify-between gap-4">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium capitalize text-muted-foreground">{e.type}</span>
                    {e.published
                      ? <Badge variant="default" className="text-[10px] h-4 px-1.5 bg-green-600">Published</Badge>
                      : <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Draft</Badge>
                    }
                  </div>
                  <p className="text-sm font-medium truncate">{e.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{e.content}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {!e.published && (
                    <Button size="sm" variant="outline" className="h-7 text-xs"
                      disabled={publish.isPending}
                      onClick={() => publish.mutate({ id: e.id })}>
                      Publish + Notify
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive"
                    disabled={del.isPending}
                    onClick={() => del.mutate({ id: e.id })}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [tab, setTab] = useState<'overview' | 'feedback' | 'marketplace' | 'changelog'>('overview')
  const queryClient = useQueryClient()

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Admin dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">Internal metrics — only visible to admin users</p>
          </div>
          <a href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Back to app</a>
        </div>

        <div className="flex gap-1 border-b">
          {(['overview', 'feedback', 'marketplace', 'changelog'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn(
                'px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px',
                tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}>
              {t === 'feedback' ? '💬 Feedback' : t === 'marketplace' ? '🚀 Marketplace' : t === 'changelog' ? '📝 Changelog' : '📊 Overview'}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <>
            <Suspense fallback={<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({length:4}).map((_,i)=><div key={i} className="rounded-xl border bg-card p-5 h-28 animate-pulse"/>)}</div>}>
              <Overview />
            </Suspense>
            <Suspense fallback={<div className="rounded-xl border bg-card h-64 animate-pulse"/>}>
              <ActivityChart />
            </Suspense>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Suspense fallback={<div className="rounded-xl border bg-card h-64 animate-pulse"/>}>
                <TopProjects />
              </Suspense>
              <Suspense fallback={<div className="rounded-xl border bg-card h-64 animate-pulse"/>}>
                <UsersTable />
              </Suspense>
            </div>
          </>
        )}

        {tab === 'feedback' && (
          <Suspense fallback={<div className="rounded-xl border bg-card h-64 animate-pulse"/>}>
            <FeedbackTable />
          </Suspense>
        )}

        {tab === 'marketplace' && (
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h2 className="font-medium text-sm">🚀 Marketplace Templates</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Feature templates from the admin dashboard — go to{' '}
                <a href="/marketplace" className="text-primary hover:underline">/marketplace</a>{' '}
                to browse and manage community submissions.
              </p>
            </div>
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              Visit <a href="/marketplace" className="text-primary hover:underline">/marketplace</a> to browse all community templates and feature them.
            </div>
          </div>
        )}

        {tab === 'changelog' && (
          <Suspense fallback={<div className="rounded-xl border bg-card h-64 animate-pulse"/>}>
            <ChangelogAdmin />
          </Suspense>
        )}
      </div>
    </div>
  )
}
