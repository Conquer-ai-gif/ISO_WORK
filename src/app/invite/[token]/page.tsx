'use client'

import { Suspense } from 'react'
import { useSuspenseQuery, useMutation } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { toast } from 'sonner'
import { UsersIcon, Loader2Icon, CheckCircleIcon, XCircleIcon } from 'lucide-react'
import { useTRPC } from '@/trpc/client'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

const ROLE_LABELS = { OWNER: 'Owner', EDITOR: 'Editor', VIEWER: 'Viewer' }

function InviteContent({ token }: { token: string }) {
  const trpc = useTRPC()
  const router = useRouter()
  const { isSignedIn } = useAuth()

  const { data: invite } = useSuspenseQuery(
    trpc.workspaces.getInviteByToken.queryOptions({ token }),
  )

  const accept = useMutation(trpc.workspaces.acceptInvite.mutationOptions({
    onSuccess: ({ workspaceId }) => {
      toast.success(`Joined ${invite.workspace.name}!`)
      router.push(`/workspaces/${workspaceId}`)
    },
    onError: (e) => toast.error(e.message),
  }))

  return (
    <div className="max-w-md w-full mx-auto px-4">
      <div className="rounded-2xl border bg-card p-8 text-center space-y-5">
        <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <UsersIcon className="size-8 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">You're invited</h1>
          <p className="text-muted-foreground mt-1">
            Join <span className="font-semibold text-foreground">{invite.workspace.name}</span> as{' '}
            <span className="font-semibold text-foreground">{ROLE_LABELS[invite.role]}</span>
          </p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground space-y-1">
          <p>{invite.workspace._count.members} member{invite.workspace._count.members !== 1 ? 's' : ''} already</p>
          <p>
            {invite.role === 'EDITOR'
              ? 'You can view, chat, and generate code'
              : 'You can view projects and chat history'}
          </p>
        </div>
        {isSignedIn ? (
          <Button
            className="w-full"
            disabled={accept.isPending}
            onClick={() => accept.mutate({ token })}
          >
            {accept.isPending
              ? <><Loader2Icon className="size-4 animate-spin" /> Joining...</>
              : <><CheckCircleIcon className="size-4" /> Accept invitation</>
            }
          </Button>
        ) : (
          <Button className="w-full" asChild>
            <Link href={`/sign-in?redirect_url=${encodeURIComponent(`/invite/${token}`)}`}>
              Sign in to accept
            </Link>
          </Button>
        )}
        <Button variant="ghost" size="sm" className="w-full text-muted-foreground" asChild>
          <Link href="/">Decline</Link>
        </Button>
      </div>
    </div>
  )
}

function InviteError({ message }: { message: string }) {
  return (
    <div className="max-w-md w-full mx-auto px-4">
      <div className="rounded-2xl border bg-card p-8 text-center space-y-4">
        <XCircleIcon className="size-12 text-destructive mx-auto" />
        <h1 className="text-xl font-bold">Invalid invite</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button asChild><Link href="/">Go home</Link></Button>
      </div>
    </div>
  )
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12">
      <Suspense fallback={
        <div className="max-w-md w-full mx-auto px-4">
          <div className="rounded-2xl border bg-card p-8 animate-pulse h-64" />
        </div>
      }>
        <InviteContent token={token} />
      </Suspense>
    </div>
  )
}
