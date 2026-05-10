'use client'

import { useState, useRef, useEffect } from 'react'
import {
  ExternalLinkIcon, RefreshCcwIcon, Loader2Icon,
  MousePointerClickIcon, XIcon, RocketIcon, ServerIcon,
} from 'lucide-react'
import { Fragment as PrismaFragment } from '@/generated/prisma/client'
import { Button } from '@/components/ui/button'
import { Hint } from '@/components/hint'
import { cn } from '@/lib/utils'

interface Props {
  data: PrismaFragment
  onElementSelected?: (description: string) => void
}

type PreviewMode = 'simulation' | 'vercel'

export function FragmentWeb({ data, onElementSelected }: Props) {
  const [fragmentKey, setFragmentKey] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedElement, setSelectedElement] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Use Vercel URL if available — real Next.js app
  // Fall back to DB simulation — instant but limited
  const hasVercelDeploy = !!data.deployUrl
  const [mode, setMode] = useState<PreviewMode>(
    hasVercelDeploy ? 'vercel' : 'simulation'
  )

  // Switch to Vercel mode automatically if deployUrl appears (fragment updated)
  useEffect(() => {
    if (data.deployUrl && mode === 'simulation') {
      setMode('vercel')
    }
  }, [data.deployUrl, mode])

  const previewUrl = mode === 'vercel' && data.deployUrl
    ? data.deployUrl
    : `/api/preview/${data.id}`

  // Visual element selection only works in simulation mode (same-origin iframe)
  const canSelectElements = mode === 'simulation'

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'ELEMENT_SELECTED') {
        const desc = event.data.description as string
        setSelectedElement(desc)
        setSelectMode(false)
        onElementSelected?.(desc)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [onElementSelected])

  useEffect(() => {
    if (!canSelectElements) return
    iframeRef.current?.contentWindow?.postMessage(
      { type: selectMode ? 'ENABLE_SELECT_MODE' : 'DISABLE_SELECT_MODE' },
      '*',
    )
  }, [selectMode, canSelectElements])

  const toggleSelectMode = () => {
    setSelectMode((p) => !p)
    setSelectedElement(null)
  }

  const handleModeSwitch = (newMode: PreviewMode) => {
    setMode(newMode)
    setIsLoading(true)
    setFragmentKey((p) => p + 1)
    setSelectMode(false)
    setSelectedElement(null)
  }

  return (
    <div className="flex flex-col w-full h-full">
      {/* Toolbar */}
      <div className="p-2 border-b bg-sidebar flex items-center gap-x-2">
        <Hint text="Refresh" side="bottom" align="start">
          <Button
            size="sm" variant="outline"
            onClick={() => { setIsLoading(true); setFragmentKey((p) => p + 1) }}
          >
            <RefreshCcwIcon className="size-4" />
          </Button>
        </Hint>

        {/* Mode switcher — only shown when Vercel deploy exists */}
        {hasVercelDeploy && (
          <div className="flex items-center rounded-md border overflow-hidden text-xs">
            <button
              className={cn(
                'px-2.5 py-1.5 transition-colors flex items-center gap-1',
                mode === 'simulation'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              )}
              onClick={() => handleModeSwitch('simulation')}
            >
              <ServerIcon className="size-3" /> Preview
            </button>
            <button
              className={cn(
                'px-2.5 py-1.5 transition-colors flex items-center gap-1',
                mode === 'vercel'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              )}
              onClick={() => handleModeSwitch('vercel')}
            >
              <RocketIcon className="size-3" /> Live
            </button>
          </div>
        )}

        {/* URL bar */}
        <div className="flex-1 flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-background text-sm text-muted-foreground font-mono truncate">
          {isLoading
            ? <Loader2Icon className="size-3 flex-shrink-0 animate-spin" />
            : mode === 'vercel'
              ? <span className="size-1.5 rounded-full bg-green-500 flex-shrink-0" />
              : <ServerIcon className="size-3 flex-shrink-0 text-muted-foreground" />
          }
          <span className="truncate text-xs">{previewUrl}</span>
        </div>

        {/* Element selection — simulation only */}
        {canSelectElements && (
          <Hint text={selectMode ? 'Exit select mode' : 'Click an element to edit it'} side="bottom">
            <Button
              size="sm"
              variant={selectMode ? 'default' : 'outline'}
              className={cn(selectMode && 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600')}
              onClick={toggleSelectMode}
            >
              <MousePointerClickIcon className="size-4" />
            </Button>
          </Hint>
        )}

        <Hint text="Open in new tab" side="bottom" align="end">
          <Button size="sm" variant="outline" onClick={() => window.open(previewUrl, '_blank')}>
            <ExternalLinkIcon className="size-4" />
          </Button>
        </Hint>
      </div>

      {/* Banners */}
      {selectMode && canSelectElements && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-950/30 border-b text-blue-800 dark:text-blue-200 text-xs">
          <MousePointerClickIcon className="size-3.5 flex-shrink-0" />
          Click any element in the preview to select it for editing
          <button onClick={() => setSelectMode(false)} className="ml-auto">
            <XIcon className="size-3" />
          </button>
        </div>
      )}

      {selectedElement && !selectMode && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-950/30 border-b text-green-800 dark:text-green-200 text-xs">
          <MousePointerClickIcon className="size-3.5 flex-shrink-0" />
          Selected: <span className="font-medium truncate">{selectedElement}</span>
          <button onClick={() => setSelectedElement(null)} className="ml-auto flex-shrink-0">
            <XIcon className="size-3" />
          </button>
        </div>
      )}

      {/* Simulation mode info banner */}
      {mode === 'simulation' && hasVercelDeploy && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border-b text-amber-800 dark:text-amber-300 text-xs">
          <ServerIcon className="size-3.5 flex-shrink-0" />
          Showing local preview. Switch to <button
            className="font-medium underline underline-offset-2 mx-0.5"
            onClick={() => handleModeSwitch('vercel')}
          >Live</button> for the real deployed app.
        </div>
      )}

      {/* Deploying state — GitHub bound but no deploy yet */}
      {!hasVercelDeploy && mode === 'simulation' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b text-muted-foreground text-xs">
          <RocketIcon className="size-3.5 flex-shrink-0" />
          Connect GitHub + Vercel to get a real live deployment
        </div>
      )}

      {/* Preview iframe */}
      <div className="relative flex-1">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2Icon className="size-6 animate-spin" />
              <span className="text-sm">
                {mode === 'vercel' ? 'Loading live app...' : 'Loading preview...'}
              </span>
            </div>
          </div>
        )}

        {selectMode && canSelectElements && (
          <div
            className="absolute inset-0 z-20 cursor-crosshair"
            style={{ background: 'transparent' }}
            onClick={() => {
              iframeRef.current?.contentWindow?.postMessage({ type: 'ENABLE_SELECT_MODE' }, '*')
            }}
          />
        )}

        <iframe
          ref={iframeRef}
          key={fragmentKey}
          className="h-full w-full"
          sandbox={mode === 'vercel'
            ? 'allow-forms allow-scripts allow-same-origin allow-modals allow-popups allow-top-navigation'
            : 'allow-forms allow-scripts allow-same-origin allow-modals allow-popups'
          }
          loading="lazy"
          src={previewUrl}
          onLoad={() => {
            setIsLoading(false)
            if (selectMode && canSelectElements) {
              setTimeout(() => {
                iframeRef.current?.contentWindow?.postMessage({ type: 'ENABLE_SELECT_MODE' }, '*')
              }, 100)
            }
          }}
        />
      </div>
    </div>
  )
}
