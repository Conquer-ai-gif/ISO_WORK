import { prisma } from '@/lib/db'
import { protectedProcedure, createTRPCRouter } from '@/trpc/init'
import { z } from 'zod'
import { getUsageStatus } from '@/lib/usage'
import { getStripe, CREDIT_PACKAGES } from '@/lib/stripe'
import * as Sentry from '@sentry/nextjs'
import type { PurchaseStatus } from '@/generated/prisma'

/**
 * Returns milliseconds until the next credit reset for the given plan.
 *
 * Free plan  → daily top-up at midnight UTC. We calculate the ms remaining
 *              until the next midnight so the UI shows "Tops up in 6 hours"
 *              instead of the misleading "Tops up in 29 days" from nextReset.
 *
 * Pro/Team   → monthly reset tied to their billing cycle, stored in nextReset.
 *              We return ms until that date so the UI shows "Resets in 23 days".
 */
function getMsBeforeNext(plan: string, nextReset: Date): number {
  const now = Date.now()

  if (plan === 'free') {
    // Calculate ms until next midnight UTC
    const nowDate      = new Date(now)
    const nextMidnight = new Date(
      Date.UTC(
        nowDate.getUTCFullYear(),
        nowDate.getUTCMonth(),
        nowDate.getUTCDate() + 1, // tomorrow
        0, 0, 0, 0,               // at 00:00:00.000 UTC
      ),
    )
    return Math.max(0, nextMidnight.getTime() - now)
  }

  // Pro/Team — use the stored nextReset date from billing cycle
  return Math.max(0, nextReset.getTime() - now)
}

export const usageRouter = createTRPCRouter({

  status: protectedProcedure.query(async ({ ctx }) => {
    const status = await getUsageStatus(ctx.auth.userId)
    return {
      remainingPoints: status.balance,
      plan:            status.plan,
      nextReset:       status.nextReset,
      // FIX: msBeforeNext is now computed per plan.
      // Free users see time until next midnight (daily top-up).
      // Pro/Team users see time until their monthly billing reset.
      msBeforeNext:    getMsBeforeNext(status.plan, status.nextReset),
    }
  }),

  // ── Credit packages available for purchase ──────────────────────────────────
  getCreditPackages: protectedProcedure.query(() => {
    return CREDIT_PACKAGES
  }),

  // ── Create Stripe Checkout session for credit top-up ───────────────────────
  createCheckoutSession: protectedProcedure
    .input(z.object({ packageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.auth.userId
      const pkg    = CREDIT_PACKAGES.find((p) => p.id === input.packageId)
      if (!pkg) throw new Error('Invalid package')

      const stripe  = getStripe()
      const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

      const session = await stripe.checkout.sessions.create({
        mode:                'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            quantity:   1,
            price_data: {
              currency:     'usd',
              unit_amount:  pkg.amountCents,
              product_data: {
                name:        `${pkg.credits} Isotope Credits`,
                description: `Add ${pkg.credits} credits to your account. Credits never expire.`,
                images:      [],
              },
            },
          },
        ],
        metadata: {
          userId,
          packageId:  pkg.id,
          credits:    String(pkg.credits),
          units:      String(pkg.units),
        },
        success_url: `${appUrl}/usage?purchase=success&credits=${pkg.credits}`,
        cancel_url:  `${appUrl}/usage?purchase=cancelled`,
      })

      // Record the pending purchase
      await prisma.creditPurchase.create({
        data: {
          userId,
          stripeSessionId: session.id,
          credits:         pkg.credits,
          units:           pkg.units,
          amountCents:     pkg.amountCents,
          status:          'pending' as PurchaseStatus,
        },
      })

      return { url: session.url }
    }),

  // ── Purchase history ────────────────────────────────────────────────────────
  getPurchaseHistory: protectedProcedure.query(async ({ ctx }) => {
    return prisma.creditPurchase.findMany({
      where:   { userId: ctx.auth.userId, status: 'completed' as PurchaseStatus },
      orderBy: { createdAt: 'desc' },
      take:    10,
      select: {
        id:          true,
        credits:     true,
        amountCents: true,
        createdAt:   true,
      },
    })
  }),

  // ── Analytics ───────────────────────────────────────────────────────────────
  analytics: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.auth.userId
    const now = new Date()
    const startOf30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const startOf7Days  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000)

    const [
      totalProjects,
      projects30Days,
      allFragments,
      fragments7Days,
      topProjects,
      dailyActivity,
    ] = await Promise.all([
      prisma.project.count({ where: { userId } }),
      prisma.project.count({ where: { userId, createdAt: { gte: startOf30Days } } }),
      prisma.fragment.count({ where: { message: { project: { userId } } } }),
      prisma.fragment.count({
        where: { message: { project: { userId } }, createdAt: { gte: startOf7Days } },
      }),
      prisma.project.findMany({
        where:   { userId },
        orderBy: { messages: { _count: 'desc' } },
        take:    5,
        select: {
          id: true, name: true, createdAt: true, updatedAt: true,
          isPublic: true, vercelDeployUrl: true,
          _count: { select: { messages: true } },
        },
      }),
      prisma.fragment.findMany({
        where:  { message: { project: { userId } }, createdAt: { gte: startOf30Days } },
        select: { createdAt: true },
      }),
    ])

    const buckets: Record<string, number> = {}
    for (let i = 0; i < 30; i++) {
      const d   = new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000)
      const key = d.toISOString().split('T')[0]
      buckets[key] = 0
    }
    for (const f of dailyActivity) {
      const key = f.createdAt.toISOString().split('T')[0]
      if (buckets[key] !== undefined) buckets[key]++
    }

    const activityData   = Object.entries(buckets).map(([date, count]) => ({ date, count }))
    const mostActiveDay  = activityData.reduce(
      (max, d) => (d.count > max.count ? d : max),
      { date: '', count: 0 },
    )

    return {
      totalProjects, projects30Days,
      totalGenerations: allFragments, generations7Days: fragments7Days,
      topProjects, activityData, mostActiveDay,
    }
  }),
})




