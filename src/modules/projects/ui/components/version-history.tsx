'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ClockIcon, CheckIcon, ChevronRightIcon } from 'lucide-react'
import { useTRPC } from '@/trpc/client'
import { Fragment as PrismaFragment } from '@/generated/prisma/client'
import { cn } from '@/lib/utils'

interface Props {
  projectId: string
  activeFragment: PrismaFragment | null
  onSelectFragment: (fragment: PrismaFragment) => void
  onClose: () => void
}

export const VersionHistory = ({ projectId, activeFragment, onSelectFragment, onClose }: Props) => {
  const trpc = useTRPC()
  const { data: messages } = useSuspenseQuery(
    trpc.messages.getMany.queryOptions({ projectId }),
  )

  // Only messages that have a fragment (RESULT type from assistant)
  const versions = messages
    .filter((m) => m.role === 'ASSISTANT' && m.fragment && m.type === 'RESULT')
    .reverse() // newest first

  return (
    <div className="flex flex-col h-full border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ClockIcon className="size-4" />
          Version history
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>

      {/* Version list */}
      <div className="flex-1 overflow-y-auto">
        {versions.length === 0 && (
          <p className="text-sm text-muted-foreground text-center p-6">
            No versions yet
          </p>
        )}

        {versions.map((message, index) => {
          const fragment = message.fragment!
          const isActive = activeFragment?.id === fragment.id
          const isLatest = index === 0

          return (
            <button
              key={message.id}
              className={cn(
                'w-full flex items-start gap-3 px-3 py-3 border-b text-left hover:bg-muted/50 transition-colors',
                isActive && 'bg-muted',
              )}
              onClick={() => onSelectFragment(fragment)}
            >
              {/* Version dot */}
              <div className="flex flex-col items-center gap-1 mt-0.5 flex-shrink-0">
                <div className={cn(
                  'size-2.5 rounded-full border-2',
                  isActive
                    ? 'border-primary bg-primary'
                    : isLatest
                      ? 'border-green-500 bg-green-500'
                      : 'border-muted-foreground bg-background',
                )} />
                {index < versions.length - 1 && (
                  <div className="w-px flex-1 bg-border min-h-[20px]" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium truncate">
                    {fragment.title}
                  </span>
                  {isLatest && (
                    <span className="text-[10px] bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded-full flex-shrink-0">
                      Latest
                    </span>
                  )}
                  {isActive && !isLatest && (
                    <CheckIcon className="size-3 text-primary flex-shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {format(message.createdAt, 'MMM d, yyyy · HH:mm')}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {message.content}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
