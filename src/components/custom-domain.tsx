'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  GlobeIcon, Loader2Icon, CheckCircleIcon,
  XCircleIcon, ClipboardCopyIcon, CheckIcon,
} from 'lucide-react'
import { useTRPC } from '@/trpc/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'

interface Props {
  projectId: string
  vercelProjectId?: string | null
  currentDomain?: string | null
}

export const CustomDomainButton = ({ projectId, vercelProjectId, currentDomain }: Props) => {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [domain, setDomain] = useState('')
  const [copiedRecord, setCopiedRecord] = useState<string | null>(null)

  const hasDomain = !!currentDomain

  // Poll domain verification status when dialog is open and domain is set
  const { data: domainStatus, isLoading: checkingStatus } = useQuery({
    ...trpc.projects.checkDomainStatus.queryOptions({ projectId }),
    enabled: open && hasDomain,
    refetchInterval: open && hasDomain ? 8000 : false,
  })

  const addDomain = useMutation(
    trpc.projects.addCustomDomain.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries(trpc.projects.getOne.queryOptions({ id: projectId }))
        queryClient.invalidateQueries(trpc.projects.checkDomainStatus.queryOptions({ projectId }))
        toast.success('Domain added — configure DNS records below to verify')
        setDomain('')
      },
      onError: (e) => toast.error(e.message),
    }),
  )

  const removeDomain = useMutation(
    trpc.projects.removeCustomDomain.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.projects.getOne.queryOptions({ id: projectId }))
        toast.success('Custom domain removed')
      },
      onError: (e) => toast.error(e.message),
    }),
  )

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedRecord(key)
    setTimeout(() => setCopiedRecord(null), 2000)
  }

  const isVerified = domainStatus?.verified === true

  if (!vercelProjectId) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={hasDomain ? 'border-green-500/50 text-green-700 dark:text-green-400' : ''}
        >
          <GlobeIcon className="size-4" />
          {hasDomain ? currentDomain : 'Custom domain'}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Custom domain</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!hasDomain ? (
            // ── Add domain form ────────────────────────────────────────────
            <>
              <p className="text-sm text-muted-foreground">
                Point your own domain to this deployment. Requires a Vercel-linked project.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="myapp.com or app.myapp.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && domain) addDomain.mutate({ projectId, domain })
                  }}
                  className="font-mono text-sm"
                />
                <Button
                  disabled={!domain || addDomain.isPending}
                  onClick={() => addDomain.mutate({ projectId, domain })}
                >
                  {addDomain.isPending ? <Loader2Icon className="size-4 animate-spin" /> : 'Add'}
                </Button>
              </div>
            </>
          ) : (
            // ── Domain status + DNS records ────────────────────────────────
            <>
              <div className="flex items-center gap-2">
                {checkingStatus ? (
                  <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                ) : isVerified ? (
                  <CheckCircleIcon className="size-4 text-green-500" />
                ) : (
                  <XCircleIcon className="size-4 text-amber-500" />
                )}
                <span className="font-mono text-sm font-medium">{currentDomain}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  isVerified
                    ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                    : 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300'
                }`}>
                  {checkingStatus ? 'Checking...' : isVerified ? 'Verified' : 'Pending'}
                </span>
              </div>

              {!isVerified && domainStatus?.verification && domainStatus.verification.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Add these DNS records to verify
                  </p>
                  {domainStatus.verification.map((record: any, i: number) => (
                    <div key={i} className="rounded-lg border bg-muted/30 p-3 space-y-2 text-xs font-mono">
                      <div className="grid grid-cols-[60px_1fr] gap-1">
                        <span className="text-muted-foreground">Type</span>
                        <span>{record.type}</span>
                        <span className="text-muted-foreground">Name</span>
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="truncate">{record.domain}</span>
                          <button onClick={() => copyToClipboard(record.domain, `name-${i}`)} className="flex-shrink-0">
                            {copiedRecord === `name-${i}` ? <CheckIcon className="size-3 text-green-500" /> : <ClipboardCopyIcon className="size-3 text-muted-foreground" />}
                          </button>
                        </div>
                        <span className="text-muted-foreground">Value</span>
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="truncate">{record.value}</span>
                          <button onClick={() => copyToClipboard(record.value, `val-${i}`)} className="flex-shrink-0">
                            {copiedRecord === `val-${i}` ? <CheckIcon className="size-3 text-green-500" /> : <ClipboardCopyIcon className="size-3 text-muted-foreground" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    DNS changes can take up to 48 hours. This page checks every 8 seconds.
                  </p>
                </div>
              )}

              {isVerified && (
                <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 text-sm text-green-800 dark:text-green-200">
                  Your domain is verified and live at{' '}
                  <a
                    href={`https://${currentDomain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium underline"
                  >
                    https://{currentDomain}
                  </a>
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/30 hover:bg-destructive/10 w-full"
                disabled={removeDomain.isPending}
                onClick={() => removeDomain.mutate({ projectId })}
              >
                {removeDomain.isPending
                  ? <><Loader2Icon className="size-4 animate-spin" /> Removing...</>
                  : <><XCircleIcon className="size-4" /> Remove domain</>
                }
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
