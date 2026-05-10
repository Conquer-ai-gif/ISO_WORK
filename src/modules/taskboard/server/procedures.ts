import { prisma } from '@/lib/db';
import { protectedProcedure, createTRPCRouter } from '@/trpc/init';
import z from 'zod';
import { TRPCError } from '@trpc/server';

export const taskBoardRouter = createTRPCRouter({

  // ── Get all tasks for a project ──────────────────────────────────────────
  getByProject: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      // Verify user has access to the project
      const project = await prisma.project.findFirst({
        where: {
          id: input.projectId,
          OR: [
            { userId: ctx.auth.userId },
            { workspace: { members: { some: { userId: ctx.auth.userId } } } },
          ],
        },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });

      return prisma.task.findMany({
        where: { projectId: input.projectId },
        orderBy: [{ status: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
      });
    }),

  // ── Create task ──────────────────────────────────────────────────────────
  create: protectedProcedure
    .input(z.object({
      projectId:   z.string(),
      title:       z.string().min(1).max(300),
      description: z.string().optional(),
      status:      z.enum(['todo', 'in_progress', 'in_review', 'done']).default('todo'),
      priority:    z.enum(['low', 'medium', 'high']).default('medium'),
      labels:      z.array(z.string()).default([]),
    }))
    .mutation(async ({ input, ctx }) => {
      const project = await prisma.project.findFirst({
        where: {
          id: input.projectId,
          OR: [
            { userId: ctx.auth.userId },
            { workspace: { members: { some: { userId: ctx.auth.userId } } } },
          ],
        },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });

      const maxOrder = await prisma.task.aggregate({
        where: { projectId: input.projectId, status: input.status },
        _max: { order: true },
      });

      return prisma.task.create({
        data: {
          projectId:   input.projectId,
          title:       input.title,
          description: input.description ?? null,
          status:      input.status,
          priority:    input.priority,
          labels:      input.labels,
          createdBy:   ctx.auth.userId,
          order:       (maxOrder._max.order ?? 0) + 1,
        },
      });
    }),

  // ── Update task (title, description, status, priority, labels) ───────────
  update: protectedProcedure
    .input(z.object({
      id:          z.string(),
      title:       z.string().min(1).max(300).optional(),
      description: z.string().nullable().optional(),
      status:      z.enum(['todo', 'in_progress', 'in_review', 'done']).optional(),
      priority:    z.enum(['low', 'medium', 'high']).optional(),
      labels:      z.array(z.string()).optional(),
      order:       z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const task = await prisma.task.findFirst({
        where: { id: input.id },
        include: { project: true },
      });
      if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });

      const hasAccess = task.project.userId === ctx.auth.userId ||
        await prisma.member.findFirst({
          where: { workspaceId: task.project.workspaceId ?? '', userId: ctx.auth.userId },
        });
      if (!hasAccess) throw new TRPCError({ code: 'FORBIDDEN' });

      const { id, ...data } = input;
      return prisma.task.update({ where: { id }, data });
    }),

  // ── Delete task ──────────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const task = await prisma.task.findFirst({
        where: { id: input.id },
        include: { project: true },
      });
      if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      if (task.project.userId !== ctx.auth.userId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      await prisma.task.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
