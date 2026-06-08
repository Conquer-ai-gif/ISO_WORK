'use client'

import { useState, useEffect } from 'react'
import { useGenerationStream } from '@/hooks/use-generation-stream'
import type { ExecutionEventType } from '@/streaming/events'
import Image from 'next/image'
import { ChevronDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  messageId: string | null
  onComplete?: () => void
}

type TaskState = {
  id: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'fixing'
  type?: string
  description?: string
}

const STATUS_LABEL: Record<TaskState['status'], string> = {
  pending: 'waiting',
  running: 'building',
  done:    'done',
  failed:  'failed',
  fixing:  'fixing',
}

const STATUS_COLOR: Record<TaskState['status'], string> = {
  pending: 'bg-muted text-muted-foreground',
  running: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  done:    'bg-green-500/15 text-green-600 dark:text-green-400',
  failed:  'bg-red-500/15 text-red-500',
  fixing:  'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
}

const SHOULD_PULSE: Partial<Record<TaskState['status'], boolean>> = {
  running: true,
  fixing:  true,
}

/** Human-readable label for event types — fallback only, description takes priority */
function eventLabel(type: ExecutionEventType): string | null {
  switch (type) {
    case 'generation_started':   return 'Starting generation…'
    case 'task_started':         return 'Running task…'
    case 'task_completed':       return 'Task complete'
    case 'task_failed':          return 'Task failed — retrying'
    case 'validation_started':   return 'Type-checking…'
    case 'validation_passed':    return 'No type errors'
    case 'validation_failed':    return 'Type errors found'
    case 'fix_started':          return 'Auto-fixing errors…'
    case 'fix_completed':        return 'Errors fixed'
    case 'generation_completed': return 'Generation complete'
    case 'generation_failed':    return 'Generation failed'
    default:                     return null
  }
}

/** Build a terminal-style display string for a task row */
function taskDisplayText(task: TaskState): string {
  if (task.description) return task.description
  if (task.type) return `${task.type} — ${task.id}`
  return task.id
}

