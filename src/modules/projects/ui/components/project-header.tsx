'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useTheme } from 'next-themes'
import { useSuspenseQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ChevronDownIcon, ChevronLeftIcon, SunMoonIcon,
  Trash2Icon, PencilIcon, Share2Icon, GlobeIcon, LockIcon,
  RocketIcon, Loader2Icon, CheckIcon, CopyIcon, ExternalLinkIcon,
  XCircleIcon, BadgeIcon, KeyIcon,
} from 'lucide-react'

import { useTRPC } from '@/trpc/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuPortal, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Fragment as PrismaFragment } from '@/generated/prisma/client'
import { useAuth } from '@clerk/nextjs'
import { CustomDomainButton } from '@/components/custom-domain'
import { PublishTemplateButton } from '@/components/publish-template-button'
import { GitHubPushButton } from '@/components/github-push-button'

interface Props {
  projectId: string;
  activeFragment?: PrismaFragment | null;
}

export const ProjectHeader = ({ projectId, activeFragment }: Props) => {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const router = useRouter()
  const { setTheme, theme } = useTheme()

  const { has } = useAuth()
  const hasProAccess = has?.({ plan: 'pro' })

  const { data: project } = useSuspenseQuery(trpc.projects.getOne.queryOptions({ id: projectId }))

  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [newName, setNewName] = useState(project.name)
  const [copied, setCopied] = useState(false)

  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${projectId}`

  const invalidate = () => {
    queryClient.invalidateQueries(trpc.projects.getOne.queryOptions({ id: projectId }))
    queryClient.invalidateQueries(trpc.projects.getMany.queryOptions())
  }

  const rename = useMutation(trpc.projects.rename.mutationOptions({
    onSuccess: () => { invalidate(); toast.success('Renamed'); setRenameOpen(false) },
    onError: (e) => toast.error(e.message),
  }))

  const deleteProject = useMutation(trpc.projects.delete.mutationOptions({
    onSuccess: () => { toast.success('Project deleted'); router.push('/') },
    onError: (e) => toast.error(e.message),
  }))

  const toggleBadge = useMutation(trpc.projects.toggleBadge.mutationOptions({
    onSuccess: () => { invalidate(); toast.success(project.hideBadge ? 'Badge shown' : 'Badge hidden') },
    onError: (e) => toast.error(e.message),
  }))

  const setPublic = useMutation(trpc.projects.setPublic.mutationOptions({
    onSuccess: (data) => { invalidate(); toast.success(data.isPublic ? 'Project is now public' : 'Project is now private') },
    onError: (e) => toast.error(e.message),
  }))

  // Link Vercel — creates Vercel project connected to the GitHub repo
  const linkVercel = useMutation(trpc.projects.linkVercel.mutationOptions({
    onSuccess: (data) => {
      invalidate()
      toast.success('Connected to Vercel!', {
        action: data?.vercelDeployUrl
          ? { label: 'View live', onClick: () => window.open(data.vercelDeployUrl!, '_blank') }
          : undefined,
      })
    },
    onError: (e) => toast.error(e.message),
  }))

  const unlinkVercel = useMutation(trpc.projects.unlinkVercel.mutationOptions({
    onSuccess: () => { invalidate(); toast.success('Vercel unlinked') },
    onError: (e) => toast.error(e.message),
  }))

  const copyShareUrl = () => {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const hasVercel = !!project.vercelProjectId
  const hasGitHub = !!(project.repoOwner && project.repoName)

  return (
    <>
      <header className="p-2 flex justify-between items-center border-b gap-2">
        {/* Left: project name dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm"
              className="focus-visible:ring-0 hover:bg-transparent hover:opacity-75 pl-2! max-w-[180px]">
              <Image src="/logo.svg" alt="Isotope" width={18} height={18} />
              <span className="text-sm font-medium truncate">{project.name}</span>
              <ChevronDownIcon className="flex-shrink-0" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent side="bottom" align="start">
            <DropdownMenuItem asChild>
              <Link href="/"><ChevronLeftIcon /><span>Dashboard</span></Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={() => { setNewName(project.name); setRenameOpen(true) }}>
              <PencilIcon /><span>Rename</span>
            </DropdownMenuItem>

            <DropdownMenuItem onClick={() => setShareOpen(true)}>
              <Share2Icon /><span>Share</span>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <Link href={`/projects/${projectId}/integrations`}>
                <KeyIcon /><span>Integrations</span>
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem onClick={() => setPublic.mutate({ id: projectId, isPublic: !project.isPublic })}>
              {project.isPublic
                ? <><LockIcon /><span>Make private</span></>
                : <><GlobeIcon /><span>Make public</span></>
              }
            </DropdownMenuItem>

            {hasProAccess && (
              <DropdownMenuItem onClick={() => toggleBadge.mutate({ projectId, hide: !project.hideBadge })}>
                <BadgeIcon />
                <span>{project.hideBadge ? 'Show Isotope badge' : 'Hide Isotope badge'}</span>
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2">
                <SunMoonIcon className="size-4 text-muted-foreground" />
                <span>Appearance</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                    <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>

            <DropdownMenuSeparator />

            <DropdownMenuItem className="text-destructive focus:text-destructive"
              onClick={() => setDeleteOpen(true)}>
              <Trash2Icon /><span>Delete project</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Right: GitHub + Vercel deploy status */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {project.isPublic && (
            <span className="hidden sm:flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <GlobeIcon className="size-3" /> Public
            </span>
          )}

          {/* Push to GitHub — always in the header, not buried per-message */}
          <GitHubPushButton
            projectId={projectId}
            activeFragment={activeFragment ?? null}
            repoOwner={project.repoOwner}
            repoName={project.repoName}
          />

          {hasVercel ? (
            // Vercel is linked — show live URL + unlink option
            <div className="flex items-center gap-1">
              {project.vercelDeployUrl && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 max-w-[140px]"
                  onClick={() => window.open(project.vercelDeployUrl!, '_blank')}>
                  <span className="size-1.5 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="truncate">Live</span>
                  <ExternalLinkIcon className="size-3 flex-shrink-0" />
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground"
                title="Unlink Vercel" onClick={() => unlinkVercel.mutate({ projectId })}>
                {unlinkVercel.isPending
                  ? <Loader2Icon className="size-3 animate-spin" />
                  : <XCircleIcon className="size-3.5" />
                }
              </Button>
            </div>
          ) : hasGitHub ? (
            // GitHub is bound but Vercel not linked yet — show Connect Vercel button
            <Button size="sm" variant="outline" className="h-7 text-xs"
              disabled={linkVercel.isPending}
              onClick={() => linkVercel.mutate({ projectId })}>
              {linkVercel.isPending
                ? <><Loader2Icon className="size-3 animate-spin" /> Connecting...</>
                : <><RocketIcon className="size-3" /> Connect Vercel</>
              }
            </Button>
          ) : null}

          {/* Custom domain — only shown when Vercel is linked */}
          {hasVercel && (
            <CustomDomainButton
              projectId={projectId}
              vercelProjectId={project.vercelProjectId}
              currentDomain={project.customDomain}
            />
          )}

          {/* Publish to marketplace — available to all users with generated code */}
          {activeFragment && (
            <PublishTemplateButton projectId={projectId} />
          )}
        </div>
      </header>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename project</DialogTitle></DialogHeader>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && newName && rename.mutate({ id: projectId, name: newName })} />
          <Button disabled={!newName || rename.isPending}
            onClick={() => rename.mutate({ id: projectId, name: newName })}>
            {rename.isPending ? <Loader2Icon className="size-4 animate-spin" /> : 'Save'}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Share dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Share project</DialogTitle></DialogHeader>
          {!project.isPublic ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Make this project public to share a preview with anyone — no sign-in required.
              </p>
              <Button onClick={() => setPublic.mutate({ id: projectId, isPublic: true })}>
                <GlobeIcon /> Make public &amp; get link
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Anyone with this link can view your project.
              </p>
              <div className="flex gap-2">
                <Input value={shareUrl} readOnly className="font-mono text-xs" />
                <Button size="sm" variant="outline" onClick={copyShareUrl}>
                  {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                </Button>
              </div>
              <Button variant="outline" className="w-full"
                onClick={() => window.open(shareUrl, '_blank')}>
                Open preview
              </Button>
              {project.vercelDeployUrl && (
                <Button variant="outline" className="w-full"
                  onClick={() => window.open(project.vercelDeployUrl!, '_blank')}>
                  <RocketIcon className="size-4" /> Open live deployment
                </Button>
              )}
              <Button variant="ghost" className="w-full text-xs text-muted-foreground"
                onClick={() => setPublic.mutate({ id: projectId, isPublic: false })}>
                <LockIcon className="size-3" /> Make private
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{project.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the project, all messages, and the linked Vercel deployment. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteProject.mutate({ id: projectId })}>
              {deleteProject.isPending ? <Loader2Icon className="size-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
