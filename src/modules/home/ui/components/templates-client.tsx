'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { SearchIcon, ArrowRightIcon, SparklesIcon } from 'lucide-react'
import { useUser } from '@clerk/nextjs'
import { useTRPC } from '@/trpc/client'
import { PROJECT_TEMPLATES, TEMPLATE_CATEGORIES } from '../../constants'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export function TemplatesClient() {
  const router = useRouter()
  const { user } = useUser()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [activeCategory, setActiveCategory] = useState<string>('All')
  const [search, setSearch] = useState('')
  const [loadingTemplate, setLoadingTemplate] = useState<string | null>(null)

  const createProject = useMutation(trpc.projects.create.mutationOptions({
    onSuccess: (data) => {
      queryClient.invalidateQueries(trpc.projects.getMany.queryOptions())
      router.push(`/projects/${data.projectId}`)
    },
    onError: (e) => {
      setLoadingTemplate(null)
      toast.error(e.message)
    },
  }))

  const handleUseTemplate = (template: typeof PROJECT_TEMPLATES[number]) => {
    if (!user) {
      router.push(`/sign-up?prompt=${encodeURIComponent(template.prompt)}`)
      return
    }
    setLoadingTemplate(template.title)
    createProject.mutate({ value: template.prompt })
  }

  const filtered = PROJECT_TEMPLATES.filter((t) => {
    const matchesCategory = activeCategory === 'All' || t.category === activeCategory
    const matchesSearch = !search || t.title.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase())
    return matchesCategory && matchesSearch
  })

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 space-y-8">

      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary">
          <SparklesIcon className="size-3" />
          {PROJECT_TEMPLATES.length} templates
        </div>
        <h1 className="font-display text-4xl font-bold tracking-tight">Start with a template</h1>
        <p className="text-muted-foreground max-w-md mx-auto">
          Pick a template, click use, and Isotope builds it for you — fully customisable.
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-md mx-auto">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-border bg-background outline-none focus:border-primary/50 transition-colors"
        />
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2 justify-center">
        {TEMPLATE_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              'text-sm px-4 py-1.5 rounded-full border transition-all',
              activeCategory === cat
                ? 'bg-primary text-primary-foreground border-transparent'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80 bg-background',
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium">No templates found</p>
          <p className="text-sm mt-1">Try a different search or category</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((template) => (
            <div
              key={template.title}
              className="card-lift group border border-border rounded-2xl overflow-hidden bg-card flex flex-col"
            >
              {/* Preview image */}
              <div className="relative h-44 overflow-hidden bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={template.image}
                  alt={template.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                    target.parentElement!.classList.add('flex', 'items-center', 'justify-center')
                    target.parentElement!.innerHTML = `<span class="text-4xl">${template.emoji}</span>`
                  }}
                />
                {/* Category badge */}
                <div className="absolute top-3 left-3">
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-background/90 backdrop-blur-sm border border-border/50 text-foreground">
                    {template.category}
                  </span>
                </div>
                {/* Overlay on hover */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button
                    onClick={() => handleUseTemplate(template)}
                    disabled={!!loadingTemplate}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 transition-colors"
                  >
                    {loadingTemplate === template.title ? (
                      <span className="size-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    ) : (
                      <SparklesIcon className="size-4" />
                    )}
                    Use template
                  </button>
                </div>
              </div>

              {/* Card body */}
              <div className="flex flex-col flex-1 p-4 gap-3">
                <div className="flex items-start gap-2.5">
                  <span className="text-xl flex-shrink-0">{template.emoji}</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{template.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{template.description}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="w-full gap-1.5 mt-auto"
                  onClick={() => handleUseTemplate(template)}
                  disabled={!!loadingTemplate}
                >
                  {loadingTemplate === template.title ? (
                    <span className="size-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  ) : (
                    <ArrowRightIcon className="size-3.5" />
                  )}
                  {user ? 'Use template' : 'Start building'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom CTA */}
      <div className="text-center pt-4">
        <p className="text-sm text-muted-foreground">
          Don&apos;t see what you need?{' '}
          <Link href="/" className="text-primary hover:underline">
            Describe it from scratch →
          </Link>
        </p>
      </div>
    </div>
  )
}
