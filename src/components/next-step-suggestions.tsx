'use client'

import { SparklesIcon, ArrowRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  tasks: string[]
  onSelect: (task: string) => void
  className?: string
}

export function NextStepSuggestions({ tasks, onSelect, className }: Props) {
  if (!tasks.length) return null

  return (
    <div className={cn('space-y-2 pt-2', className)}>
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <SparklesIcon className="size-3" /> Suggested next steps
      </p>
      <div className="flex flex-wrap gap-2">
        {tasks.map((task) => (
          <Button
            key={task}
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs border-primary/20 hover:bg-primary/5"
            onClick={() => onSelect(task)}
          >
            {task}
            <ArrowRightIcon className="size-3" />
          </Button>
        ))}
      </div>
    </div>
  )
}
