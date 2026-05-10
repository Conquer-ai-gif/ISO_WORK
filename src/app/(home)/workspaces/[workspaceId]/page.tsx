'use client'

import { Suspense, useState } from 'react'
import { useSuspenseQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter, useParams } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import {
  PlusIcon, SettingsIcon, FolderIcon, ArrowLeftIcon,
  Loader2Icon, ExternalLinkIcon, SparklesIcon,
} from 'lucide-react'
import { useTRPC } from '@/trpc/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { useAuth } from '@clerk/nextjs'

function WorkspaceDashboard({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { userId } = useAuth()
  const [createOpen, setCreateOpen] = useState(false)
  const [projectPrompt, setProjectPrompt] = useState('')

  const { data: workspace } = useSuspenseQuery(trpc.workspaces.getOne.queryOptions({ id: workspaceId }))
  const { data: projects }  = useSuspenseQuery(trpc.workspaces.getProjects.queryOptions({ workspaceId }))

  const myRole = workspace?.members.find((m) => m.userId === userId)?.role ?? 'VIEWER'
  const canEdit = myRole === 'OWNER' || myRole === 'EDITOR'

  const createProject = useMutation(trpc.projects.create.mutationOptions({
    onSuccess: (p) => {
      queryClient.invalidateQueries(trpc.workspaces.getProjects.queryOptions({ workspaceId }))
      toast.success('Project created')
      setCreateOpen(false)
      setProjectPrompt('')
      router.push(`/projects/${p.id}`)
    },
    onError: (e) => {
      if (e?.message?.includes('run out of credits') || e?.data?.code === 'TOO_MANY_REQUESTS') {
        router.push('/pricing')
      } else {
        toast.error(e.message)
      }
    },
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/workspaces" className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
            <ArrowLeftIcon className="size-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">{workspace?.name}</h1>
            <p className="text-sm text-muted-foreground">
              {workspace?._count.projects} projects · {workspace?.members.length} members
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {myRole === 'OWNER' && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/workspaces/${workspaceId}/settings`}>
                <SettingsIcon className="size-4" /> Settings
              </Link>
            </Button>
          )}
          {canEdit && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <PlusIcon className="size-4" /> New project
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New workspace project</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    This project will be visible to all workspace members. Credits are charged to the workspace owner.
                  </p>
                  <Input
                    placeholder="What do you want to build?"
                    value={projectPrompt}
                    onChange={(e) => setProjectPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && projectPrompt && createProject.mutate({ value: projectPrompt, workspaceId })}
                  />
                  <Button
                    className="w-full"
                    disabled={!projectPrompt || createProject.isPending}
                    onClick={() => createProject.mutate({ value: projectPrompt, workspaceId })}
                  >
                    {createProject.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <><SparklesIcon className="size-4" /> Generate</>}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Members strip */}
      <div className="flex items-center gap-2 flex-wrap">
        {workspace?.members.map((m) => (
          <div key={m.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-xs">
            <div className="size-4 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-[9px] text-primary font-medium">
                {m.userId.slice(-2).toUpperCase()}
              </span>
            </div>
            <span className="text-muted-foreground font-mono">{m.userId.slice(-8)}</span>
            <span className={`font-medium ${
              m.role === 'OWNER' ? 'text-primary'
              : m.role === 'EDITOR' ? 'text-green-600 dark:text-green-400'
              : 'text-muted-foreground'
            }`}>
              {m.role.charAt(0) + m.role.slice(1).toLowerCase()}
            </span>
          </div>
        ))}
      </div>

      {/* Projects grid */}
      {projects.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center space-y-3">
          <FolderIcon className="size-8 text-muted-foreground mx-auto" />
          <p className="font-medium">No projects yet</p>
          {canEdit
            ? <p className="text-sm text-muted-foreground">Create the first project for this workspace</p>
            : <p className="text-sm text-muted-foreground">No projects have been created in this workspace yet</p>
          }
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => {
            const fragment = project.messages[0]?.fragment
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group rounded-xl border bg-card p-4 hover:border-primary/50 hover:shadow-sm transition-all flex flex-col gap-3"
              >
                {/* Preview thumbnail */}
                <div className="aspect-video rounded-lg bg-muted/50 border overflow-hidden flex items-center justify-center">
                  {fragment ? (
                    <iframe
                      src={`/api/preview/${fragment.id}`}
                      className="w-full h-full pointer-events-none scale-[0.5] origin-center"
                      sandbox="allow-scripts allow-same-origin"
                    />
                  ) : (
                    <FolderIcon className="size-8 text-muted-foreground/30" />
                  )}
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{project.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(project.updatedAt, { addSuffix: true })}
                    </p>
                  </div>
                  {fragment?.deployUrl && (
                    <a
                      href={fragment.deployUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLinkIcon className="size-3.5" />
                    </a>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  return (
    <div className="max-w-5xl mx-auto w-full py-8 px-4">
      <Suspense fallback={<div className="space-y-4">{Array.from({length:4}).map((_,i)=><div key={i} className="rounded-xl border bg-card h-32 animate-pulse"/>)}</div>}>
        <WorkspaceDashboard workspaceId={workspaceId} />
      </Suspense>
    </div>
  )
}