// import { prisma } from '@/lib/db'
// import { protectedProcedure, createTRPCRouter } from '@/trpc/init'
// import { z } from 'zod'
// import { getUsageStatus } from '@/lib/usage'
// import { getStripe, CREDIT_PACKAGES } from '@/lib/stripe'
// import * as Sentry from '@sentry/nextjs'
// import type { PurchaseStatus } from '@/generated/prisma'

// export const usageRouter = createTRPCRouter({

//   status: protectedProcedure.query(async ({ ctx }) => {
//     const status = await getUsageStatus(ctx.auth.userId)
//     const now = Date.now()
//     return {
//       remainingPoints: status.balance,
//       plan:            status.plan,
//       nextReset:       status.nextReset,
//       msBeforeNext:    Math.max(0, status.nextReset.getTime() - now),
//     }
//   }),

//   // ── Credit packages available for purchase ──────────────────────────────────
//   getCreditPackages: protectedProcedure.query(() => {
//     return CREDIT_PACKAGES
//   }),

//   // ── Create Stripe Checkout session for credit top-up ───────────────────────
//   createCheckoutSession: protectedProcedure
//     .input(z.object({ packageId: z.string() }))
//     .mutation(async ({ ctx, input }) => {
//       const userId = ctx.auth.userId
//       const pkg    = CREDIT_PACKAGES.find((p) => p.id === input.packageId)
//       if (!pkg) throw new Error('Invalid package')

//       const stripe  = getStripe()
//       const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

//       const session = await stripe.checkout.sessions.create({
//         mode:                'payment',
//         payment_method_types: ['card'],
//         line_items: [
//           {
//             quantity:   1,
//             price_data: {
//               currency:     'usd',
//               unit_amount:  pkg.amountCents,
//               product_data: {
//                 name:        `${pkg.credits} Isotope Credits`,
//                 description: `Add ${pkg.credits} credits to your account. Credits never expire.`,
//                 images:      [],
//               },
//             },
//           },
//         ],
//         metadata: {
//           userId,
//           packageId:  pkg.id,
//           credits:    String(pkg.credits),
//           units:      String(pkg.units),
//         },
//         success_url: `${appUrl}/usage?purchase=success&credits=${pkg.credits}`,
//         cancel_url:  `${appUrl}/usage?purchase=cancelled`,
//       })

//       // Record the pending purchase
//       await prisma.creditPurchase.create({
//         data: {
//           userId,
//           stripeSessionId: session.id,
//           credits:         pkg.credits,
//           units:           pkg.units,
//           amountCents:     pkg.amountCents,
//           status:          'pending' as PurchaseStatus,
//         },
//       })

//       return { url: session.url }
//     }),

//   // ── Purchase history ────────────────────────────────────────────────────────
//   getPurchaseHistory: protectedProcedure.query(async ({ ctx }) => {
//     return prisma.creditPurchase.findMany({
//       where:   { userId: ctx.auth.userId, status: 'completed' as PurchaseStatus },
//       orderBy: { createdAt: 'desc' },
//       take:    10,
//       select: {
//         id:          true,
//         credits:     true,
//         amountCents: true,
//         createdAt:   true,
//       },
//     })
//   }),

//   // ── Analytics ───────────────────────────────────────────────────────────────
//   analytics: protectedProcedure.query(async ({ ctx }) => {
//     const userId = ctx.auth.userId
//     const now = new Date()
//     const startOf30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
//     const startOf7Days  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000)

//     const [
//       totalProjects,
//       projects30Days,
//       allFragments,
//       fragments7Days,
//       topProjects,
//       dailyActivity,
//     ] = await Promise.all([
//       prisma.project.count({ where: { userId } }),
//       prisma.project.count({ where: { userId, createdAt: { gte: startOf30Days } } }),
//       prisma.fragment.count({ where: { message: { project: { userId } } } }),
//       prisma.fragment.count({
//         where: { message: { project: { userId } }, createdAt: { gte: startOf7Days } },
//       }),
//       prisma.project.findMany({
//         where:   { userId },
//         orderBy: { messages: { _count: 'desc' } },
//         take:    5,
//         select: {
//           id: true, name: true, createdAt: true, updatedAt: true,
//           isPublic: true, vercelDeployUrl: true,
//           _count: { select: { messages: true } },
//         },
//       }),
//       prisma.fragment.findMany({
//         where:  { message: { project: { userId } }, createdAt: { gte: startOf30Days } },
//         select: { createdAt: true },
//       }),
//     ])

//     const buckets: Record<string, number> = {}
//     for (let i = 0; i < 30; i++) {
//       const d   = new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000)
//       const key = d.toISOString().split('T')[0]
//       buckets[key] = 0
//     }
//     for (const f of dailyActivity) {
//       const key = f.createdAt.toISOString().split('T')[0]
//       if (buckets[key] !== undefined) buckets[key]++
//     }

//     const activityData   = Object.entries(buckets).map(([date, count]) => ({ date, count }))
//     const mostActiveDay  = activityData.reduce(
//       (max, d) => (d.count > max.count ? d : max),
//       { date: '', count: 0 },
//     )

//     return {
//       totalProjects, projects30Days,
//       totalGenerations: allFragments, generations7Days: fragments7Days,
//       topProjects, activityData, mostActiveDay,
//     }
//   }),
// })
