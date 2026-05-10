'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTRPC } from '@/trpc/client'
import { MessageSquareIcon, XIcon, StarIcon, SendIcon, CheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type FeedbackType = 'general' | 'bug' | 'feature'

const TYPES: { value: FeedbackType; label: string; emoji: string }[] = [
  { value: 'general', label: 'General',  emoji: '💬' },
  { value: 'bug',     label: 'Bug',      emoji: '🐛' },
  { value: 'feature', label: 'Feature',  emoji: '✨' },
]

export function FeedbackWidget() {
  const trpc    = useTRPC()
  const [open,    setOpen]    = useState(false)
  const [type,    setType]    = useState<FeedbackType>('general')
  const [rating,  setRating]  = useState<number>(0)
  const [hover,   setHover]   = useState<number>(0)
  const [message, setMessage] = useState('')
  const [done,    setDone]    = useState(false)

  const submit = useMutation(trpc.feedback.submit.mutationOptions({
    onSuccess: () => {
      setDone(true)
      setTimeout(() => {
        setOpen(false)
        setDone(false)
        setType('general')
        setRating(0)
        setMessage('')
      }, 2000)
    },
  }))

  const handleSubmit = () => {
    if (!message.trim()) return
    submit.mutate({
      type,
      rating: rating || undefined,
      message: message.trim(),
    })
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">

      {/* Popover panel */}
      {open && (
        <div className="w-80 rounded-xl border bg-card shadow-xl overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
            <p className="text-sm font-semibold">Share your feedback</p>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <XIcon className="size-4" />
            </button>
          </div>

          {done ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10">
              <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckIcon className="size-5 text-primary" />
              </div>
              <p className="text-sm font-medium">Thanks for your feedback!</p>
            </div>
          ) : (
            <div className="p-4 flex flex-col gap-4">

              {/* Type selector */}
              <div className="flex gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setType(t.value)}
                    className={cn(
                      'flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-colors',
                      type === t.value
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50',
                    )}
                  >
                    <span className="text-base">{t.emoji}</span>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Star rating */}
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground">
                  How would you rate your experience?
                </p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHover(star)}
                      onMouseLeave={() => setHover(0)}
                    >
                      <StarIcon
                        className={cn(
                          'size-6 transition-colors',
                          (hover || rating) >= star
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-muted-foreground',
                        )}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Message */}
              <Textarea
                placeholder={
                  type === 'bug'
                    ? 'Describe what happened and how to reproduce it…'
                    : type === 'feature'
                    ? 'Describe the feature you would like to see…'
                    : "What's on your mind?"
                }
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="resize-none text-sm"
              />

              {/* Submit */}
              <Button
                onClick={handleSubmit}
                disabled={!message.trim() || submit.isPending}
                className="w-full gap-2"
                size="sm"
              >
                <SendIcon className="size-3.5" />
                {submit.isPending ? 'Sending…' : 'Send feedback'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'size-12 rounded-full shadow-lg flex items-center justify-center transition-colors',
          open
            ? 'bg-muted text-muted-foreground'
            : 'bg-primary text-primary-foreground hover:bg-primary/90',
        )}
        aria-label="Give feedback"
      >
        {open
          ? <XIcon className="size-5" />
          : <MessageSquareIcon className="size-5" />
        }
      </button>
    </div>
  )
}