export function GenerationProgress({ messageId, onComplete }: Props) {
  const { events, status, latestLog } = useGenerationStream(messageId)
  const [isExpanded, setIsExpanded] = useState(false)
  // Once completed, we freeze the component in place so the log remains
  // accessible above the fragment card
  const [isFrozen, setIsFrozen] = useState(false)

  // Build a deduplicated map of tasks
  const taskMap = new Map<string, TaskState>()

  for (const ev of events) {
    if (!ev.taskId) continue

    const existing = taskMap.get(ev.taskId) ?? {
      id: ev.taskId,
      status: 'pending' as TaskState['status'],
      type: ev.data?.type as string | undefined,
      description: ev.data?.description as string | undefined,
    }

    switch (ev.type) {
      case 'task_started':
        taskMap.set(ev.taskId, {
          ...existing,
          status: 'running',
          type: (ev.data?.type as string) ?? existing.type,
          description: (ev.data?.description as string) ?? existing.description,
        })
        break
      case 'validation_started':
      case 'fix_started':
        taskMap.set(ev.taskId, { ...existing, status: 'fixing' })
        break
      case 'task_completed':
      case 'validation_passed':
      case 'fix_completed':
        taskMap.set(ev.taskId, { ...existing, status: 'done' })
        break
      case 'task_failed':
        taskMap.set(ev.taskId, { ...existing, status: 'failed' })
        break
      default:
        if (!taskMap.has(ev.taskId)) taskMap.set(ev.taskId, existing)
    }
  }

  const tasks = Array.from(taskMap.values())
  const total = tasks.length
  const done  = tasks.filter((t) => t.status === 'done').length
  const progressPct = total > 0 ? Math.round((done / total) * 90) : 10

  // Auto-expand when a task fails or fix starts
  useEffect(() => {
    const shouldAutoExpand = tasks.some((t) => t.status === 'failed' || t.status === 'fixing')
    if (shouldAutoExpand) setIsExpanded(true)
  }, [tasks.map((t) => t.status).join(',')])

  // When generation completes: freeze the component in place and trigger
  // an immediate refetch so the fragment card appears without the 5s wait
  useEffect(() => {
    if (status === 'completed' && !isFrozen) {
      setIsFrozen(true)
      onComplete?.()
    }
  }, [status, isFrozen, onComplete])

  // Status line
  const displayLog = (() => {
    if (status === 'reconnecting') return 'Reconnecting…'
    if (latestLog) return latestLog
    const lastMeaningful = [...events].reverse().find((e) => eventLabel(e.type))
    return lastMeaningful ? eventLabel(lastMeaningful.type)! : 'Starting…'
  })()

  const hasTasks = tasks.length > 0

  return (
    <div className="flex flex-col gap-3 px-4 py-3 w-full max-w-lg">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="shrink-0 size-7 rounded-full bg-foreground flex items-center justify-center">
          <Image src="/logo.svg" alt="Isotope" width={14} height={14} />
        </div>
        <span className="text-sm font-medium text-foreground">Isotope</span>
        {(status === 'streaming' || status === 'reconnecting') && (
          <span className="ml-auto text-xs text-muted-foreground animate-pulse">
            {status === 'reconnecting' ? 'Reconnecting…' : 'Generating…'}
          </span>
        )}
        {/* Frozen completed badge */}
        {isFrozen && (
          <span className="ml-auto text-xs text-green-600 dark:text-green-400">
            Done
          </span>
        )}
      </div>

      {/* Progress bar — 100% when frozen/completed */}
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
          style={{ width: isFrozen || status === 'completed' ? '100%' : `${progressPct}%` }}
        />
      </div>

      {/* Status line — always visible */}
      <div className="flex items-center gap-2">
        {/* Heartbeat dot */}
        <span
          className={cn(
            'shrink-0 size-1.5 rounded-full',
            isFrozen || status === 'completed' ? 'bg-green-500' :
            status === 'failed'               ? 'bg-red-500' :
            status === 'reconnecting'         ? 'bg-yellow-500 animate-pulse' :
            'bg-blue-500 animate-pulse',
          )}
          style={
            status === 'streaming'
              ? { animationDuration: '1.8s', animationTimingFunction: 'ease-in-out' }
              : undefined
          }
        />
        <p className="text-xs text-muted-foreground font-mono flex-1 truncate">
          {'> '}{displayLog}
        </p>

        {/* Toggle — only shown when there are tasks to display */}
        {hasTasks && (
          <button
            onClick={() => setIsExpanded((v) => !v)}
            className="shrink-0 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
          >
            {isExpanded ? 'Hide logs' : 'View logs'}
            <ChevronDownIcon
              className={cn('size-3 transition-transform duration-200', isExpanded && 'rotate-180')}
            />
          </button>
        )}
      </div>

      {/* Collapsible terminal log */}
      {hasTasks && isExpanded && (
        <div className="border border-border rounded-lg bg-muted/40 overflow-hidden">
          <ul className="flex flex-col divide-y divide-border/50">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-start gap-2.5 px-3 py-2"
              >
                {/* Prompt symbol */}
                <span className="shrink-0 text-muted-foreground font-mono text-[11px] mt-0.5 select-none">
                  &gt;
                </span>

                {/* Status badge */}
                <span
                  className={cn(
                    'shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5',
                    STATUS_COLOR[task.status],
                    // Stop pulsing once frozen
                    !isFrozen && SHOULD_PULSE[task.status] && 'animate-pulse',
                  )}
                  style={!isFrozen && SHOULD_PULSE[task.status] ? { animationDuration: '1.8s' } : undefined}
                >
                  {STATUS_LABEL[task.status]}
                </span>

                {/* Task description */}
                <span
                  className={cn(
                    'text-[11px] font-mono leading-relaxed break-all',
                    task.status === 'done'
                      ? 'text-muted-foreground'
                      : task.status === 'failed'
                        ? 'text-red-500 dark:text-red-400'
                        : 'text-foreground',
                  )}
                >
                  {taskDisplayText(task)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}





// 'use client'

// import { useState, useEffect } from 'react'
// import { useGenerationStream } from '@/hooks/use-generation-stream'
// import type { ExecutionEventType } from '@/streaming/events'
// import Image from 'next/image'
// import { ChevronDownIcon } from 'lucide-react'
// import { cn } from '@/lib/utils'

// interface Props {
//   messageId: string | null
// }

// type TaskState = {
//   id: string
//   status: 'pending' | 'running' | 'done' | 'failed' | 'fixing'
//   type?: string
//   description?: string
// }

// const STATUS_LABEL: Record<TaskState['status'], string> = {
//   pending: 'waiting',
//   running: 'building',
//   done:    'done',
//   failed:  'failed',
//   fixing:  'fixing',
// }

// const STATUS_COLOR: Record<TaskState['status'], string> = {
//   pending: 'bg-muted text-muted-foreground',
//   running: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
//   done:    'bg-green-500/15 text-green-600 dark:text-green-400',
//   failed:  'bg-red-500/15 text-red-500',
//   fixing:  'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
// }

// const SHOULD_PULSE: Partial<Record<TaskState['status'], boolean>> = {
//   running: true,
//   fixing:  true,
// }

// /** Human-readable label for event types — fallback only, description takes priority */
// function eventLabel(type: ExecutionEventType): string | null {
//   switch (type) {
//     case 'generation_started':   return 'Starting generation…'
//     case 'task_started':         return 'Running task…'
//     case 'task_completed':       return 'Task complete'
//     case 'task_failed':          return 'Task failed — retrying'
//     case 'validation_started':   return 'Type-checking…'
//     case 'validation_passed':    return 'No type errors'
//     case 'validation_failed':    return 'Type errors found'
//     case 'fix_started':          return 'Auto-fixing errors…'
//     case 'fix_completed':        return 'Errors fixed'
//     case 'generation_completed': return 'Generation complete'
//     case 'generation_failed':    return 'Generation failed'
//     default:                     return null
//   }
// }

// /** Build a terminal-style display string for a task row */
// function taskDisplayText(task: TaskState): string {
//   if (task.description) return task.description
//   if (task.type) return `${task.type} — ${task.id}`
//   return task.id
// }

// export function GenerationProgress({ messageId }: Props) {
//   const { events, status, latestLog } = useGenerationStream(messageId)
//   const [isExpanded, setIsExpanded] = useState(false)

//   // Build a deduplicated map of tasks — preserve existing taskMap + progressPct logic exactly
//   const taskMap = new Map<string, TaskState>()

//   for (const ev of events) {
//     if (!ev.taskId) continue

//     const existing = taskMap.get(ev.taskId) ?? {
//       id: ev.taskId,
//       status: 'pending' as TaskState['status'],
//       type: ev.data?.type as string | undefined,
//       description: ev.data?.description as string | undefined,
//     }

//     switch (ev.type) {
//       case 'task_started':
//         taskMap.set(ev.taskId, {
//           ...existing,
//           status: 'running',
//           type: (ev.data?.type as string) ?? existing.type,
//           description: (ev.data?.description as string) ?? existing.description,
//         })
//         break
//       case 'validation_started':
//       case 'fix_started':
//         taskMap.set(ev.taskId, { ...existing, status: 'fixing' })
//         break
//       case 'task_completed':
//       case 'validation_passed':
//       case 'fix_completed':
//         taskMap.set(ev.taskId, { ...existing, status: 'done' })
//         break
//       case 'task_failed':
//         taskMap.set(ev.taskId, { ...existing, status: 'failed' })
//         break
//       default:
//         if (!taskMap.has(ev.taskId)) taskMap.set(ev.taskId, existing)
//     }
//   }

//   const tasks = Array.from(taskMap.values())
//   const total = tasks.length
//   const done  = tasks.filter((t) => t.status === 'done').length
//   const progressPct = total > 0 ? Math.round((done / total) * 90) : 10

//   // Auto-expand when a task fails or fix starts — user needs to see recovery
//   useEffect(() => {
//     const shouldAutoExpand = tasks.some((t) => t.status === 'failed' || t.status === 'fixing')
//     if (shouldAutoExpand) setIsExpanded(true)
//   }, [tasks.map((t) => t.status).join(',')])

//   // Status line — priority: latestLog from hook → last meaningful event label → fallback
//   const displayLog = (() => {
//     if (status === 'reconnecting') return 'Reconnecting…'
//     if (latestLog) return latestLog
//     const lastMeaningful = [...events].reverse().find((e) => eventLabel(e.type))
//     return lastMeaningful ? eventLabel(lastMeaningful.type)! : 'Starting…'
//   })()

//   const hasTasks = tasks.length > 0

//   return (
//     <div className="flex flex-col gap-3 px-4 py-3 w-full max-w-lg">
//       {/* Header */}
//       <div className="flex items-center gap-2.5">
//         <div className="shrink-0 size-7 rounded-full bg-foreground flex items-center justify-center">
//           <Image src="/logo.svg" alt="Isotope" width={14} height={14} />
//         </div>
//         <span className="text-sm font-medium text-foreground">Isotope</span>
//         {(status === 'streaming' || status === 'reconnecting') && (
//           <span className="ml-auto text-xs text-muted-foreground animate-pulse">
//             {status === 'reconnecting' ? 'Reconnecting…' : 'Generating…'}
//           </span>
//         )}
//       </div>

//       {/* Progress bar */}
//       <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
//         <div
//           className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
//           style={{ width: status === 'completed' ? '100%' : `${progressPct}%` }}
//         />
//       </div>

//       {/* Status line — always visible */}
//       <div className="flex items-center gap-2">
//         {/* Heartbeat dot */}
//         <span
//           className={cn(
//             'shrink-0 size-1.5 rounded-full',
//             status === 'completed' ? 'bg-green-500' :
//             status === 'failed'    ? 'bg-red-500' :
//             status === 'reconnecting' ? 'bg-yellow-500 animate-pulse' :
//             'bg-blue-500 animate-pulse',
//           )}
//           style={
//             status === 'streaming'
//               ? { animationDuration: '1.8s', animationTimingFunction: 'ease-in-out' }
//               : undefined
//           }
//         />
//         <p className="text-xs text-muted-foreground font-mono flex-1 truncate">
//           {'> '}{displayLog}
//         </p>

//         {/* Toggle — only shown when there are tasks to display */}
//         {hasTasks && (
//           <button
//             onClick={() => setIsExpanded((v) => !v)}
//             className="shrink-0 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
//           >
//             {isExpanded ? 'Hide logs' : 'View logs'}
//             <ChevronDownIcon
//               className={cn('size-3 transition-transform duration-200', isExpanded && 'rotate-180')}
//             />
//           </button>
//         )}
//       </div>

//       {/* Collapsible terminal log */}
//       {hasTasks && isExpanded && (
//         <div className="border border-border rounded-lg bg-muted/40 overflow-hidden">
//           <ul className="flex flex-col divide-y divide-border/50">
//             {tasks.map((task) => (
//               <li
//                 key={task.id}
//                 className="flex items-start gap-2.5 px-3 py-2"
//               >
//                 {/* Prompt symbol */}
//                 <span className="shrink-0 text-muted-foreground font-mono text-[11px] mt-0.5 select-none">
//                   &gt;
//                 </span>

//                 {/* Status badge */}
//                 <span
//                   className={cn(
//                     'shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5',
//                     STATUS_COLOR[task.status],
//                     SHOULD_PULSE[task.status] && 'animate-pulse',
//                   )}
//                   style={SHOULD_PULSE[task.status] ? { animationDuration: '1.8s' } : undefined}
//                 >
//                   {STATUS_LABEL[task.status]}
//                 </span>

//                 {/* Task description */}
//                 <span
//                   className={cn(
//                     'text-[11px] font-mono leading-relaxed break-all',
//                     task.status === 'done'
//                       ? 'text-muted-foreground'
//                       : task.status === 'failed'
//                         ? 'text-red-500 dark:text-red-400'
//                         : 'text-foreground',
//                   )}
//                 >
//                   {taskDisplayText(task)}
//                 </span>
//               </li>
//             ))}
//           </ul>
//         </div>
//       )}
//     </div>
//   )
// }
