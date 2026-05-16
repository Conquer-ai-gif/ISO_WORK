'use client'

import Link from 'next/link'
import Image from 'next/image'
import { formatDistanceToNow } from 'date-fns'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  Trash2Icon, GlobeIcon, MoreHorizontalIcon,
  PencilIcon, CodeIcon, Loader2Icon,
} from 'lucide-react'

import { useTRPC } from '@/trpc/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUser } from '@clerk/nextjs'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export const ProjectsList = () => {
  const trpc = useTRPC()
  const { user } = useUser()
  const queryClient = useQueryClient()
  const { data: projects } = useQuery({
    ...trpc.projects.getMany.queryOptions(),
    enabled: !!user,
  })

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const invalidate = () => queryClient.invalidateQueries(trpc.projects.getMany.queryOptions())

  const deleteProject = useMutation(trpc.projects.delete.mutationOptions({
    onMutate: async ({ id }) => {
      // Cancel in-flight queries so they don't overwrite optimistic update
      await queryClient.cancelQueries(trpc.projects.getMany.queryOptions())
      // Snapshot previous data for rollback
      const previous = queryClient.getQueryData(trpc.projects.getMany.queryOptions())
      // Optimistically remove the project immediately
      queryClient.setQueryData(trpc.projects.getMany.queryOptions(), (old: typeof projects) =>
        old?.filter((p) => p.id !== id) ?? old,
      )
      return { previous }
    },
    onSuccess: () => { invalidate(); toast.success('Project deleted'); setDeletingId(null) },
    onError: (_err, _vars, context) => {
      // Rollback to previous state if delete fails
      if (context?.previous) {
        queryClient.setQueryData(trpc.projects.getMany.queryOptions(), context.previous)
      }
      toast.error('Failed to delete project')
      setDeletingId(null)
    },
  }))

  const rename = useMutation(trpc.projects.rename.mutationOptions({
    onMutate: async ({ id, name }) => {
      await queryClient.cancelQueries(trpc.projects.getMany.queryOptions())
      const previous = queryClient.getQueryData(trpc.projects.getMany.queryOptions())
      queryClient.setQueryData(trpc.projects.getMany.queryOptions(), (old: typeof projects) =>
        old?.map((p) => p.id === id ? { ...p, name } : p) ?? old,
      )
      return { previous }
    },
    onSuccess: () => { invalidate(); toast.success('Renamed'); setRenamingId(null) },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(trpc.projects.getMany.queryOptions(), context.previous)
      }
      toast.error('Failed to rename project')
      setRenamingId(null)
    },
  }))

  const renamingProject = projects?.find((p) => p.id === renamingId)

  if (!user) return null

  return (
    <div className="w-full bg-white dark:bg-sidebar rounded-xl p-6 border flex flex-col gap-y-4">
      <h2 className="text-xl font-semibold">{user?.firstName}&apos;s Projects</h2>

      {(!projects || projects.length === 0) && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No projects yet — build something above!
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects?.map((project) => {
          const latestFragment = project.messages?.[0]?.fragment
          const previewUrl = latestFragment?.deployUrl ?? latestFragment?.sandboxUrl ?? null

          return (
            <div key={project.id} className="group relative border rounded-xl overflow-hidden hover:border-primary/50 transition-colors bg-card">

              {/* Preview area */}
              <Link href={`/projects/${project.id}`} className="block">
                <div className="relative w-full h-36 bg-muted overflow-hidden">
                  {previewUrl ? (
                    <>
                      <iframe
                        src={previewUrl}
                        className="absolute inset-0 w-[200%] h-[200%] pointer-events-none border-none"
                        style={{ transform: 'scale(0.5)', transformOrigin: 'top left' }}
                        sandbox="allow-scripts allow-same-origin"
                        loading="lazy"
                        title={project.name}
                      />
                      <div className="absolute inset-0" />
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Image src="/6.png" alt="Isotope" width={48} height={48} className="object-contain opacity-30" />
                    </div>
                  )}
                </div>

                {/* Card footer */}
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <Image src="/logo.svg" alt="Isotope" width={22} height={22} className="object-contain flex-shrink-0" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate font-medium text-sm">{project.name}</h3>
                      {project.isPublic && <GlobeIcon className="size-3 text-green-500 flex-shrink-0" />}
                    </div>
                    {project.isIndexing ? (
                      <span className="flex items-center gap-1 text-[10px] text-blue-500 animate-pulse">
                        <span className="size-1.5 rounded-full bg-blue-500 inline-block" />
                        Indexing codebase...
                      </span>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(project.updatedAt, { addSuffix: true })}
                      </p>
                    )}
                  </div>
                </div>
              </Link>

              {/* Three-dot menu — appears on hover */}
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="p-1.5 rounded-md bg-background/80 hover:bg-muted text-muted-foreground backdrop-blur-sm transition-colors"
                      onClick={(e) => e.preventDefault()}
                    >
                      <MoreHorizontalIcon className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem asChild>
                      <Link href={`/projects/${project.id}`} className="flex items-center gap-2">
                        <CodeIcon className="size-3.5" /> View code
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.preventDefault()
                        setRenameValue(project.name)
                        setRenamingId(project.id)
                      }}
                    >
                      <PencilIcon className="size-3.5" /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={(e) => { e.preventDefault(); setDeletingId(project.id) }}
                    >
                      <Trash2Icon className="size-3.5" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )
        })}
      </div>

      {/* Rename dialog */}
      <Dialog open={!!renamingId} onOpenChange={(o) => !o && setRenamingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename &ldquo;{renamingProject?.name}&rdquo;</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renameValue && renamingId) {
                rename.mutate({ id: renamingId, name: renameValue })
              }
            }}
            autoFocus
          />
          <Button
            disabled={!renameValue || rename.isPending}
            onClick={() => renamingId && rename.mutate({ id: renamingId, name: renameValue })}
          >
            {rename.isPending ? <Loader2Icon className="size-4 animate-spin" /> : 'Save'}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the project and all its messages. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingId && deleteProject.mutate({ id: deletingId })}
            >
              {deleteProject.isPending ? <Loader2Icon className="size-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
