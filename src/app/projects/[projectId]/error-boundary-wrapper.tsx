"use client";

import { ErrorBoundary } from "react-error-boundary";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { ReactNode } from "react";

function ProjectErrorFallback({ resetErrorBoundary }: { resetErrorBoundary: () => void }) {
  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 max-w-sm text-center px-6">
        <div className="size-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="size-6 text-destructive" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">
            Failed to load your project. This is usually a temporary issue.
          </p>
        </div>
        <button
          onClick={resetErrorBoundary}
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <RefreshCw className="size-3.5" />
          Try again
        </button>
      </div>
    </div>
  );
}

export function ProjectErrorBoundaryWrapper({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary FallbackComponent={ProjectErrorFallback}>
      {children}
    </ErrorBoundary>
  );
}
