'use client'

import { DocsCallout } from '@/components/docs/docs-callout'
import { DocsSteps } from '@/components/docs/docs-steps'
import {
  KanbanIcon, CircleIcon, PlayCircleIcon, EyeIcon,
  CheckCircle2Icon, ArrowUpIcon, ArrowRightIcon, ArrowDownIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const COLUMNS = [
  { icon: CircleIcon,       label: 'To Do',       colour: 'text-muted-foreground', bg: 'bg-muted/30',           desc: 'Tasks not yet started. Add anything here that needs doing.' },
  { icon: PlayCircleIcon,   label: 'In Progress',  colour: 'text-blue-500',        bg: 'bg-blue-500/10',        desc: 'Work actively being done right now.' },
  { icon: EyeIcon,          label: 'In Review',    colour: 'text-amber-500',       bg: 'bg-amber-500/10',       desc: 'Done but waiting for a review or check before marking complete.' },
  { icon: CheckCircle2Icon, label: 'Done',         colour: 'text-green-500',       bg: 'bg-green-500/10',       desc: 'Completed tasks. Cards stay here for reference.' },
]

const PRIORITIES = [
  { icon: ArrowUpIcon,    label: 'High',   colour: 'text-red-500',   desc: 'Critical — blocks other work or is time-sensitive.' },
  { icon: ArrowRightIcon, label: 'Medium', colour: 'text-amber-500', desc: 'Standard priority — the default for new tasks.' },
  { icon: ArrowDownIcon,  label: 'Low',    colour: 'text-blue-400',  desc: 'Nice to have — do when higher-priority work is done.' },
]

export default function TaskBoardPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <KanbanIcon className="size-5 text-primary" />
          <h1 className="text-2xl font-bold">Task Board</h1>
        </div>
        <p className="text-muted-foreground">
          A built-in Kanban board for every project — track what needs building, what's in progress, and what's done.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Overview</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Every project has a Task Board accessible via the <strong>Tasks tab</strong> (the kanban icon) in the project view.
          It gives you four columns to track work across your team or solo — without leaving Isotope.
          Tasks are project-scoped, so workspace members all see and can edit the same board.
        </p>
        <DocsCallout type="info">
          The Task Board requires the <code>changelog-taskboard</code> database migration.
          Run <code>npx prisma migrate dev --name changelog-taskboard</code> before using it.
        </DocsCallout>
      </div>

      {/* Columns */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">The four columns</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {COLUMNS.map(col => (
            <div key={col.label} className={cn('rounded-xl border p-4 space-y-2', col.bg)}>
              <div className="flex items-center gap-2">
                <col.icon className={cn('size-4', col.colour)} />
                <p className={cn('text-sm font-semibold', col.colour)}>{col.label}</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{col.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Priorities */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Priority levels</h2>
        <div className="space-y-2">
          {PRIORITIES.map(p => (
            <div key={p.label} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
              <p.icon className={cn('size-4 flex-shrink-0', p.colour)} />
              <span className={cn('text-sm font-semibold w-16', p.colour)}>{p.label}</span>
              <span className="text-sm text-muted-foreground">{p.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* How to use */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">How to use the board</h2>
        <DocsSteps steps={[
          { title: 'Open a project and click the Tasks tab', description: 'The kanban icon sits next to Preview and Code in the project toolbar. Click it to open the board.' },
          { title: 'Add a task', description: 'Click "+ Add task" at the bottom of any column. Enter a title and choose a priority — Low, Medium, or High. Press Enter or click Add Task to save.' },
          { title: 'Move a task between columns', description: 'Hover a card to reveal the ⋯ menu. Click it and choose "Move to [column name]" to move the task.' },
          { title: 'Delete a task', description: 'Open the card\'s ⋯ menu and choose Delete. The card is permanently removed.' },
          { title: 'Collaborate with your team', description: 'All workspace members can view and edit the same board. Changes appear immediately for everyone — no refresh needed.' },
        ]} />
      </div>

      <DocsCallout type="tip">
        Use the Task Board to track what you're prompting Isotope to build. Add a task for each feature, move it to "In Progress" when you submit the prompt, and "Done" when the generation looks good.
      </DocsCallout>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Workspace access</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Task Board access follows workspace permissions. <strong>Owners</strong> and <strong>Editors</strong> can create, move, and delete tasks.
          <strong> Viewers</strong> can see the board but cannot make changes. Personal projects (not in a workspace) are only visible to the project owner.
        </p>
      </div>
    </div>
  )
}
