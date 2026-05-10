'use client'

import { SearchIcon } from 'lucide-react'
import { JOB_CATEGORIES, type JobCategory } from '../../types'
import { cn } from '@/lib/utils'

interface JobFiltersProps {
  search:      string
  category:    JobCategory
  onSearch:    (v: string) => void
  onCategory:  (v: JobCategory) => void
  totalJobs:   number
}

export function JobFilters({ search, category, onSearch, onCategory, totalJobs }: JobFiltersProps) {
  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search jobs, companies, or technologies…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-colors"
        />
      </div>

      {/* Category tabs + count */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {JOB_CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => onCategory(cat.value as JobCategory)}
              className={cn(
                'text-xs px-3 py-1.5 rounded-lg border transition-colors',
                category === cat.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border hover:border-primary/30 hover:text-foreground',
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground shrink-0">
          {totalJobs} job{totalJobs !== 1 ? 's' : ''} found
        </p>
      </div>
    </div>
  )
}
