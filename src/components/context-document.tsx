'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BookOpenIcon, SaveIcon, Loader2Icon, XIcon } from 'lucide-react'
import { useTRPC } from '@/trpc/client'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'

interface Props {
  projectId: string
  currentContext?: string | null
}

const PLACEHOLDER = `Examples of what to add here:

# Brand
- Primary color: #6366F1
- Font: Inter
- Tone: friendly and professional

# Tech preferences
- Use Zustand for state management
- Prefer server components where possible
- Date formatting: MMM D, YYYY

# Design rules
- Always use the sidebar layout pattern
- Cards should have subtle drop shadows
- Use skeleton loaders, not spinners`

export const ContextDocumentButton = ({ projectId, currentContext }: Props) => {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(currentContext ?? '')

  // Sync if prop changes
  useEffect(() => { setText(currentContext ?? '') }, [currentContext])

  const save = useMutation(
    trpc.projects.saveContext.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.projects.getOne.queryOptions({ id: projectId }))
        toast.success('Context saved — will apply to all future generations')
        setOpen(false)
      },
      onError: (e) => toast.error(e.message),
    }),
  )

  const hasContext = !!(currentContext?.trim())

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={hasContext ? 'border-purple-400/50 text-purple-700 dark:text-purple-400' : ''}
          title={hasContext ? 'Project context set' : 'Add project context'}
        >
          <BookOpenIcon className="size-4" />
          <span className="hidden sm:inline">{hasContext ? 'Context' : 'Add context'}</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Project context</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Describe your brand, tech preferences, and design rules. This is injected into every generation so the AI always follows your guidelines — without you having to repeat them.
          </p>

          <textarea
            className="w-full h-64 resize-none rounded-lg border bg-background p-3 text-sm font-mono outline-none focus:ring-2 focus:ring-ring"
            placeholder={PLACEHOLDER}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={8000}
          />

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{text.length} / 8000</span>
            <div className="flex gap-2">
              {text && (
                <Button
                  size="sm" variant="ghost"
                  onClick={() => setText('')}
                  className="text-muted-foreground"
                >
                  <XIcon className="size-3.5" /> Clear
                </Button>
              )}
              <Button
                size="sm"
                disabled={save.isPending || text === (currentContext ?? '')}
                onClick={() => save.mutate({ projectId, contextDocument: text })}
              >
                {save.isPending
                  ? <><Loader2Icon className="size-3.5 animate-spin" /> Saving...</>
                  : <><SaveIcon className="size-3.5" /> Save</>
                }
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
