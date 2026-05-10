'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { toast } from 'sonner'
import { GitForkIcon, Loader2Icon } from 'lucide-react'
import { useTRPC } from '@/trpc/client'
import { Button } from '@/components/ui/button'

interface Props {
  projectId: string
  projectName: string
}

export const ForkButton = ({ projectId, projectName }: Props) => {
  const { isSignedIn } = useAuth()
  const router = useRouter()
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const fork = useMutation(
    trpc.projects.fork.mutationOptions({
      onSuccess: (project) => {
        queryClient.invalidateQueries(trpc.projects.getMany.queryOptions())
        toast.success(`Forked "${projectName}" — opening your copy...`)
        router.push(`/projects/${project.id}`)
      },
      onError: (e) => toast.error(e.message),
    }),
  )

  const handleFork = () => {
    if (!isSignedIn) {
      // Redirect to sign-in then back to this page
      router.push(`/sign-in?redirect_url=${encodeURIComponent(window.location.href)}`)
      return
    }
    fork.mutate({ projectId })
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={fork.isPending}
      onClick={handleFork}
      className="gap-1.5"
    >
      {fork.isPending
        ? <><Loader2Icon className="size-3.5 animate-spin" /> Forking...</>
        : <><GitForkIcon className="size-3.5" /> Fork</>
      }
    </Button>
  )
}
