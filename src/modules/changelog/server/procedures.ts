import { prisma } from '@/lib/db';
import { protectedProcedure, createTRPCRouter } from '@/trpc/init';
import { adminProcedure } from '@/trpc/init';
import z from 'zod';
import { TRPCError } from '@trpc/server';

// Parse once at module load — not on every request
const ADMIN_IDS = (process.env.ADMIN_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
import { sendEmail } from '@/lib/email';

export const changelogRouter = createTRPCRouter({

  // ── Public: list published entries ──────────────────────────────────────
  getPublished: protectedProcedure.query(async () => {
    return prisma.changelogEntry.findMany({
      where: { published: true },
      orderBy: { publishedAt: 'desc' },
    });
  }),

  // ── Admin: list all entries ──────────────────────────────────────────────
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const adminIds = ADMIN_IDS
    if (!adminIds.includes(ctx.auth.userId)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin only' });
    }
    return prisma.changelogEntry.findMany({ orderBy: { createdAt: 'desc' } });
  }),

  // ── Admin: create entry ──────────────────────────────────────────────────
  create: protectedProcedure
    .input(z.object({
      title:   z.string().min(1).max(200),
      content: z.string().min(1),
      type:    z.enum(['feature', 'improvement', 'bugfix', 'breaking']),
      tags:    z.array(z.string()).default([]),
    }))
    .mutation(async ({ input, ctx }) => {
      const adminIds = ADMIN_IDS
      if (!adminIds.includes(ctx.auth.userId)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin only' });
      }
      return prisma.changelogEntry.create({
        data: {
          title:   input.title,
          content: input.content,
          type:    input.type,
          tags:    input.tags,
        },
      });
    }),

  // ── Admin: publish entry + send email notification ───────────────────────
  publish: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const adminIds = ADMIN_IDS
      if (!adminIds.includes(ctx.auth.userId)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin only' });
      }

      const entry = await prisma.changelogEntry.update({
        where: { id: input.id },
        data: { published: true, publishedAt: new Date() },
      });

      // Send email notification to all users who opted in
      const subscribers = await prisma.changelogSubscriber.findMany({
        where: { active: true },
      });

      const TYPE_EMOJI: Record<string, string> = {
        feature:     '🚀',
        improvement: '✨',
        bugfix:      '🐛',
        breaking:    '⚠️',
      };

      const emailHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <div style="margin-bottom: 20px;">
            <span style="display: inline-block; background: #7C3AED; color: white; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em;">
              ${entry.type}
            </span>
          </div>
          <h1 style="margin: 0 0 8px; color: #09090B; font-size: 24px; line-height: 1.3;">
            ${TYPE_EMOJI[entry.type] ?? '📝'} ${entry.title}
          </h1>
          <p style="margin: 0 0 24px; color: #71717A; font-size: 14px;">
            ${new Date(entry.publishedAt ?? new Date()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
          <div style="background: #FAFAFA; border-left: 4px solid #7C3AED; padding: 16px 20px; border-radius: 4px; margin-bottom: 24px;">
            <p style="margin: 0; color: #18181B; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${entry.content}</p>
          </div>
          ${entry.tags.length > 0 ? `
          <div style="margin-bottom: 24px;">
            ${entry.tags.map(tag => `<span style="display: inline-block; background: #F4F4F5; color: #71717A; font-size: 12px; padding: 2px 8px; border-radius: 4px; margin-right: 6px;">${tag}</span>`).join('')}
          </div>` : ''}
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/changelog"
            style="display: inline-block; background: #7C3AED; color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 600;">
            View full changelog →
          </a>
          <p style="margin-top: 32px; font-size: 12px; color: #A1A1AA;">
            You're receiving this because you subscribed to Isotope product updates.
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe" style="color: #7C3AED;">Unsubscribe</a>
          </p>
        </div>
      `;

      // Fire and forget — don't block on email delivery
      Promise.allSettled(
        subscribers.map(sub =>
          sendEmail({
            to:      sub.email,
            subject: `${TYPE_EMOJI[entry.type] ?? '📝'} ${entry.title} — Isotope Update`,
            html:    emailHtml,
          })
        )
      ).catch(console.error);

      return entry;
    }),

  // ── Admin: delete entry ──────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const adminIds = ADMIN_IDS
      if (!adminIds.includes(ctx.auth.userId)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin only' });
      }
      await prisma.changelogEntry.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // ── Subscribe to email notifications ────────────────────────────────────
  subscribe: protectedProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      await prisma.changelogSubscriber.upsert({
        where:  { email: input.email },
        update: { active: true },
        create: { email: input.email, active: true },
      });
      return { success: true };
    }),

  // ── Unsubscribe ──────────────────────────────────────────────────────────
  unsubscribe: protectedProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      await prisma.changelogSubscriber.updateMany({
        where: { email: input.email },
        data:  { active: false },
      });
      return { success: true };
    }),
});
