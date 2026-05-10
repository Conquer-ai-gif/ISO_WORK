import { cn } from '@/lib/utils'
import { InfoIcon, AlertTriangleIcon, CheckCircleIcon, LightbulbIcon } from 'lucide-react'

type CalloutType = 'info' | 'warning' | 'tip' | 'success'

const CONFIG: Record<CalloutType, { icon: React.ElementType; classes: string }> = {
  info:    { icon: InfoIcon,          classes: 'border-blue-500/30 bg-blue-500/5 text-blue-400' },
  warning: { icon: AlertTriangleIcon, classes: 'border-amber-500/30 bg-amber-500/5 text-amber-400' },
  tip:     { icon: LightbulbIcon,     classes: 'border-violet-500/30 bg-violet-500/5 text-violet-400' },
  success: { icon: CheckCircleIcon,   classes: 'border-green-500/30 bg-green-500/5 text-green-400' },
}

export function DocsCallout({ type = 'info', children }: { type?: CalloutType; children: React.ReactNode }) {
  const { icon: Icon, classes } = CONFIG[type]
  return (
    <div className={cn('flex gap-3 rounded-lg border p-4 my-4', classes)}>
      <Icon className="size-4 flex-shrink-0 mt-0.5" />
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  )
}
