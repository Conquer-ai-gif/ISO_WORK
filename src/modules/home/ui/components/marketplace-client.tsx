'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useTRPC } from '@/trpc/client'
import { toast } from 'sonner'
import {
  SearchIcon, HeartIcon, RocketIcon, StarIcon,
  Loader2Icon, TrendingUpIcon, ClockIcon, FlameIcon,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { useAuth } from '@clerk/nextjs'
import type { MarketplaceTemplate } from '@prisma/client'

const CATEGORIES = ['All', 'Productivity', 'E-commerce', 'Social', 'Dashboard', 'Landing Page', 'Entertainment', 'Tools', 'Other'] as const

const SORT_OPTIONS = [
  { value: 'popular', label: 'Most used',   icon: FlameIcon },
  { value: 'liked',   label: 'Most liked',  icon: HeartIcon },
  { value: 'recent',  label: 'Recently added', icon: ClockIcon },
  { value: 'trending', label: 'Trending',   icon: TrendingUpIcon },
] as const

export const MarketplaceClient = () => {
  const router = useRouter()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { userId } = useAuth()

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('All')
  const [sortBy, setSortBy] = useState<typeof SORT_OPTIONS[number]['value']>('popular')

  const { data: templates, isLoading } = useQuery(
    trpc.marketplace.getTemplates.queryOptions({
      search: search || undefined,
      category: category === 'All' ? undefined : category,
      sortBy,
    })
  )

  const forkTemplate = useMutation(trpc.marketplace.forkTemplate.mutationOptions({
    onSuccess: (data) => {
      queryClient.invalidateQueries(trpc.projects.getMany.queryOptions())
      router.push(`/projects/${data.id}`)
    },
    onError: (error) => {
      toast.error(error.message)
    },
  }))

  const toggleLike = useMutation(trpc.marketplace.toggleLike.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries(trpc.marketplace.getTemplates.queryOptions())
    },
    onError: (error) => {
      toast.error(error.message)
    },
  }))

  const handleFork = (templateId: string) => {
    forkTemplate.mutate({ templateId })
  }

  const handleToggleLike = (templateId: string) => {
    toggleLike.mutate({ templateId })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Marketplace</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Browse community-built app templates. Fork any template and customize it with AI in seconds.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground size-4" />
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          {SORT_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant={sortBy === option.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSortBy(option.value)}
              className="gap-2"
            >
              <option.icon className="size-4" />
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Categories */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <Button
            key={cat}
            variant={category === cat ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCategory(cat)}
          >
            {cat}
          </Button>
        ))}
      </div>

      {/* Templates Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border rounded-lg p-6 space-y-4 animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-3 bg-muted rounded w-1/2" />
              <div className="h-32 bg-muted rounded" />
              <div className="flex gap-2">
                <div className="h-8 bg-muted rounded flex-1" />
                <div className="h-8 bg-muted rounded w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : templates?.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <div key={template.id} className="border rounded-lg p-6 space-y-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{template.name}</h3>
                  <p className="text-sm text-muted-foreground">{template.description}</p>
                </div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <StarIcon className="size-4 fill-current" />
                  {template.likesCount}
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {template.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 bg-muted text-xs rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <RocketIcon className="size-4" />
                  {template.usageCount} uses
                </div>
                <div className="flex items-center gap-1">
                  <ClockIcon className="size-4" />
                  {formatDistanceToNow(new Date(template.createdAt), { addSuffix: true })}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => handleFork(template.id)}
                  disabled={forkTemplate.isPending}
                  className="flex-1 gap-2"
                >
                  {forkTemplate.isPending ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <RocketIcon className="size-4" />
                  )}
                  Fork
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleToggleLike(template.id)}
                  disabled={toggleLike.isPending}
                  className={cn(
                    template.isLikedByUser && 'text-red-500 border-red-200 hover:bg-red-50'
                  )}
                >
                  <HeartIcon className={cn('size-4', template.isLikedByUser && 'fill-current')} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No templates found matching your criteria.</p>
        </div>
      )}
    </div>
  )
}