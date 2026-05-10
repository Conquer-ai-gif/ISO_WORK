'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTRPC } from '@/trpc/client'
import { GitBranchIcon, CheckCircleIcon, GithubIcon, Loader2Icon, ExternalLinkIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface Props {
  fragmentId: string
  branchName: string
  branchMerged: boolean
  projectId: string
  prUrl?: string | null
}

export function BranchManager({ fragmentId, branchName, branchMerged, projectId, prUrl }: Props) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const push = useMutation(trpc.projects.pushToGitHub.mutationOptions({
    onSuccess: ({ prUrl: url }) => {
      toast.success('Pushed to GitHub — auto-merging...', {
        action: url ? { label: 'View PR', onClick: () => window.open(url) } : undefined,
      })
      queryClient.invalidateQueries(trpc.messages.getMany.queryOptions({ projectId }))
    },
    onError: (e) => toast.error(e.message),
  }))

  const shortBranch = branchName.replace('isotope/', '')

  // Already merged — show final state with optional PR link
  if (branchMerged) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-green-400">
          <CheckCircleIcon className="size-3.5" />
          Merged to main
        </div>
        {prUrl && (
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLinkIcon className="size-3" />
            View PR
          </a>
        )}
      </div>
    )
  }

  // Branch exists but not yet merged — show branch name + re-push option
  if (branchName) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
          <GitBranchIcon className="size-3" />
          <span className="font-mono truncate max-w-[180px]">{shortBranch}</span>
        </div>
        {prUrl && (
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLinkIcon className="size-3" />
            View PR
          </a>
        )}
      </div>
    )
  }

  // No branch yet — show push button
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-6 text-xs gap-1.5 px-2"
      disabled={push.isPending}
      onClick={() => push.mutate({ fragmentId })}
    >
      {push.isPending
        ? <Loader2Icon className="size-3 animate-spin" />
        : <GithubIcon className="size-3" />
      }
      {push.isPending ? 'Pushing...' : 'Push to GitHub'}
    </Button>
  )
}
