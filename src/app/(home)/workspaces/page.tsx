'use client'

import { Suspense, useState } from 'react'
import { useSuspenseQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import { PlusIcon, UsersIcon, FolderIcon, Loader2Icon, ArrowRightIcon } from 'lucide-react'
import { useTRPC } from '@/trpc/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'

function WorkspaceList() {
  const trpc = useTRPC()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: workspaces } = useSuspenseQuery(trpc.workspaces.getMany.queryOptions())
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  const create = useMutation(trpc.workspaces.create.mutationOptions({
    onSuccess: (ws) => {
      queryClient.invalidateQueries(trpc.workspaces.getMany.queryOptions())
      toast.success(`Workspace "${ws.name}" created`)
      setOpen(false)
      setName('')
      router.push(`/workspaces/${ws.id}`)
    },
    onError: (e) => toast.error(e.message),
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workspaces</h1>
          <p className="text-sm text-muted-foreground mt-1">Collaborate on projects with your team</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <PlusIcon className="size-4" /> New workspace
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create workspace</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="e.g. Acme Co, Side Project, Design Team"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && name && create.mutate({ name })}
                autoFocus
              />
              <Button
                className="w-full"
                disabled={!name || create.isPending}
                onClick={() => create.mutate({ name })}
              >
                {create.isPending ? <Loader2Icon className="size-4 animate-spin" /> : 'Create workspace'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {workspaces.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center space-y-3">
          <UsersIcon className="size-8 text-muted-foreground mx-auto" />
          <p className="font-medium">No workspaces yet</p>
          <p className="text-sm text-muted-foreground">Create a workspace to collaborate on projects with your team</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workspaces.map((ws) => {
            const myRole = ws.members[0]?.role ?? 'VIEWER'
            return (
              <Link
                key={ws.id}
                href={`/workspaces/${ws.id}`}
                className="group rounded-xl border bg-card p-5 hover:border-primary/50 hover:shadow-sm transition-all flex flex-col gap-3"
              >
                <div className="flex items-start justify-between">
                  <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <UsersIcon className="size-5 text-primary" />
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                    myRole === 'OWNER' ? 'bg-primary/10 text-primary'
                    : myRole === 'EDITOR' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-muted text-muted-foreground'
                  }`}>
                    {myRole.charAt(0) + myRole.slice(1).toLowerCase()}
                  </span>
                </div>
                <div>
                  <p className="font-semibold truncate">{ws.name}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><UsersIcon className="size-3" />{ws._count.members}</span>
                    <span className="flex items-center gap-1"><FolderIcon className="size-3" />{ws._count.projects} projects</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Open workspace <ArrowRightIcon className="size-3" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function WorkspacesPage() {
  return (
    <div className="max-w-5xl mx-auto w-full py-8 px-4">
      <Suspense fallback={<div className="space-y-4">{Array.from({length:3}).map((_,i)=><div key={i} className="rounded-xl border bg-card h-32 animate-pulse"/>)}</div>}>
        <WorkspaceList />
      </Suspense>
    </div>
  )
}
