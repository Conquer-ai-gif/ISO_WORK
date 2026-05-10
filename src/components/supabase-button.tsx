'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { DatabaseIcon, Loader2Icon, CheckCircleIcon, XCircleIcon } from 'lucide-react'
import { useTRPC } from '@/trpc/client'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Hint } from '@/components/hint'

interface Props {
  projectId: string
  supabaseUrl?: string | null
  supabaseAnonKey?: string | null
}

export const SupabaseButton = ({ projectId, supabaseUrl, supabaseAnonKey }: Props) => {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const isProvisioned = !!supabaseUrl

  const provision = useMutation(
    trpc.projects.provisionSupabase.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.projects.getOne.queryOptions({ id: projectId }))
        toast.success('Supabase database provisioned! Regenerate your app to use it.')
      },
      onError: (e) => toast.error(e.message),
    }),
  )

  const deprovision = useMutation(
    trpc.projects.deprovisionSupabase.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.projects.getOne.queryOptions({ id: projectId }))
        toast.success('Supabase database removed')
        setOpen(false)
      },
      onError: (e) => toast.error(e.message),
    }),
  )

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Hint text={isProvisioned ? 'Supabase connected' : 'Add a real database'} side="bottom">
          <Button
            size="sm"
            variant="outline"
            className={isProvisioned ? 'border-green-500/50 text-green-700 dark:text-green-400' : ''}
          >
            <DatabaseIcon className="size-4" />
            {isProvisioned ? 'Supabase' : 'Add DB'}
          </Button>
        </Hint>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isProvisioned ? 'Supabase database' : 'Add a real database'}
          </DialogTitle>
        </DialogHeader>

        {!isProvisioned ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">What this does:</p>
              <p>✓ Provisions a dedicated Supabase project for this app</p>
              <p>✓ Injects the credentials into every future generation</p>
              <p>✓ The AI will automatically use Supabase for auth, database, and storage</p>
              <p>✓ Your generated app will persist data across sessions</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Takes ~30 seconds to provision. Requires <code className="text-xs bg-muted px-1 py-0.5 rounded">SUPABASE_ACCESS_TOKEN</code> and{' '}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">SUPABASE_ORGANIZATION_ID</code> in your environment.
            </p>
            <Button
              className="w-full"
              disabled={provision.isPending}
              onClick={() => provision.mutate({ projectId })}
            >
              {provision.isPending
                ? <><Loader2Icon className="size-4 animate-spin" /> Provisioning (~30s)...</>
                : <><DatabaseIcon className="size-4" /> Provision Supabase</>
              }
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
              <CheckCircleIcon className="size-4" />
              Connected — credentials are injected into every generation
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Project URL
              </label>
              <div className="flex gap-2">
                <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md truncate">
                  {supabaseUrl}
                </code>
                <Button
                  size="sm" variant="outline" className="flex-shrink-0"
                  onClick={() => copyToClipboard(supabaseUrl!, 'url')}
                >
                  {copied === 'url' ? '✓' : 'Copy'}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Anon key
              </label>
              <div className="flex gap-2">
                <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md truncate">
                  {supabaseAnonKey?.slice(0, 30)}...
                </code>
                <Button
                  size="sm" variant="outline" className="flex-shrink-0"
                  onClick={() => copyToClipboard(supabaseAnonKey!, 'key')}
                >
                  {copied === 'key' ? '✓' : 'Copy'}
                </Button>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
              disabled={deprovision.isPending}
              onClick={() => deprovision.mutate({ projectId })}
            >
              {deprovision.isPending
                ? <><Loader2Icon className="size-4 animate-spin" /> Removing...</>
                : <><XCircleIcon className="size-4" /> Remove database</>
              }
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
