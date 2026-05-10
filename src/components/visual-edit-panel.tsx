'use client'

import { useState, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useTRPC } from '@/trpc/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  PaintbrushIcon, XIcon, WandIcon, Loader2Icon,
  TypeIcon, PaletteIcon, LayoutIcon, MoveIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface VisualEditProps {
  projectId: string
  messageId: string
}

type EditMode = 'color' | 'text' | 'spacing' | 'layout'

const EDIT_MODES: { id: EditMode; label: string; icon: React.ElementType; hint: string }[] = [
  { id: 'color',   label: 'Colors',   icon: PaletteIcon, hint: 'Change backgrounds, text colours, borders' },
  { id: 'text',    label: 'Text',     icon: TypeIcon,    hint: 'Adjust fonts, sizes, weights' },
  { id: 'spacing', label: 'Spacing',  icon: MoveIcon,    hint: 'Tweak padding, margins, gaps' },
  { id: 'layout',  label: 'Layout',   icon: LayoutIcon,  hint: 'Rearrange elements, flex, grid' },
]

export function VisualEditPanel({ projectId, messageId }: VisualEditProps) {
  const trpc = useTRPC()
  const router = useRouter()
  const [open, setOpen]         = useState(false)
  const [mode, setMode]         = useState<EditMode>('color')
  const [instruction, setInstruction] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const sendEdit = useMutation(trpc.messages.create.mutationOptions({
    onSuccess: () => {
      toast.success('Visual edit sent — generating…')
      setInstruction('')
      setOpen(false)
    },
    onError: (e) => {
      if (e?.message?.includes('run out of credits') || e?.data?.code === 'TOO_MANY_REQUESTS') {
        router.push('/pricing')
      } else {
        toast.error(e.message)
      }
    },
  }))

  function handleSubmit() {
    if (!instruction.trim()) return
    const selectedMode = EDIT_MODES.find(m => m.id === mode)!
    const prompt = `[Visual Edit — ${selectedMode.label}] ${instruction.trim()}`
    sendEdit.mutate({ projectId, value: prompt })
  }

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 text-xs"
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50) }}
      >
        <PaintbrushIcon className="size-3" />
        Visual Edit
      </Button>
    )
  }

  return (
    <div className="absolute inset-0 z-10 flex items-end justify-center pb-4 pointer-events-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 pointer-events-auto"
        onClick={() => setOpen(false)}
      />

      {/* Panel */}
      <div className="relative pointer-events-auto w-full max-w-lg mx-4 bg-card border rounded-xl shadow-2xl p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WandIcon className="size-4 text-primary" />
            <span className="text-sm font-semibold">Visual Edit</span>
          </div>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setOpen(false)}>
            <XIcon className="size-3.5" />
          </Button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1">
          {EDIT_MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                mode === m.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <m.icon className="size-3" />
              {m.label}
            </button>
          ))}
        </div>

        {/* Hint */}
        <p className="text-xs text-muted-foreground">
          {EDIT_MODES.find(m => m.id === mode)?.hint}
        </p>

        {/* Quick suggestions */}
        <div className="flex flex-wrap gap-1.5">
          {getQuickSuggestions(mode).map(s => (
            <button
              key={s}
              onClick={() => setInstruction(s)}
              className="px-2 py-1 rounded-md text-xs bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
            >
              {s}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
            placeholder={`Describe the ${mode} change…`}
            className="text-sm h-9"
          />
          <Button
            size="sm"
            className="h-9 px-3"
            disabled={!instruction.trim() || sendEdit.isPending}
            onClick={handleSubmit}
          >
            {sendEdit.isPending
              ? <Loader2Icon className="size-3.5 animate-spin" />
              : <WandIcon className="size-3.5" />
            }
          </Button>
        </div>
      </div>
    </div>
  )
}

function getQuickSuggestions(mode: EditMode): string[] {
  switch (mode) {
    case 'color':
      return [
        'Make background dark / #09090b',
        'Change primary colour to violet',
        'Use lighter text on cards',
        'Add a subtle gradient to hero',
      ]
    case 'text':
      return [
        'Increase heading size',
        'Make body text lighter weight',
        'Use a mono font for code blocks',
        'Reduce line spacing',
      ]
    case 'spacing':
      return [
        'Add more padding to cards',
        'Tighten gap between sections',
        'Make buttons wider',
        'More breathing room in navbar',
      ]
    case 'layout':
      return [
        'Stack cards vertically on mobile',
        'Centre the hero content',
        'Move sidebar to the right',
        'Make 3-column grid 2-column',
      ]
  }
}
