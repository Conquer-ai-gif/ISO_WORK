'use client'

import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { useRef, useState, useEffect } from 'react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import TextareaAutosize from 'react-textarea-autosize'
import { ArrowUpIcon, Loader2Icon, ImageIcon, XIcon, MousePointerClickIcon, SparklesIcon, MessageCircleIcon } from 'lucide-react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'

import { cn } from '@/lib/utils'
import { useTRPC } from '@/trpc/client'
import { Button } from '@/components/ui/button'
import { Form, FormField } from '@/components/ui/form'
import { Usage } from './usage'
import { useRouter } from 'next/navigation'
import { Hint } from '@/components/hint'

interface Props {
  projectId: string
  elementContext?: string | null
  onElementContextUsed?: () => void
  suggestionPrompt?: string | null
  onSuggestionUsed?: () => void
}

const formSchema = z.object({
  value: z.string().min(1).max(10000),
})

type Mode = 'build' | 'ask'

// Detect if a message in Ask mode likely wants code generation
const BUILD_INTENT_PATTERNS = [
  /^(build|create|make|add|generate|write|implement|code|develop|design|setup|set up|scaffold)/i,
  /^(can you (build|create|make|add|generate|write|implement))/i,
]

function looksLikeBuildRequest(text: string): boolean {
  const trimmed = text.trim()
  return BUILD_INTENT_PATTERNS.some((p) => p.test(trimmed))
}

