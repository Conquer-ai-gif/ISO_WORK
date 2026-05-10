'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircleIcon, RefreshCcwIcon } from 'lucide-react'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Report to Sentry automatically
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4 text-center">
      <div className="size-12 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertCircleIcon className="size-6 text-destructive" />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          An unexpected error occurred. The team has been notified automatically.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">Error ID: {error.digest}</p>
        )}
      </div>
      <Button onClick={reset} variant="outline" className="gap-2">
        <RefreshCcwIcon className="size-4" />
        Try again
      </Button>
    </div>
  )
}
