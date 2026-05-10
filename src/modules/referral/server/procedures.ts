import { prisma } from '@/lib/db'
import { protectedProcedure, createTRPCRouter } from '@/trpc/init'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { getOrCreateReferralCode, applyReferralCode } from '@/lib/usage'

export const referralRouter = createTRPCRouter({

  // ── Get or create the current user's referral code ────────────────────────
  getMyCode: protectedProcedure.query(async ({ ctx }) => {
    const code = await getOrCreateReferralCode(ctx.auth.userId)
    // Also get use count
    const referral = await prisma.referral.findUnique({
      where: { ownerId: ctx.auth.userId },
      include: { _count: { select: { uses: true } } },
    })
    return {
      code,
      uses: referral?._count.uses ?? 0,
      bonusEarned: (referral?._count.uses ?? 0) * 5,
    }
  }),

  // ── Apply a referral code (called after signup) ───────────────────────────
  applyCode: protectedProcedure
    .input(z.object({ code: z.string().min(1).max(20) }))
    .mutation(async ({ input, ctx }) => {
      const result = await applyReferralCode(ctx.auth.userId, input.code)
      if (!result.success) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: result.message })
      }
      return result
    }),

  // ── Get referral stats for the current user ───────────────────────────────
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const referral = await prisma.referral.findUnique({
      where: { ownerId: ctx.auth.userId },
      include: {
        uses: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: { select: { uses: true } },
      },
    })

    // Check if this user was referred by someone
    const wasReferred = await prisma.referralUse.findUnique({
      where: { newUserId: ctx.auth.userId },
    })

    return {
      code:          referral?.code ?? null,
      totalUses:     referral?._count.uses ?? 0,
      bonusEarned:   (referral?._count.uses ?? 0) * 5,
      wasReferred:   !!wasReferred,
      recentUses:    referral?.uses ?? [],
    }
  }),
})
