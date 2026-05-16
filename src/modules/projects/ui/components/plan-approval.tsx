'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTRPC } from '@/trpc/client'
import {
  CheckIcon, XIcon, FileIcon, PlusIcon, EditIcon,
  PackageIcon, ClockIcon, Loader2Icon,
  AlertTriangleIcon, ListChecksIcon, Trash2Icon, PencilIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useState } from 'react'

// ── Types matching the merged TASK_GRAPH_PLAN_PROMPT JSON schema ──────────────
// filesToCreate and filesToModify are DERIVED from tasks[].files at render time
// — they are no longer separate fields in the AI output

interface TaskEntry {
  id: string
  type: 'ui' | 'backend' | 'db' | 'integration'
  description: string
  files: string[]
  dependsOn: string[]
  priority: number
}

interface PlanData {
  summary: string
  approach?: string
  complexity?: 'simple' | 'medium' | 'complex'
  estimatedTime?: string
  agentPlan?: 'ui_only' | 'backend_only' | 'both'
  riskFlags?: string[]
  deferredTasks?: string[]
  tasks: TaskEntry[]
  // Legacy fields — still accepted if present for backwards compatibility
  filesToCreate?: { path: string; description: string; agent?: string }[]
  filesToModify?: { path: string; description: string; agent?: string }[]
  dependencies?: string[]
}

/** Derive file lists from tasks when legacy fields are absent */
function deriveFiles(plan: PlanData) {
  // Use legacy fields if present (backwards compat)
  if (plan.filesToCreate || plan.filesToModify) {
    return {
      filesToCreate: plan.filesToCreate ?? [],
      filesToModify: plan.filesToModify ?? [],
      dependencies:  plan.dependencies ?? [],
    }
  }

  // Derive from tasks — treat all task files as "to create or modify"
  // We show them grouped by task type instead
  return {
    filesToCreate: plan.tasks.flatMap((t) =>
      t.files.map((f) => ({ path: f, description: t.description, agent: t.type }))
    ),
    filesToModify: [] as { path: string; description: string; agent?: string }[],
    dependencies:  [] as string[],
  }
}

const COMPLEXITY_STYLES = {
  simple:  'bg-green-500/10 text-green-400 border-green-500/20',
  medium:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  complex: 'bg-red-500/10 text-red-400 border-red-500/20',
}

const AGENT_STYLES: Record<string, string> = {
  ui:      'text-blue-400',
  backend: 'text-purple-400',
  both:    'text-teal-400',
}

interface Props {
  messageId: string
  planJson: string
  onApproved: () => void
  onRejected: () => void
}

