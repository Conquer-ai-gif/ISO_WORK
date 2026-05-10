'use client'

import { ArrowRightIcon, ArrowLeftIcon, GithubIcon, SparklesIcon, GitMergeIcon } from 'lucide-react'

export function SyncFlowDiagram() {
  return (
    <div className="rounded-xl border border-border bg-card p-6 my-6 space-y-6">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
        GitHub Two-Way Sync
      </p>

      {/* Outbound flow */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-green-400 text-center">Isotope → GitHub (you trigger this)</p>
        <div className="flex items-center justify-center gap-2 flex-wrap text-xs">
          <div className="flex flex-col items-center gap-1">
            <div className="size-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <SparklesIcon className="size-5 text-primary" />
            </div>
            <span className="text-[10px] text-muted-foreground">Generate</span>
          </div>
          <ArrowRightIcon className="size-3.5 text-muted-foreground" />
          <div className="flex flex-col items-center gap-1">
            <div className="size-10 rounded-lg bg-muted border border-border flex items-center justify-center">
              <span className="text-[10px] font-mono text-foreground">Push</span>
            </div>
            <span className="text-[10px] text-muted-foreground">isotope/ branch</span>
          </div>
          <ArrowRightIcon className="size-3.5 text-muted-foreground" />
          <div className="flex flex-col items-center gap-1">
            <div className="size-10 rounded-lg bg-muted border border-border flex items-center justify-center">
              <span className="text-[10px] font-mono text-foreground">PR</span>
            </div>
            <span className="text-[10px] text-muted-foreground">auto-merged</span>
          </div>
          <ArrowRightIcon className="size-3.5 text-muted-foreground" />
          <div className="flex flex-col items-center gap-1">
            <div className="size-10 rounded-lg bg-muted border border-border flex items-center justify-center">
              <GitMergeIcon className="size-5 text-green-400" />
            </div>
            <span className="text-[10px] text-muted-foreground">main</span>
          </div>
          <ArrowRightIcon className="size-3.5 text-muted-foreground" />
          <div className="flex flex-col items-center gap-1">
            <div className="size-10 rounded-lg bg-muted border border-border flex items-center justify-center">
              <GithubIcon className="size-5 text-foreground" />
            </div>
            <span className="text-[10px] text-muted-foreground">GitHub</span>
          </div>
        </div>
      </div>

      <div className="border-t" />

      {/* Inbound flow */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-blue-400 text-center">GitHub → Isotope (automatic)</p>
        <div className="flex items-center justify-center gap-2 flex-wrap text-xs">
          <div className="flex flex-col items-center gap-1">
            <div className="size-10 rounded-lg bg-muted border border-border flex items-center justify-center">
              <GithubIcon className="size-5 text-foreground" />
            </div>
            <span className="text-[10px] text-muted-foreground">Push to main</span>
          </div>
          <ArrowRightIcon className="size-3.5 text-muted-foreground" />
          <div className="flex flex-col items-center gap-1">
            <div className="size-10 rounded-lg bg-muted border border-border flex items-center justify-center">
              <span className="text-[10px] font-mono text-foreground">Hook</span>
            </div>
            <span className="text-[10px] text-muted-foreground">webhook</span>
          </div>
          <ArrowRightIcon className="size-3.5 text-muted-foreground" />
          <div className="flex flex-col items-center gap-1">
            <div className="size-10 rounded-lg bg-muted border border-border flex items-center justify-center">
              <span className="text-[10px] font-mono text-foreground">DB</span>
            </div>
            <span className="text-[10px] text-muted-foreground">Prisma updated</span>
          </div>
          <ArrowLeftIcon className="size-3.5 text-blue-400" />
          <div className="flex flex-col items-center gap-1">
            <div className="size-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <SparklesIcon className="size-5 text-primary" />
            </div>
            <span className="text-[10px] text-muted-foreground">Next build</span>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-3">
          <p className="text-xs font-semibold text-green-400 mb-1">Isotope → GitHub</p>
          <p className="text-xs text-muted-foreground">
            Click "Push to GitHub" on any fragment. Platform creates an <span className="font-mono">isotope/</span> branch, opens a PR, and auto-merges it.
          </p>
        </div>
        <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3">
          <p className="text-xs font-semibold text-blue-400 mb-1">GitHub → Isotope</p>
          <p className="text-xs text-muted-foreground">
            Commits pushed directly to main are detected via webhook and synced into the project automatically.
          </p>
        </div>
      </div>
    </div>
  )
}
