'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTRPC } from '@/trpc/client'
import { StarIcon, SendIcon, CheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import Image from 'next/image'

type FeedbackType = 'general' | 'bug' | 'feature'

const TYPES: { value: FeedbackType; label: string; emoji: string; description: string }[] = [
  { value: 'general', label: 'General Feedback', emoji: '💬', description: 'Share thoughts or suggestions' },
  { value: 'bug',     label: 'Bug Report',       emoji: '🐛', description: 'Something is broken or wrong' },
  { value: 'feature', label: 'Feature Request',  emoji: '✨', description: 'Something you want to see' },
]

export default function FeedbackPage() {
  const trpc    = useTRPC()
  const [type,    setType]    = useState<FeedbackType>('general')
  const [rating,  setRating]  = useState<number>(0)
  const [hover,   setHover]   = useState<number>(0)
  const [message, setMessage] = useState('')
  const [done,    setDone]    = useState(false)

  const submit = useMutation(trpc.feedback.submit.mutationOptions({
    onSuccess: () => setDone(true),
  }))

  const handleSubmit = () => {
    if (!message.trim()) return
    submit.mutate({ type, rating: rating || undefined, message: message.trim() })
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center">
          <CheckIcon className="size-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Thank you!</h2>
        <p className="text-muted-foreground max-w-sm">
          Your feedback has been received. We read every submission and use it to improve Isotope.
        </p>
        <Button variant="outline" onClick={() => { setDone(false); setMessage(''); setRating(0) }}>
          Submit another
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto w-full px-4 py-[8vh]">
      <div className="flex flex-col items-center gap-3 mb-10 text-center">
        <Image src="/logo.svg" alt="Isotope" width={40} height={40} className="hidden md:block" />
        <h1 className="text-3xl font-bold">Share your feedback</h1>
        <p className="text-muted-foreground max-w-md">
          Tell us what you love, what's broken, or what you'd like to see next.
          Every message goes directly to the team.
        </p>
      </div>

      <div className="flex flex-col gap-8">

        {/* Type selector */}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">What kind of feedback is this?</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setType(t.value)}
                className={cn(
                  'flex flex-col items-start gap-1.5 p-4 rounded-xl border text-left transition-colors',
                  type === t.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40',
                )}
              >
                <span className="text-2xl">{t.emoji}</span>
                <p className={cn('text-sm font-semibold', type === t.value ? 'text-primary' : '')}>{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Star rating */}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">How would you rate your experience? <span className="text-muted-foreground">(optional)</span></p>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star === rating ? 0 : star)}
                onMouseEnter={() => setHover(star)}
                onMouseLeave={() => setHover(0)}
              >
                <StarIcon
                  className={cn(
                    'size-8 transition-colors',
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
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Your message</p>
          <Textarea
            placeholder={
              type === 'bug'
                ? 'Describe what happened, what you expected, and steps to reproduce…'
                : type === 'feature'
                ? 'Describe the feature and why it would be useful to you…'
                : 'Share whatever is on your mind — we read everything…'
            }
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground text-right">{message.length}/2000</p>
        </div>

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={!message.trim() || submit.isPending}
          className="w-full gap-2"
          size="lg"
        >
          <SendIcon className="size-4" />
          {submit.isPending ? 'Sending…' : 'Send feedback'}
        </Button>
      </div>
    </div>
  )
}
