'use client'

import { Suspense, useState } from 'react'
import { useSuspenseQuery, useMutation } from '@tanstack/react-query'
import { useTRPC } from '@/trpc/client'
import { useUser } from '@clerk/nextjs'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  RocketIcon, SparklesIcon, BugIcon, AlertTriangleIcon,
  BellIcon, Loader2Icon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChangelogEntry } from '@/generated/prisma/client'

const TYPE_CONFIG = {
  feature:     { label: 'New Feature',  icon: RocketIcon,       colour: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20' },
  improvement: { label: 'Improvement',  icon: SparklesIcon,     colour: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' },
  bugfix:      { label: 'Bug Fix',      icon: BugIcon,          colour: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20' },
  breaking:    { label: 'Breaking',     icon: AlertTriangleIcon, colour: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' },
}

type EntryType = keyof typeof TYPE_CONFIG

function ChangelogEntries() {
  const trpc = useTRPC()
  const { data: entries } = useSuspenseQuery(trpc.changelog.getPublished.queryOptions()) as { data: ChangelogEntry[] }
  const [filter, setFilter] = useState<EntryType | 'all'>('all')

  const filtered = filter === 'all' ? entries : entries.filter((e: ChangelogEntry) => e.type === filter)

  if (entries.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <SparklesIcon className="size-8 mx-auto mb-3 opacity-40" />
        <p>No updates yet — check back soon!</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'feature', 'improvement', 'bugfix', 'breaking'] as const).map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize',
              filter === t
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {t === 'all' ? 'All updates' : TYPE_CONFIG[t].label}
          </button>
        ))}
      </div>

      {/* Entries */}
      <div className="space-y-8">
        {filtered.map((entry: any) => {
          const cfg = TYPE_CONFIG[entry.type as EntryType] ?? TYPE_CONFIG.feature
          const Icon = cfg.icon

          return (
            <article key={entry.id} className="flex gap-6">
              {/* Date column */}
              <div className="hidden sm:block w-32 pt-1 flex-shrink-0">
                <time className="text-xs text-muted-foreground">
                  {entry.publishedAt
                    ? format(new Date(entry.publishedAt), 'MMM d, yyyy')
                    : '—'
                  }
                </time>
              </div>

              {/* Content */}
              <div className="flex-1 border rounded-xl p-5 space-y-3 bg-card">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border', cfg.colour)}>
                    <Icon className="size-3" />
                    {cfg.label}
                  </span>
                  <time className="sm:hidden text-xs text-muted-foreground">
                    {entry.publishedAt ? format(new Date(entry.publishedAt), 'MMM d, yyyy') : ''}
                  </time>
                </div>

                <h2 className="text-base font-semibold">{entry.title}</h2>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{entry.content}</p>

                {entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {entry.tags.map((tag: string) => (
                      <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function SubscribeForm() {
  const trpc = useTRPC()
  const { user } = useUser()
  const [email, setEmail] = useState(user?.primaryEmailAddress?.emailAddress ?? '')
  const [subscribed, setSubscribed] = useState(false)

  const subscribe = useMutation(trpc.changelog.subscribe.mutationOptions({
    onSuccess: () => { setSubscribed(true); toast.success('Subscribed! You\'ll get notified on new updates.') },
    onError:   e => toast.error(e.message),
  }))

  if (subscribed) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
        <BellIcon className="size-4" />
        You&apos;re subscribed to updates.
      </div>
    )
  }

  return (
    <div className="flex gap-2 max-w-sm">
      <Input
        type="email"
        placeholder="your@email.com"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className="h-9 text-sm"
      />
      <Button
        size="sm"
        disabled={!email || subscribe.isPending}
        onClick={() => subscribe.mutate({ email })}
      >
        {subscribe.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <>
          <BellIcon className="size-3.5" /> Notify me
        </>}
      </Button>
    </div>
  )
}

export default function ChangelogPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12 space-y-10">
      {/* Header */}
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">What&apos;s New</h1>
        <p className="text-muted-foreground">
          New features, improvements, and fixes — straight from the Isotope team.
        </p>
        <SubscribeForm />
      </div>

      {/* Entries */}
      <Suspense fallback={
        <div className="flex justify-center py-20">
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        </div>
      }>
        <ChangelogEntries />
      </Suspense>
    </main>
  )
}
