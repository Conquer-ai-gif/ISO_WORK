'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { GitBranchIcon, Loader2Icon, AlertTriangleIcon, CheckCircleIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { useMutation } from '@tanstack/react-query'
import { useTRPC } from '@/trpc/client'

interface AnalysisResult {
  isSupported: boolean
  framework: string
  language: string
  router: string
  styling: string
  database: string
  auth: string
  riskFlags: string[]
  projectId?: string
}

export const ImportRepoButton = () => {
  const router = useRouter()
  const trpc = useTRPC()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)

  // Allow the + menu inside ProjectForm to open this dialog via a custom event
  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('isotope:open-import-repo', handler)
    return () => window.removeEventListener('isotope:open-import-repo', handler)
  }, [])

  const importRepo = useMutation(
    trpc.projects.importRepo.mutationOptions({
      onSuccess: (data) => {
        if (!data.isSupported) {
          setAnalysis(data)
          return
        }
        setAnalysis(data)
      },
      onError: (e) => toast.error(e.message),
    }),
  )

  const confirmImport = useMutation(
    trpc.projects.confirmImport.mutationOptions({
      onSuccess: (data) => {
        toast.success('Repository imported — redirecting...')
        setOpen(false)
        setUrl('')
        setAnalysis(null)
        router.push(`/projects/${data.projectId}`)
      },
      onError: (e) => toast.error(e.message),
    }),
  )

  const isValidUrl = /^https:\/\/github\.com\/[^/]+\/[^/]+/.test(url.trim())

  const handleAnalyse = () => {
    if (!isValidUrl) return
    importRepo.mutate({ repoUrl: url.trim() })
  }

  const handleConfirm = () => {
    if (!analysis?.projectId) return
    confirmImport.mutate({ projectId: analysis.projectId })
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setUrl('')
      setAnalysis(null)
      importRepo.reset()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <GitBranchIcon className="size-4" />
          Import Existing Repo
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import an existing GitHub repository</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Paste a public GitHub repo URL. Isotope will analyse the codebase and let you
            continue building on top of it.
          </p>

          {/* URL input — only shown before analysis */}
          {!analysis && (
            <div className="space-y-1.5">
              <Input
                placeholder="https://github.com/owner/repo"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && isValidUrl && handleAnalyse()}
                className="font-mono text-xs"
              />
              {url && !isValidUrl && (
                <p className="text-xs text-destructive">
                  Must be a valid github.com/owner/repo URL
                </p>
              )}
            </div>
          )}

          {/* Analysis result */}
          {analysis && (
            <div className="space-y-3">
              {analysis.isSupported ? (
                <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
                    <CheckCircleIcon className="size-4" />
                    Repository is compatible
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Framework: <span className="text-foreground font-medium">{analysis.framework}</span></span>
                    <span>Language: <span className="text-foreground font-medium">{analysis.language}</span></span>
                    <span>Router: <span className="text-foreground font-medium">{analysis.router}</span></span>
                    <span>Styling: <span className="text-foreground font-medium">{analysis.styling}</span></span>
                    {analysis.database !== 'none' && (
                      <span>Database: <span className="text-foreground font-medium">{analysis.database}</span></span>
                    )}
                    {analysis.auth !== 'none' && (
                      <span>Auth: <span className="text-foreground font-medium">{analysis.auth}</span></span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-1">
                  <p className="text-sm font-medium text-destructive">Repository not supported</p>
                  <p className="text-xs text-muted-foreground">
                    Isotope currently supports Next.js, React, Vue, and Svelte projects.
                  </p>
                </div>
              )}

              {/* Risk flags */}
              {analysis.riskFlags.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-amber-500 flex items-center gap-1.5">
                    <AlertTriangleIcon className="size-3.5" /> Risk flags
                  </p>
                  {analysis.riskFlags.map((flag, i) => (
                    <p key={i} className="text-xs text-muted-foreground flex gap-1.5">
                      <span className="mt-0.5 flex-shrink-0">⚠</span>
                      {flag}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* How-to hint — shown before analysis */}
          {!analysis && (
            <div className="rounded-lg bg-muted/50 p-3 space-y-1.5 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Requirements:</p>
              <p>• Repository must be public (or you must be authenticated)</p>
              <p>• Supports: Next.js, React, Vue, Svelte</p>
              <p>• Isotope will read files only — nothing is executed during analysis</p>
            </div>
          )}

          {/* Action buttons */}
          {!analysis ? (
            <Button
              className="w-full"
              disabled={!isValidUrl || importRepo.isPending}
              onClick={handleAnalyse}
            >
              {importRepo.isPending
                ? <><Loader2Icon className="size-4 animate-spin" /> Analysing repository...</>
                : <><GitBranchIcon className="size-4" /> Analyse repository</>
              }
            </Button>
          ) : analysis.isSupported ? (
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={confirmImport.isPending}
                onClick={handleConfirm}
              >
                {confirmImport.isPending
                  ? <><Loader2Icon className="size-4 animate-spin" /> Importing...</>
                  : 'Import & start building'
                }
              </Button>
              <Button
                variant="outline"
                onClick={() => { setAnalysis(null); importRepo.reset() }}
                disabled={confirmImport.isPending}
              >
                Back
              </Button>
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => { setAnalysis(null); importRepo.reset() }}>
              Try a different repo
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
