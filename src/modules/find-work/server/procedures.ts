import { prisma } from '@/lib/db'
import { protectedProcedure, createTRPCRouter } from '@/trpc/init'
import { z } from 'zod'
import * as Sentry from '@sentry/nextjs'
import { REMOTIVE_CATEGORY_MAP } from '../types'

const REMOTIVE_BASE  = 'https://remotive.com/api/remote-jobs'
const CACHE_TTL_MS   = 24 * 60 * 60 * 1000  // 24 hours
const CATEGORIES_TO_FETCH = Object.keys(REMOTIVE_CATEGORY_MAP)

// ── Fetch fresh jobs from Remotive and store in DB ────────────────────────────
async function refreshJobCache(): Promise<void> {
  try {
    const fetched: {
      id: number
      title: string
      company_name: string
      company_logo: string | null
      url: string
      category: string
      tags: string[]
      salary: string
      job_type: string
      candidate_required_location: string
      publication_date: string
    }[] = []

    // Fetch each category separately — Remotive supports ?category= filter
    await Promise.allSettled(
      CATEGORIES_TO_FETCH.map(async (cat) => {
        const res = await fetch(`${REMOTIVE_BASE}?category=${cat}&limit=20`, {
          headers: { 'Accept': 'application/json' },
        })
        if (!res.ok) return
        const data = await res.json()
        fetched.push(...(data.jobs ?? []))
      }),
    )

    if (fetched.length === 0) return

    // Upsert all jobs — remoteId is unique so no duplicates
    await Promise.allSettled(
      fetched.map((job) =>
        prisma.jobCache.upsert({
          where:  { remoteId: String(job.id) },
          update: {
            title:       job.title,
            company:     job.company_name,
            companyLogo: job.company_logo ?? null,
            url:         job.url,
            category:    REMOTIVE_CATEGORY_MAP[job.category] ?? 'fullstack',
            tags:        job.tags ?? [],
            salaryRange: job.salary || null,
            jobType:     job.job_type ?? 'full_time',
            location:    job.candidate_required_location || null,
            postedAt:    new Date(job.publication_date),
            cachedAt:    new Date(),
          },
          create: {
            remoteId:    String(job.id),
            title:       job.title,
            company:     job.company_name,
            companyLogo: job.company_logo ?? null,
            url:         job.url,
            category:    REMOTIVE_CATEGORY_MAP[job.category] ?? 'fullstack',
            tags:        job.tags ?? [],
            salaryRange: job.salary || null,
            jobType:     job.job_type ?? 'full_time',
            location:    job.candidate_required_location || null,
            postedAt:    new Date(job.publication_date),
          },
        }),
      ),
    )
  } catch (err) {
    Sentry.captureException(err, { extra: { context: 'refreshJobCache' } })
    console.error('[find-work] Job cache refresh failed:', err)
  }
}

// ── Check if cache is stale ───────────────────────────────────────────────────
async function isCacheStale(): Promise<boolean> {
  const latest = await prisma.jobCache.findFirst({
    orderBy: { cachedAt: 'desc' },
    select:  { cachedAt: true },
  })
  if (!latest) return true
  return Date.now() - latest.cachedAt.getTime() > CACHE_TTL_MS
}

// ── tRPC router ───────────────────────────────────────────────────────────────
export const findWorkRouter = createTRPCRouter({

  getJobs: protectedProcedure
    .input(z.object({
      category: z.string().default('all'),
      search:   z.string().default(''),
      page:     z.number().min(1).default(1),
    }))
    .query(async ({ input }) => {
      const { category, search, page } = input
      const PAGE_SIZE = 12

      // Cold start (empty DB) — await the refresh so first visit returns real jobs
      // Stale cache — fire in background so page doesn't block
      const stale = await isCacheStale()
      const empty = (await prisma.jobCache.count()) === 0
      if (empty) {
        await refreshJobCache()   // block — must populate before query below
      } else if (stale) {
        refreshJobCache().catch(() => null)  // non-blocking refresh
      }

      const where = {
        ...(category !== 'all' ? { category } : {}),
        ...(search ? {
          OR: [
            { title:   { contains: search, mode: 'insensitive' as const } },
            { company: { contains: search, mode: 'insensitive' as const } },
            { tags:    { has: search } },
          ],
        } : {}),
      }

      const [jobs, total] = await Promise.all([
        prisma.jobCache.findMany({
          where,
          orderBy: { postedAt: 'desc' },
          skip:    (page - 1) * PAGE_SIZE,
          take:    PAGE_SIZE,
        }),
        prisma.jobCache.count({ where }),
      ])

      return {
        jobs,
        total,
        pages: Math.ceil(total / PAGE_SIZE),
        page,
      }
    }),
})
