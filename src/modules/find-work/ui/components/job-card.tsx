import { ExternalLinkIcon, MapPinIcon, BriefcaseIcon } from 'lucide-react'
import Image from 'next/image'
import type { Job } from '../../types'

interface JobCardProps {
  job: Job
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7)  return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function formatJobType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function JobCard({ job }: JobCardProps) {
  return (
    <div className="group rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-sm transition-all duration-200 p-5 flex flex-col gap-4">

      {/* Header — logo + company + posted */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {job.companyLogo ? (
            <div className="size-9 rounded-lg border border-border overflow-hidden bg-muted shrink-0">
              <Image
                src={job.companyLogo}
                alt={job.company}
                width={36}
                height={36}
                className="object-contain w-full h-full"
                unoptimized
              />
            </div>
          ) : (
            <div className="size-9 rounded-lg border border-border bg-muted flex items-center justify-center shrink-0">
              <BriefcaseIcon className="size-4 text-muted-foreground" />
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">{job.company}</p>
            <p className="text-xs text-muted-foreground/60">{timeAgo(job.postedAt)}</p>
          </div>
        </div>

        {/* Job type badge */}
        <span className="text-xs px-2 py-0.5 rounded-full border border-border bg-muted/50 text-muted-foreground whitespace-nowrap shrink-0">
          {formatJobType(job.jobType)}
        </span>
      </div>

      {/* Title */}
      <h3 className="font-semibold text-sm leading-snug group-hover:text-primary transition-colors">
        {job.title}
      </h3>

      {/* Location + salary */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {job.location && (
          <span className="flex items-center gap-1">
            <MapPinIcon className="size-3" />
            {job.location}
          </span>
        )}
        {job.salaryRange && (
          <span className="text-green-600 dark:text-green-400 font-medium">
            {job.salaryRange}
          </span>
        )}
      </div>

      {/* Tags */}
      {job.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {job.tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 rounded-md bg-primary/8 text-primary border border-primary/15"
            >
              {tag}
            </span>
          ))}
          {job.tags.length > 5 && (
            <span className="text-xs px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
              +{job.tags.length - 5}
            </span>
          )}
        </div>
      )}

      {/* CTA */}
      <a
        href={job.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-auto flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        View Job
        <ExternalLinkIcon className="size-3" />
      </a>
    </div>
  )
}
