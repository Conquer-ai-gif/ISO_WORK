'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTRPC } from '@/trpc/client'
import { UploadIcon, Loader2Icon, CheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const CATEGORIES = ['Productivity', 'E-commerce', 'Social', 'Dashboard', 'Landing Page', 'Entertainment', 'Tools', 'Other'] as const
const EMOJIS = ['🚀', '📊', '🛒', '💬', '📝', '🎯', '🎨', '⚡', '🔐', '📱', '🌐', '🤖', '💰', '📅', '🎮']

interface Props {
  projectId: string
}

export function PublishTemplateButton({ projectId }: Props) {
  const trpc         = useTRPC()
  const queryClient  = useQueryClient()
  const [open,        setOpen]        = useState(false)
  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [category,    setCategory]    = useState<typeof CATEGORIES[number]>('Tools')
  const [emoji,       setEmoji]       = useState('🚀')
  const [done,        setDone]        = useState(false)

  const publish = useMutation(trpc.marketplace.publish.mutationOptions({
    onSuccess: () => {
      setDone(true)
      toast.success('Template published to the marketplace!')
      setTimeout(() => {
        setOpen(false)
        setDone(false)
        setTitle('')
        setDescription('')
      }, 2000)
    },
    onError: (e) => toast.error(e.message),
  }))

  const handleSubmit = () => {
    if (!title.trim() || !description.trim()) return
    publish.mutate({ projectId, title: title.trim(), description: description.trim(), category, emoji })
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 text-xs h-8"
        onClick={() => setOpen(true)}
      >
        <UploadIcon className="size-3.5" />
        Publish template
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Publish to marketplace</DialogTitle>
          </DialogHeader>

          {done ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckIcon className="size-6 text-primary" />
              </div>
              <p className="text-sm font-medium">Published successfully!</p>
              <p className="text-xs text-muted-foreground text-center">
                Your template is now live in the community marketplace.
              </p>
            </div>
          ) : (
            <div className="space-y-4 pt-2">

              {/* Emoji picker */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Pick an emoji</p>
                <div className="flex flex-wrap gap-1.5">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => setEmoji(e)}
                      className={cn(
                        'size-8 rounded-lg text-base flex items-center justify-center transition-colors',
                        emoji === e ? 'bg-primary/10 ring-1 ring-primary' : 'bg-muted hover:bg-muted/70',
                      )}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Title</p>
                <Input
                  placeholder="e.g. E-commerce Store with Cart"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={60}
                />
                <p className="text-xs text-muted-foreground text-right">{title.length}/60</p>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Description</p>
                <Textarea
                  placeholder="What does this app do? What makes it useful?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={200}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground text-right">{description.length}/200</p>
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Category</p>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                        category === cat
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/70',
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit */}
              <Button
                onClick={handleSubmit}
                disabled={!title.trim() || !description.trim() || publish.isPending}
                className="w-full gap-2"
              >
                {publish.isPending
                  ? <><Loader2Icon className="size-4 animate-spin" /> Publishing...</>
                  : <><UploadIcon className="size-4" /> Publish to marketplace</>
                }
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                Your project's latest generated code will be shared publicly.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
