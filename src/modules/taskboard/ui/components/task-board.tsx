'use client'

import { useState } from 'react'
import { useSuspenseQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTRPC } from '@/trpc/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  PlusIcon, MoreHorizontalIcon, Loader2Icon,
  CircleIcon, PlayCircleIcon, EyeIcon, CheckCircle2Icon,
  ArrowUpIcon, ArrowRightIcon, ArrowDownIcon, Trash2Icon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────
type TaskStatus   = 'todo' | 'in_progress' | 'in_review' | 'done'
type TaskPriority = 'low' | 'medium' | 'high'

interface Task {
  id:          string
  title:       string
  description: string | null
  status:      TaskStatus
  priority:    TaskPriority
  labels:      string[]
  createdAt:   Date
}

const COLUMNS: { id: TaskStatus; label: string; icon: React.ElementType; colour: string }[] = [
  { id: 'todo',        label: 'To Do',       icon: CircleIcon,      colour: 'text-muted-foreground' },
  { id: 'in_progress', label: 'In Progress', icon: PlayCircleIcon,  colour: 'text-blue-500' },
  { id: 'in_review',   label: 'In Review',   icon: EyeIcon,         colour: 'text-amber-500' },
  { id: 'done',        label: 'Done',        icon: CheckCircle2Icon, colour: 'text-green-500' },
]

const PRIORITY_ICON: Record<TaskPriority, React.ElementType> = {
  high:   ArrowUpIcon,
  medium: ArrowRightIcon,
  low:    ArrowDownIcon,
}
const PRIORITY_COLOUR: Record<TaskPriority, string> = {
  high:   'text-red-500',
  medium: 'text-amber-500',
  low:    'text-blue-400',
}

// ── Task card ─────────────────────────────────────────────────────────────────
function TaskCard({ task, onMove, onDelete }: {
  task:     Task
  onMove:   (id: string, status: TaskStatus) => void
  onDelete: (id: string) => void
}) {
  const PriorityIcon = PRIORITY_ICON[task.priority]

  return (
    <div className="group bg-card border rounded-lg p-3 space-y-2 hover:shadow-md transition-shadow cursor-default">
      <div className="flex items-start gap-2">
        <p className="text-sm flex-1 leading-snug">{task.title}</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost"
              className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 flex-shrink-0">
              <MoreHorizontalIcon className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            {COLUMNS.filter(c => c.id !== task.status).map(col => (
              <DropdownMenuItem key={col.id} onClick={() => onMove(task.id, col.id)}>
                <col.icon className={cn('size-3', col.colour)} />
                Move to {col.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(task.id)}
            >
              <Trash2Icon className="size-3" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {task.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        <PriorityIcon className={cn('size-3', PRIORITY_COLOUR[task.priority])} />
        {task.labels.map(l => (
          <Badge key={l} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{l}</Badge>
        ))}
      </div>
    </div>
  )
}

// ── Add task form ─────────────────────────────────────────────────────────────
function AddTaskDialog({ projectId, defaultStatus, open, onOpenChange }: {
  projectId:     string
  defaultStatus: TaskStatus
  open:          boolean
  onOpenChange:  (v: boolean) => void
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')

  const create = useMutation(trpc.taskBoard.create.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries(trpc.taskBoard.getByProject.queryOptions({ projectId }))
      toast.success('Task created')
      setTitle('')
      onOpenChange(false)
    },
    onError: e => toast.error(e.message),
  }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            autoFocus
            placeholder="Task title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && title && create.mutate({ projectId, title, status: defaultStatus, priority })}
          />

          <div className="flex gap-2">
            {(['low', 'medium', 'high'] as TaskPriority[]).map(p => {
              const Icon = PRIORITY_ICON[p]
              return (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={cn(
                    'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize',
                    priority === p ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
                  )}
                >
                  <Icon className={cn('size-3', PRIORITY_COLOUR[p])} />
                  {p}
                </button>
              )
            })}
          </div>

          <Button
            className="w-full"
            disabled={!title.trim() || create.isPending}
            onClick={() => create.mutate({ projectId, title: title.trim(), status: defaultStatus, priority })}
          >
            {create.isPending ? <Loader2Icon className="size-4 animate-spin" /> : 'Add Task'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Column ────────────────────────────────────────────────────────────────────
function Column({ col, tasks, projectId, onMove, onDelete }: {
  col:       typeof COLUMNS[number]
  tasks:     Task[]
  projectId: string
  onMove:    (id: string, status: TaskStatus) => void
  onDelete:  (id: string) => void
}) {
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="flex flex-col gap-2 min-w-[230px] flex-1">
      {/* Column header */}
      <div className="flex items-center gap-2 px-1 py-1.5">
        <col.icon className={cn('size-4', col.colour)} />
        <span className="text-sm font-medium">{col.label}</span>
        <span className="ml-auto text-xs text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
          {tasks.length}
        </span>
      </div>

      {/* Tasks */}
      <div className="flex flex-col gap-2 flex-1 min-h-[120px] p-1">
        {tasks.map(task => (
          <TaskCard key={task.id} task={task} onMove={onMove} onDelete={onDelete} />
        ))}
      </div>

      {/* Add button */}
      <Button
        size="sm"
        variant="ghost"
        className="w-full text-xs text-muted-foreground justify-start gap-1.5 h-7"
        onClick={() => setAddOpen(true)}
      >
        <PlusIcon className="size-3" /> Add task
      </Button>

      <AddTaskDialog
        projectId={projectId}
        defaultStatus={col.id}
        open={addOpen}
        onOpenChange={setAddOpen}
      />
    </div>
  )
}

// ── Main board ────────────────────────────────────────────────────────────────
export function TaskBoard({ projectId }: { projectId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { data: tasks } = useSuspenseQuery(trpc.taskBoard.getByProject.queryOptions({ projectId }))

  const moveTask = useMutation(trpc.taskBoard.update.mutationOptions({
    onSuccess: () => queryClient.invalidateQueries(trpc.taskBoard.getByProject.queryOptions({ projectId })),
    onError: e => toast.error(e.message),
  }))

  const deleteTask = useMutation(trpc.taskBoard.delete.mutationOptions({
    onSuccess: () => queryClient.invalidateQueries(trpc.taskBoard.getByProject.queryOptions({ projectId })),
    onError: e => toast.error(e.message),
  }))

  const handleMove   = (id: string, status: TaskStatus) => moveTask.mutate({ id, status })
  const handleDelete = (id: string) => deleteTask.mutate({ id })

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 h-full pt-2">
      {COLUMNS.map(col => (
        <Column
          key={col.id}
          col={col}
          tasks={(tasks as Task[]).filter(t => t.status === col.id)}
          projectId={projectId}
          onMove={handleMove}
          onDelete={handleDelete}
        />
      ))}
    </div>
  )
}
