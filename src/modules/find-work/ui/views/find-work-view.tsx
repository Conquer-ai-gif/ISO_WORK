'use client'

import { useState, useCallback } from 'react'
import { BriefcaseIcon, RefreshCwIcon } from 'lucide-react'
import { useTRPC } from '@/trpc/client'
import { useQuery } from '@tanstack/react-query'
import { keepPreviousData } from '@tanstack/react-query'
import { JobCard } from '../components/job-card'
import { JobFilters } from '../components/job-filters'
import type { JobCategory } from '../../types'
import { useDebounce } from '@/hooks/use-debounce'

function JobCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-lg bg-muted" />
        <div className="space-y-1.5">
          <div className="h-3 w-24 bg-muted rounded" />
          <div className="h-2.5 w-16 bg-muted rounded" />
        </div>
      </div>
      <div className="h-4 w-3/4 bg-muted rounded" />
      <div className="h-3 w-1/2 bg-muted rounded" />
      <div className="flex gap-1.5">
        {[1, 2, 3].map((i) => <div key={i} className="h-5 w-14 bg-muted rounded-md" />)}
      </div>
      <div className="h-8 w-full bg-muted rounded-lg mt-auto" />
    </div>
  )
}

export function FindWorkView() {
  const [search,   setSearch]   = useState('')
  const [category, setCategory] = useState<JobCategory>('all')
  const [page,     setPage]     = useState(1)

  const debouncedSearch = useDebounce(search, 400)
  const trpc = useTRPC()

  const { data, isLoading, isFetching, refetch } = useQuery({
    ...trpc.findWork.getJobs.queryOptions({ category, search: debouncedSearch, page }),
    placeholderData: keepPreviousData,  // v5 correct API — keeps previous data while fetching
  })

  const handleSearch = useCallback((v: string) => {
    setSearch(v)
    setPage(1)
  }, [])

  const handleCategory = useCallback((v: JobCategory) => {
    setCategory(v)
    setPage(1)
  }, [])

  const jobs  = data?.jobs  ?? []
  const total = data?.total ?? 0
  const pages = data?.pages ?? 1

  return (
    <div className="max-w-5xl mx-auto w-full px-4 pt-[8vh] pb-20 space-y-8">

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <BriefcaseIcon className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Find Work</h1>
              <p className="text-sm text-muted-foreground">Remote tech jobs updated daily</p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCwIcon className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <JobFilters
        search={search}
        category={category}
        onSearch={handleSearch}
        onCategory={handleCategory}
        totalJobs={total}
      />

      {/* Job grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => <JobCardSkeleton key={i} />)}
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <BriefcaseIcon className="size-10 text-muted-foreground/40" />
          <p className="font-medium text-sm">No jobs found</p>
          <p className="text-sm text-muted-foreground">
            Try a different search term or category
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={{
                ...job,
                postedAt: job.postedAt instanceof Date
                  ? job.postedAt.toISOString()
                  : String(job.postedAt),
              }}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-xs px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-40 transition-colors"
          >
            Previous
          </button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="text-xs px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-40 transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* Attribution */}
      <p className="text-center text-xs text-muted-foreground">
        Jobs sourced from{' '}
        <a
          href="https://remotive.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground transition-colors"
        >
          Remotive
        </a>
        {' '}— refreshed every 24 hours
      </p>
    </div>
  )
}
