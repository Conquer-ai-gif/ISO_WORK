import { z } from 'zod'
import { prisma } from '@/lib/db'
import { protectedProcedure, baseProcedure, createTRPCRouter } from '@/trpc/init'
import { sendEmail, buildFeedbackEmail } from '@/lib/email'

export const feedbackRouter = createTRPCRouter({

  // ── Submit feedback (any logged-in user) ────────────────────────────────────
  submit: protectedProcedure
    .input(z.object({
      type:    z.enum(['general', 'bug', 'feature']),
      rating:  z.number().int().min(1).max(5).optional(),
      message: z.string().min(1).max(2000),
    }))
    .mutation(async ({ input, ctx }) => {
      const feedback = await prisma.feedback.create({
        data: {
          userId:  ctx.auth.userId,
          type:    input.type,
          rating:  input.rating ?? null,
          message: input.message,
          status:  'new',
        },
      })

      // Send email notification — fire and forget, never block the response
      const to = process.env.FEEDBACK_EMAIL
      if (to) {
        const { subject, html } = buildFeedbackEmail({
          type:      feedback.type,
          rating:    feedback.rating,
          message:   feedback.message,
          userId:    feedback.userId,
          createdAt: feedback.createdAt,
        })
        sendEmail({ to, subject, html }).catch((e) =>
          console.error('Feedback email failed:', e),
        )
      }

      return { success: true }
    }),

  // ── List all feedback (admin only — guarded at middleware level) ─────────────
  list: baseProcedure
    .input(z.object({
      status: z.enum(['new', 'reviewed', 'resolved', 'all']).default('all'),
      take:   z.number().int().min(1).max(100).default(50),
      skip:   z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const where = input.status === 'all' ? {} : { status: input.status as any }

      const [items, total] = await Promise.all([
        prisma.feedback.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take:    input.take,
          skip:    input.skip,
        }),
        prisma.feedback.count({ where }),
      ])

      return { items, total }
    }),

  // ── Update feedback status (admin only) ─────────────────────────────────────
  updateStatus: baseProcedure
    .input(z.object({
      id:     z.string(),
      status: z.enum(['new', 'reviewed', 'resolved']),
    }))
    .mutation(async ({ input }) => {
      await prisma.feedback.update({
        where: { id: input.id },
        data:  { status: input.status },
      })
      return { success: true }
    }),
})