export function PlanApproval({ messageId, planJson, onApproved, onRejected }: Props) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [editedTasks, setEditedTasks] = useState<TaskEntry[]>([])

  let plan: PlanData | null = null
  try { plan = JSON.parse(planJson) } catch { return null }
  if (!plan) return null

  const { filesToCreate, filesToModify, dependencies } = deriveFiles(plan)

  const complexity = plan.complexity ?? (
    plan.tasks.length <= 2 ? 'simple' :
    plan.tasks.length <= 5 ? 'medium' : 'complex'
  )

  const approve = useMutation(trpc.messages.approvePlan.mutationOptions({
    onSuccess: () => { toast.success('Plan approved — generating your app...'); onApproved() },
    onError: (e) => toast.error(e.message),
  }))

  const reject = useMutation(trpc.messages.rejectPlan.mutationOptions({
    onSuccess: () => { toast.info('Plan rejected — your credit has been refunded'); onRejected() },
    onError: (e) => toast.error(e.message),
  }))

  const resubmit = useMutation(trpc.messages.resubmitPlan.mutationOptions({
    onSuccess: () => { toast.success('Modified plan approved — generating...'); onApproved() },
    onError: (e) => toast.error(e.message),
  }))

  const isPending = approve.isPending || reject.isPending || resubmit.isPending

  const handleStartEdit = () => {
    setEditedTasks(plan!.tasks.map((t) => ({ ...t })))
    setIsEditing(true)
  }

  const handleTaskDescChange = (id: string, desc: string) => {
    setEditedTasks((prev) => prev.map((t) => t.id === id ? { ...t, description: desc } : t))
  }

  const handleDeleteTask = (id: string) => {
    setEditedTasks((prev) => prev.filter((t) => t.id !== id))
  }

  const TASK_TYPE_STYLES: Record<string, string> = {
    ui:          'bg-blue-500/10 text-blue-400 border-blue-500/20',
    backend:     'bg-purple-500/10 text-purple-400 border-purple-500/20',
    db:          'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    integration: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    search:      'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  }

  // ── Edit mode ─────────────────────────────────────────────────────────────
  if (isEditing) {
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4 max-w-2xl">
        <div className="flex items-center gap-2">
          <PencilIcon className="size-4 text-primary" />
          <p className="text-sm font-semibold">Edit plan</p>
          <p className="text-xs text-muted-foreground ml-1">— modify or remove tasks, then re-approve</p>
        </div>

        <div className="space-y-2">
          {editedTasks.map((task, i) => (
            <div key={task.id} className="flex items-start gap-2.5 rounded-lg border bg-card p-3">
              <span className={cn('px-1.5 py-0.5 rounded border font-medium text-[10px] flex-shrink-0 mt-1', TASK_TYPE_STYLES[task.type] ?? 'bg-muted text-muted-foreground')}>
                {task.type}
              </span>
              <textarea
                className="flex-1 text-xs bg-transparent outline-none resize-none text-foreground leading-relaxed min-h-[40px]"
                value={task.description}
                onChange={(e) => handleTaskDescChange(task.id, e.target.value)}
                rows={2}
              />
              <button
                className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0 mt-0.5"
                onClick={() => handleDeleteTask(task.id)}
                disabled={editedTasks.length === 1}
                title="Remove task"
              >
                <Trash2Icon className="size-3.5" />
              </button>
            </div>
          ))}
        </div>

        {editedTasks.length === 0 && (
          <p className="text-xs text-destructive text-center">At least one task is required</p>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            disabled={editedTasks.length === 0 || isPending}
            onClick={() => resubmit.mutate({ messageId, tasks: editedTasks })}
            className="gap-1.5"
          >
            {resubmit.isPending
              ? <Loader2Icon className="size-3.5 animate-spin" />
              : <CheckIcon className="size-3.5" />
            }
            Approve edited plan
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsEditing(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4 max-w-2xl">

      {/* ── Header ── */}
      <div className="flex items-start gap-3">
        <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <FileIcon className="size-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Here's my plan</p>
          <p className="text-sm text-muted-foreground mt-0.5">{plan.summary}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {plan.agentPlan && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border capitalize">
              {plan.agentPlan === 'ui_only' ? 'UI' : plan.agentPlan === 'backend_only' ? 'Backend' : 'Full Stack'}
            </span>
          )}
          <div className={cn('text-xs font-medium px-2 py-1 rounded-full border capitalize', COMPLEXITY_STYLES[complexity])}>
            {complexity}
          </div>
        </div>
      </div>

      {/* ── Approach ── */}
      {plan.approach && (
        <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-primary/20 pl-3">
          {plan.approach}
        </p>
      )}

      {/* ── Risk Flags ── */}
      {plan.riskFlags && plan.riskFlags.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangleIcon className="size-3.5" /> Risk flags
          </p>
          {plan.riskFlags.map((flag, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-amber-300/80">
              <span className="mt-0.5 flex-shrink-0">⚠</span>
              <span>{flag}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Task list (new — derived from tasks[]) ── */}
      {plan.tasks && plan.tasks.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <ListChecksIcon className="size-3.5" /> {plan.tasks.length} task{plan.tasks.length !== 1 ? 's' : ''}
          </p>
          <div className="space-y-1.5">
            {[...plan.tasks].sort((a, b) => a.priority - b.priority).map((task) => (
              <div key={task.id} className="flex items-start gap-2.5 text-xs">
                <span className={cn('px-1.5 py-0.5 rounded border font-medium text-[10px] flex-shrink-0 mt-0.5', TASK_TYPE_STYLES[task.type] ?? 'bg-muted text-muted-foreground')}>
                  {task.type}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-muted-foreground leading-relaxed">{task.description}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {task.files.map((f) => (
                      <span key={f} className="font-mono text-[10px] text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">
                        {f.split('/').pop()}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Files (legacy / derived fallback) ── */}
      {!plan.tasks?.length && (
        <>
          {filesToCreate.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Files to create</p>
              {filesToCreate.map((f) => (
                <div key={f.path} className="flex items-start gap-2 text-xs">
                  <PlusIcon className="size-3.5 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="font-mono text-green-400">{f.path}</span>
                  {f.agent && <span className={cn('text-xs', AGENT_STYLES[f.agent] ?? 'text-muted-foreground')}>[{f.agent}]</span>}
                  <span className="text-muted-foreground">— {f.description}</span>
                </div>
              ))}
            </div>
          )}
          {filesToModify.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Files to modify</p>
              {filesToModify.map((f) => (
                <div key={f.path} className="flex items-start gap-2 text-xs">
                  <EditIcon className="size-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <span className="font-mono text-amber-400">{f.path}</span>
                  {f.agent && <span className={cn('text-xs', AGENT_STYLES[f.agent] ?? 'text-muted-foreground')}>[{f.agent}]</span>}
                  <span className="text-muted-foreground">— {f.description}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Dependencies ── */}
      {dependencies.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">New dependencies</p>
          <div className="flex flex-wrap gap-1.5">
            {dependencies.map((dep) => (
              <span key={dep} className="flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                <PackageIcon className="size-3" />{dep}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Estimated time ── */}
      {plan.estimatedTime && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ClockIcon className="size-3.5" />
          Estimated: {plan.estimatedTime}
        </div>
      )}

      {/* ── Deferred Tasks ── */}
      {plan.deferredTasks && plan.deferredTasks.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <ListChecksIcon className="size-3.5" /> Suggested next steps
          </p>
          <div className="flex flex-wrap gap-1.5">
            {plan.deferredTasks.map((task, i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary">
                {task}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={() => approve.mutate({ messageId })} disabled={isPending} className="gap-1.5">
          {approve.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <CheckIcon className="size-3.5" />}
          Approve & Build
        </Button>
        <Button size="sm" variant="outline" onClick={handleStartEdit} disabled={isPending} className="gap-1.5">
          <PencilIcon className="size-3.5" />
          Edit plan
        </Button>
        <Button size="sm" variant="ghost" onClick={() => reject.mutate({ messageId })} disabled={isPending} className="gap-1.5 text-muted-foreground hover:text-destructive">
          {reject.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <XIcon className="size-3.5" />}
          Reject
        </Button>
      </div>
    </div>
  )
}
