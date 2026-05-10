'use client'

import { Suspense, useState } from 'react'
import { useSuspenseQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import { formatDistanceToNow, format, addDays } from 'date-fns'
import {
  ArrowLeftIcon, Loader2Icon, CopyIcon, CheckIcon,
  PlusIcon, Trash2Icon, ShieldIcon, XIcon,
} from 'lucide-react'
import { useTRPC } from '@/trpc/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useAuth } from '@clerk/nextjs'

const ROLE_LABELS = { OWNER: 'Owner', EDITOR: 'Editor', VIEWER: 'Viewer' }
const ROLE_COLORS = {
  OWNER:  'bg-primary/10 text-primary',
  EDITOR: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  VIEWER: 'bg-muted text-muted-foreground',
}

function WorkspaceSettings({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { userId } = useAuth()

  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteRole, setInviteRole] = useState<'EDITOR' | 'VIEWER'>('EDITOR')
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [newInviteLink, setNewInviteLink] = useState<string | null>(null)

  const { data: workspace } = useSuspenseQuery(trpc.workspaces.getOne.queryOptions({ id: workspaceId }))
  const { data: invites }   = useSuspenseQuery(trpc.workspaces.getInvites.queryOptions({ workspaceId }))

  const invalidate = () => {
    queryClient.invalidateQueries(trpc.workspaces.getOne.queryOptions({ id: workspaceId }))
    queryClient.invalidateQueries(trpc.workspaces.getMany.queryOptions())
    queryClient.invalidateQueries(trpc.workspaces.getInvites.queryOptions({ workspaceId }))
  }

  const rename = useMutation(trpc.workspaces.rename.mutationOptions({
    onSuccess: () => { invalidate(); toast.success('Renamed'); setRenaming(false) },
    onError: (e) => toast.error(e.message),
  }))

  const deleteWs = useMutation(trpc.workspaces.delete.mutationOptions({
    onSuccess: () => { toast.success('Workspace deleted'); router.push('/workspaces') },
    onError: (e) => toast.error(e.message),
  }))

  const removeMember = useMutation(trpc.workspaces.removeMember.mutationOptions({
    onSuccess: () => { invalidate(); toast.success('Member removed') },
    onError: (e) => toast.error(e.message),
  }))

  const updateRole = useMutation(trpc.workspaces.updateRole.mutationOptions({
    onSuccess: () => { invalidate(); toast.success('Role updated') },
    onError: (e) => toast.error(e.message),
  }))

  const createInvite = useMutation(trpc.workspaces.createInvite.mutationOptions({
    onSuccess: (invite) => {
      invalidate()
      const link = `${window.location.origin}/invite/${invite.token}`
      setNewInviteLink(link)
    },
    onError: (e) => toast.error(e.message),
  }))

  const revokeInvite = useMutation(trpc.workspaces.revokeInvite.mutationOptions({
    onSuccess: () => { invalidate(); toast.success('Invite revoked') },
    onError: (e) => toast.error(e.message),
  }))

  const copyLink = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedToken(key)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  const appUrl = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/workspaces/${workspaceId}`} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeftIcon className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Workspace settings</h1>
          <p className="text-sm text-muted-foreground">{workspace?.name}</p>
        </div>
      </div>

      {/* Rename */}
      <section className="rounded-xl border bg-card p-5 space-y-3">
        <h2 className="font-semibold">Workspace name</h2>
        {renaming ? (
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && newName && rename.mutate({ id: workspaceId, name: newName })}
              autoFocus
            />
            <Button disabled={!newName || rename.isPending} onClick={() => rename.mutate({ id: workspaceId, name: newName })}>
              {rename.isPending ? <Loader2Icon className="size-4 animate-spin" /> : 'Save'}
            </Button>
            <Button variant="ghost" onClick={() => setRenaming(false)}>Cancel</Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm">{workspace?.name}</span>
            <Button size="sm" variant="outline" onClick={() => { setNewName(workspace?.name ?? ''); setRenaming(true) }}>
              Rename
            </Button>
          </div>
        )}
      </section>

      {/* Members */}
      <section className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Members</h2>
          <Dialog open={inviteOpen} onOpenChange={(o) => { setInviteOpen(o); if (!o) setNewInviteLink(null) }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <PlusIcon className="size-4" /> Invite
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Invite member</DialogTitle></DialogHeader>
              {newInviteLink ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Share this link with the person you want to invite. It expires in 7 days.</p>
                  <div className="flex gap-2">
                    <Input value={newInviteLink} readOnly className="font-mono text-xs" />
                    <Button size="sm" variant="outline" onClick={() => copyLink(newInviteLink, 'new')}>
                      {copiedToken === 'new' ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                    </Button>
                  </div>
                  <Button variant="outline" className="w-full" onClick={() => setNewInviteLink(null)}>
                    Create another
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Role</p>
                    <div className="flex gap-2">
                      {(['EDITOR', 'VIEWER'] as const).map((r) => (
                        <button
                          key={r}
                          onClick={() => setInviteRole(r)}
                          className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                            inviteRole === r ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-foreground/30'
                          }`}
                        >
                          {ROLE_LABELS[r]}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {inviteRole === 'EDITOR'
                        ? 'Can view, chat, and trigger code generation (uses workspace owner\'s credits)'
                        : 'Can view projects and chat history — cannot generate code'}
                    </p>
                  </div>
                  <Button
                    className="w-full"
                    disabled={createInvite.isPending}
                    onClick={() => createInvite.mutate({ workspaceId, role: inviteRole })}
                  >
                    {createInvite.isPending ? <Loader2Icon className="size-4 animate-spin" /> : 'Generate invite link'}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
        <div className="divide-y">
          {workspace?.members.map((m) => (
            <div key={m.id} className="px-5 py-3 flex items-center gap-3">
              <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-xs text-primary font-medium">{m.userId.slice(-2).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono truncate text-muted-foreground">{m.userId}</p>
                <p className="text-xs text-muted-foreground">
                  Joined {formatDistanceToNow(m.joinedAt, { addSuffix: true })}
                  {m.userId === userId && ' (you)'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {m.role !== 'OWNER' ? (
                  <select
                    value={m.role}
                    disabled={updateRole.isPending}
                    className="text-xs rounded-md border bg-transparent px-2 py-1 cursor-pointer"
                    onChange={(e) => updateRole.mutate({ workspaceId, userId: m.userId, role: e.target.value as 'EDITOR' | 'VIEWER' })}
                  >
                    <option value="EDITOR">Editor</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                ) : (
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[m.role]}`}>
                    {ROLE_LABELS[m.role]}
                  </span>
                )}
                {m.role !== 'OWNER' && m.userId !== userId && (
                  <Button
                    size="sm" variant="ghost"
                    className="size-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeMember.mutate({ workspaceId, userId: m.userId })}
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Active invites */}
      {invites && invites.length > 0 && (
        <section className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h2 className="font-semibold">Pending invite links</h2>
          </div>
          <div className="divide-y">
            {invites.map((inv) => {
              const link = `${appUrl}/invite/${inv.token}`
              return (
                <div key={inv.id} className="px-5 py-3 flex items-center gap-3">
                  <ShieldIcon className="size-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{ROLE_LABELS[inv.role]} invite</p>
                    <p className="text-xs text-muted-foreground">
                      Expires {format(inv.expiresAt, 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
                      onClick={() => copyLink(link, inv.id)}>
                      {copiedToken === inv.id ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
                      Copy
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => revokeInvite.mutate({ id: inv.id })}>
                      <XIcon className="size-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Danger zone */}
      <section className="rounded-xl border border-destructive/30 bg-card p-5 space-y-3">
        <h2 className="font-semibold text-destructive">Danger zone</h2>
        <p className="text-sm text-muted-foreground">
          Deleting this workspace permanently removes all projects, messages, and files for all members. This cannot be undone.
        </p>
        <Button
          variant="outline"
          className="border-destructive/30 text-destructive hover:bg-destructive/10"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2Icon className="size-4" /> Delete workspace
        </Button>
      </section>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{workspace?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the workspace and all its projects for every member. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteWs.mutate({ id: workspaceId })}
            >
              {deleteWs.isPending ? <Loader2Icon className="size-4 animate-spin" /> : 'Delete workspace'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function WorkspaceSettingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  return (
    <div className="max-w-5xl mx-auto w-full py-8 px-4">
      <Suspense fallback={<div className="space-y-4">{Array.from({length:3}).map((_,i)=><div key={i} className="rounded-xl border bg-card h-24 animate-pulse"/>)}</div>}>
        <WorkspaceSettings workspaceId={workspaceId} />
      </Suspense>
    </div>
  )
}
