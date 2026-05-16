'use client'

import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { useState, useRef } from 'react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import TextareaAutosize from 'react-textarea-autosize'
import {
  ArrowUpIcon, Loader2Icon, PlusIcon, ImageIcon,
  FigmaIcon, GitBranchIcon, LayoutTemplateIcon, LinkIcon, XIcon,
} from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { cn } from '@/lib/utils'
import { useTRPC } from '@/trpc/client'
import { Button } from '@/components/ui/button'
import { Form, FormField } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useRouter } from 'next/navigation'
import { PROJECT_TEMPLATES } from '../../constants'
import { useClerk } from '@clerk/nextjs'
import { useGhostTypewriter } from '@/hooks/use-ghost-typewriter'

const formSchema = z.object({
  value: z.string().min(1).max(10000),
})

export const ProjectForm = () => {
  const trpc = useTRPC()
  const router = useRouter()
  const queryClient = useQueryClient()
  const clerk = useClerk()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isFocused, setIsFocused] = useState(false)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { value: '' },
  })

  const createProject = useMutation(trpc.projects.create.mutationOptions({
    onSuccess: (data) => {
      queryClient.invalidateQueries(trpc.projects.getMany.queryOptions())
      queryClient.invalidateQueries(trpc.usage.status.queryOptions())
      router.push(`/projects/${data.id}`)
    },
    onError: (error) => {
      if (error?.message?.includes('run out of credits') || error?.data?.code === 'TOO_MANY_REQUESTS') {
        router.push('/pricing')
      } else {
        toast.error(error.message)
      }
    },
  }))

  const isPending = createProject.isPending || uploadingImage
  const isButtonDisabled = isPending || !form.formState.isValid

  const watchedValue = form.watch('value')
  const hasUserInput = watchedValue.length > 0

  // Ghost typewriter — active only when input is empty AND not focused AND not loading
  const ghostActive = !isFocused && !hasUserInput && !isPending
  const { ghostText, showCursor, interrupt, resume } = useGhostTypewriter(ghostActive)

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    await createProject.mutateAsync({
      value: values.value,
      imageUrl: imageUrl ?? undefined,
    })
  }

  const onSelect = (value: string) => {
    form.setValue('value', value, { shouldDirty: true, shouldValidate: true, shouldTouch: true })
    setPopoverOpen(false)
    setShowTemplates(false)
  }

  const handleImageSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Only images are supported'); return }
    if (file.size > 4 * 1024 * 1024) { toast.error('Image must be under 4MB'); return }

    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)

    setUploadingImage(true)
    setPopoverOpen(false)
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

  const handleAddUrl = () => {
    if (!urlInput.trim()) return
    const current = form.getValues('value')
    const appended = current
      ? `${current}\n\nReference URL: ${urlInput.trim()}`
      : `Reference URL: ${urlInput.trim()}`
    form.setValue('value', appended, { shouldDirty: true, shouldValidate: true })
    setUrlInput('')
    setShowUrlInput(false)
    setPopoverOpen(false)
    toast.success('URL added to your prompt')
  }

  return (
    <Form {...form}>
      <section className="space-y-6">
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className={cn(
            'relative border p-4 rounded-xl bg-sidebar dark:bg-sidebar transition-all',
            isFocused && 'shadow-xs',
          )}
        >
          {/* Image preview */}
          {imagePreview && (
            <div className="flex items-center gap-2 mb-3">
              <div className="relative inline-block">
                <img src={imagePreview} alt="Attached" className="h-14 w-14 object-cover rounded-md border" />
                {uploadingImage && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-md">
                    <Loader2Icon className="size-3.5 text-white animate-spin" />
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

          <FormField
            control={form.control}
            name="value"
            render={({ field }) => (
              <div className="relative pt-1">
                {/* Ghost typewriter overlay — only when input is empty and unfocused */}
                {!hasUserInput && !isFocused && ghostText && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 flex items-start text-sm text-muted-foreground/50 italic select-none leading-relaxed"
                  >
                    <span>{ghostText}</span>
                    <span
                      className="ml-px w-px h-[1.1em] bg-muted-foreground/40 self-center inline-block"
                      style={{ opacity: showCursor ? 1 : 0, transition: 'opacity 0.1s' }}
                    />
                  </div>
                )}

                <TextareaAutosize
                  {...field}
                  disabled={isPending}
                  onFocus={() => {
                    setIsFocused(true)
                    interrupt()
                  }}
                  onBlur={() => {
                    setIsFocused(false)
                    if (!form.getValues('value')) resume()
                  }}
                  minRows={2}
                  maxRows={8}
                  className="resize-none border-none w-full outline-none bg-transparent text-sm relative z-10"
                  placeholder=""
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault()
                      form.handleSubmit(onSubmit)(e)
                    }
                  }}
                />
              </div>
            )}
          />

          <div className="flex gap-x-2 items-end justify-between pt-2">
            {/* + Popover menu */}
            {/* Direct image upload button — visible without opening popover */}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="size-7 p-0 rounded-md text-muted-foreground hover:text-foreground"
              disabled={isPending}
              onClick={() => fileInputRef.current?.click()}
              title="Attach image"
            >
              <ImageIcon className="size-4" />
            </Button>

            <Popover open={popoverOpen} onOpenChange={(o) => { setPopoverOpen(o); if (!o) { setShowUrlInput(false); setShowTemplates(false) } }}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="size-7 p-0 rounded-md text-muted-foreground hover:text-foreground"
                  disabled={isPending}
                >
                  <PlusIcon className="size-4" />
                </Button>
              </PopoverTrigger>

              <PopoverContent align="start" side="top" className="w-56 p-1.5 space-y-0.5">
                {!showUrlInput && !showTemplates ? (
                  <>
                    {/* Attach image */}
                    <button
                      type="button"
                      className="flex items-center gap-2.5 w-full rounded-md px-2.5 py-2 text-sm hover:bg-muted transition-colors text-left"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImageIcon className="size-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <p className="font-medium text-foreground">Attach image</p>
                        <p className="text-xs text-muted-foreground">Screenshot or mockup</p>
                      </div>
                    </button>

                    {/* Add URL context */}
                    <button
                      type="button"
                      className="flex items-center gap-2.5 w-full rounded-md px-2.5 py-2 text-sm hover:bg-muted transition-colors text-left"
                      onClick={() => setShowUrlInput(true)}
                    >
                      <LinkIcon className="size-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <p className="font-medium text-foreground">Add URL context</p>
                        <p className="text-xs text-muted-foreground">Reference a site or doc</p>
                      </div>
                    </button>

                    {/* Use a template */}
                    <button
                      type="button"
                      className="flex items-center gap-2.5 w-full rounded-md px-2.5 py-2 text-sm hover:bg-muted transition-colors text-left"
                      onClick={() => setShowTemplates(true)}
                    >
                      <LayoutTemplateIcon className="size-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <p className="font-medium text-foreground">Use a template</p>
                        <p className="text-xs text-muted-foreground">Start from a preset</p>
                      </div>
                    </button>

                    <div className="border-t my-1" />

                    {/* Import from Figma */}
                    <button
                      type="button"
                      className="flex items-center gap-2.5 w-full rounded-md px-2.5 py-2 text-sm hover:bg-muted transition-colors text-left"
                      onClick={() => {
                        setPopoverOpen(false)
                        // Trigger FigmaImportButton — dispatch a custom event
                        window.dispatchEvent(new CustomEvent('isotope:open-figma'))
                      }}
                    >
                      <FigmaIcon className="size-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <p className="font-medium text-foreground">Import from Figma</p>
                        <p className="text-xs text-muted-foreground">Paste a Figma file URL</p>
                      </div>
                    </button>

                    {/* Import existing repo */}
                    <button
                      type="button"
                      className="flex items-center gap-2.5 w-full rounded-md px-2.5 py-2 text-sm hover:bg-muted transition-colors text-left"
                      onClick={() => {
                        setPopoverOpen(false)
                        window.dispatchEvent(new CustomEvent('isotope:open-import-repo'))
                      }}
                    >
                      <GitBranchIcon className="size-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <p className="font-medium text-foreground">Import existing repo</p>
                        <p className="text-xs text-muted-foreground">Build on your codebase</p>
                      </div>
                    </button>
                  </>
                ) : showUrlInput ? (
                  /* URL input panel */
                  <div className="space-y-2 px-1 py-0.5">
                    <p className="text-xs font-medium text-foreground">Add a reference URL</p>
                    <Input
                      autoFocus
                      placeholder="https://example.com"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
                      className="h-8 text-xs"
                    />
                    <div className="flex gap-1.5">
                      <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleAddUrl} disabled={!urlInput.trim()}>
                        Add to prompt
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowUrlInput(false)}>
                        Back
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Templates panel */
                  <div className="space-y-1">
                    <div className="flex items-center justify-between px-1 py-0.5">
                      <p className="text-xs font-medium text-foreground">Templates</p>
                      <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowTemplates(false)}>Back</button>
                    </div>
                    <div className="max-h-52 overflow-y-auto space-y-0.5">
                      {PROJECT_TEMPLATES.slice(0, 8).map((t) => (
                        <button
                          key={t.title}
                          type="button"
                          className="flex items-center gap-2 w-full rounded-md px-2.5 py-1.5 text-sm hover:bg-muted transition-colors text-left"
                          onClick={() => onSelect(t.prompt)}
                        >
                          <span>{t.emoji}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{t.title}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{t.description}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleImageSelect(file)
                e.target.value = ''
              }}
            />

            <Button
              disabled={isButtonDisabled}
              className={cn(
                'size-8 rounded-full',
                isButtonDisabled && 'bg-muted-foreground border',
              )}
            >
              {isPending
                ? <Loader2Icon className="animate-spin" />
                : <ArrowUpIcon />
              }
            </Button>
          </div>
        </form>

        {/* Template chips */}
        <div className="flex flex-wrap justify-center gap-2 max-w-3xl mx-auto mt-1 hidden md:flex">
          {PROJECT_TEMPLATES.slice(0, 6).map((template) => (
            <button
              key={template.title}
              type="button"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border bg-background hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              onClick={() => onSelect(template.prompt)}
            >
              <span>{template.emoji}</span>
              <span>{template.title}</span>
            </button>
          ))}
          <a
            href="/templates"
            className="inline-flex items-center text-xs px-3 py-1.5 rounded-full border bg-background hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            Browse all →
          </a>
        </div>
      </section>
    </Form>
  )
}