export const MessageForm = ({ projectId, elementContext, onElementContextUsed, suggestionPrompt, onSuggestionUsed }: Props) => {
  const trpc = useTRPC()
  const router = useRouter()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isFocused, setIsFocused] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [mode, setMode] = useState<Mode>('build')
  const [showBuildSuggestion, setShowBuildSuggestion] = useState(false)

  const { data: usage } = useQuery(trpc.usage.status.queryOptions())

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { value: '' },
  })

  // Focus textarea when element context arrives
  useEffect(() => {
    if (elementContext) {
      document.querySelector('textarea')?.focus()
    }
  }, [elementContext])

  // Auto-fill textarea when a suggestion chip is clicked
  useEffect(() => {
    if (suggestionPrompt) {
      form.setValue('value', suggestionPrompt, { shouldValidate: true, shouldDirty: true })
      setMode('build')
      document.querySelector('textarea')?.focus()
      onSuggestionUsed?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestionPrompt])

  // ── Build mode: full agent run, consumes a credit ─────────────────────────
  const createMessage = useMutation(
    trpc.messages.create.mutationOptions({
      onSuccess: () => {
        form.reset()
        setImagePreview(null)
        setImageUrl(null)
        queryClient.invalidateQueries(trpc.messages.getMany.queryOptions({ projectId }))
        queryClient.invalidateQueries(trpc.usage.status.queryOptions())
      },
      onError: (error) => {
        // Check if error is due to insufficient credits
        if (error?.message?.includes('run out of credits') || error?.data?.code === 'TOO_MANY_REQUESTS') {
          router.push('/pricing')
        } else {
          toast.error(error.message)
        }
      },
    }),
  )

  // ── Ask mode: free chat, no credit consumed ───────────────────────────────
  const askMessage = useMutation(
    trpc.messages.ask.mutationOptions({
      onSuccess: () => {
        form.reset()
        queryClient.invalidateQueries(trpc.messages.getMany.queryOptions({ projectId }))
      },
      onError: (e) => toast.error(e.message),
    }),
  )

  const handleImageSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Only images are supported'); return }
    if (file.size > 4 * 1024 * 1024) { toast.error('Image must be under 4MB'); return }

    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)

    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Upload failed')
      const data = await res.json()
      setImageUrl(data.url)
    } catch {
      toast.error('Image upload failed')
      setImagePreview(null)
    } finally {
      setUploadingImage(false)
    }
  }

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    const fullValue = elementContext
      ? `[Editing element: ${elementContext}]\n${values.value}`
      : values.value

    if (mode === 'ask') {
      await askMessage.mutateAsync({ value: fullValue, projectId })
    } else {
      await createMessage.mutateAsync({
        value: fullValue,
        projectId,
        imageUrl: imageUrl ?? undefined,
      })
      onElementContextUsed?.()
    }
  }

  const isPending = createMessage.isPending || askMessage.isPending || uploadingImage
  const isButtonDisabled = isPending || !form.formState.isValid
  const showUsage = !!usage && mode === 'build'

  return (
    <Form {...form}>
      {showUsage && (
        <Usage points={usage.remainingPoints} msBeforeNext={usage.msBeforeNext} plan={usage.plan} />
      )}

      {/* Image preview */}
      {imagePreview && (
        <div className={cn(
          'flex items-center gap-2 px-4 pt-3 pb-1 border border-b-0 rounded-t-xl bg-sidebar',
          showUsage && 'rounded-t-none',
        )}>
          <div className="relative inline-block">
            <img src={imagePreview} alt="Attached" className="h-16 w-16 object-cover rounded-md border" />
            {uploadingImage && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-md">
                <Loader2Icon className="size-4 text-white animate-spin" />
              </div>
            )}
            <button
              type="button"
              className="absolute -top-1.5 -right-1.5 size-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
              onClick={() => { setImagePreview(null); setImageUrl(null) }}
            >
              <XIcon className="size-2.5" />
            </button>
          </div>
          <span className="text-xs text-muted-foreground">Image attached</span>
        </div>
      )}

      {/* Element context banner */}
      {elementContext && (
        <div className={cn(
          'flex items-center gap-2 px-4 pt-3 pb-1 border border-b-0 bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200',
          !imagePreview && (showUsage ? 'rounded-t-none' : 'rounded-t-xl'),
        )}>
          <MousePointerClickIcon className="size-3.5 flex-shrink-0" />
          <span className="text-xs truncate">Selected: {elementContext}</span>
          <button type="button" className="ml-auto" onClick={onElementContextUsed}>
            <XIcon className="size-3" />
          </button>
        </div>
      )}

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn(
          'relative border p-4 rounded-xl bg-sidebar transition-all',
          isFocused && 'shadow-xs',
          showUsage && 'rounded-t-none',
          (imagePreview || elementContext) && 'rounded-t-none',
        )}
      >
        {/* Mode toggle — Build vs Ask */}
        <div className="flex items-center gap-1 mb-3">
          <button
            type="button"
            onClick={() => { setMode('build'); setShowBuildSuggestion(false) }}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
              mode === 'build'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            <SparklesIcon className="size-3" />
            Build
          </button>
          <button
            type="button"
            onClick={() => { setMode('ask'); setShowBuildSuggestion(false) }}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
              mode === 'ask'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            <MessageCircleIcon className="size-3" />
            Ask
            <span className="text-[10px] opacity-70 ml-0.5">free</span>
          </button>
        </div>

        <FormField
          control={form.control}
          name="value"
          render={({ field }) => (
            <TextareaAutosize
              {...field}
              disabled={isPending}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              minRows={2}
              maxRows={8}
              className="pt-1 resize-none border-none w-full outline-none bg-transparent text-sm"
              placeholder={
                elementContext
                  ? 'Describe what to change about the selected element...'
                  : mode === 'ask'
                    ? 'Ask a question about your code...'
                    : 'Describe a change or new feature...'
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  form.handleSubmit(onSubmit)(e)
                }
              }}
            />
          )}
        />

        {/* Build suggestion banner — shown in Ask mode when intent detected */}
        {mode === 'ask' && showBuildSuggestion && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            <SparklesIcon className="size-3.5 flex-shrink-0" />
            <span>Looks like you want to build something.</span>
            <button
              type="button"
              className="ml-auto font-medium underline underline-offset-2 whitespace-nowrap"
              onClick={() => { setMode('build'); setShowBuildSuggestion(false) }}
            >
              Switch to Build
            </button>
          </div>
        )}

        <div className="flex gap-x-2 items-end justify-between pt-2">
          <div className="flex items-center gap-1">
            {/* Image attach (build mode only) */}
            {mode === 'build' && (
              <Hint text="Attach image" side="top">
                <Button
                  type="button" size="sm" variant="ghost"
                  className="size-7 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isPending}
                >
                  <ImageIcon className="size-4" />
                </Button>
              </Hint>
            )}
            <input
              ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleImageSelect(file)
                e.target.value = ''
              }}
            />

            <span className="text-[10px] text-muted-foreground font-mono hidden sm:block">
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                ⌘ Enter
              </kbd>
              {' '}to send
            </span>
          </div>

          <Button
            disabled={isButtonDisabled}
            className={cn(
              'size-8 rounded-full',
              isButtonDisabled && 'bg-muted-foreground border',
              mode === 'ask' && !isButtonDisabled && 'bg-blue-600 hover:bg-blue-700',
            )}
          >
            {isPending
              ? <Loader2Icon className="animate-spin" />
              : <ArrowUpIcon />
            }
          </Button>
        </div>
      </form>
    </Form>
  )
}
