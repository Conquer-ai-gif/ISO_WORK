import { z } from 'zod'
import { prisma } from '@/lib/db'
import { protectedProcedure, baseProcedure, createTRPCRouter } from '@/trpc/init'
import { TRPCError } from '@trpc/server'
import { Prisma } from '@/generated/prisma/client'

const CATEGORIES = ['Productivity', 'E-commerce', 'Social', 'Dashboard', 'Landing Page', 'Entertainment', 'Tools', 'Other'] as const

export const marketplaceRouter = createTRPCRouter({

  // ── List templates (public) ────────────────────────────────────────────────
  list: baseProcedure
    .input(z.object({
      category: z.string().optional(),
      search:   z.string().optional(),
      sort:     z.enum(['newest', 'popular', 'liked']).default('popular'),
      take:     z.number().int().min(1).max(50).default(24),
      skip:     z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const where: Prisma.MarketplaceTemplateWhereInput = { isPublic: true }
      if (input.category && input.category !== 'All') where.category = input.category
      if (input.search) {
        where.OR = [
          { title:       { contains: input.search, mode: 'insensitive' } },
          { description: { contains: input.search, mode: 'insensitive' } },
          { category:    { contains: input.search, mode: 'insensitive' } },
        ]
      }

      const orderBy =
        input.sort === 'newest'  ? { createdAt: 'desc' as const } :
        input.sort === 'liked'   ? { likeCount:  'desc' as const } :
                                   { useCount:   'desc' as const }

      const [items, total] = await Promise.all([
        prisma.marketplaceTemplate.findMany({
          where,
          orderBy: [
            { featured: 'desc' }, // featured always first
            orderBy,
          ],
          take: input.take,
          skip: input.skip,
          select: {
            id: true, title: true, description: true, category: true,
            emoji: true, useCount: true, likeCount: true, featured: true,
            userId: true, createdAt: true, prompt: true,
          },
        }),
        prisma.marketplaceTemplate.count({ where }),
      ])

      return { items, total }
    }),

  // ── Get one template ───────────────────────────────────────────────────────
  getOne: baseProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const template = await prisma.marketplaceTemplate.findUnique({
        where: { id: input.id },
      })
      if (!template || !template.isPublic) throw new TRPCError({ code: 'NOT_FOUND' })
      return template
    }),

  // ── Publish a project as a template ───────────────────────────────────────
  publish: protectedProcedure
    .input(z.object({
      projectId:   z.string(),
      title:       z.string().min(3).max(60),
      description: z.string().min(10).max(200),
      category:    z.enum(CATEGORIES),
      emoji:       z.string().max(4),
    }))
    .mutation(async ({ input, ctx }) => {
      // Get the latest fragment files from this project
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, userId: ctx.auth.userId },
        include: {
          messages: {
            where: { role: 'ASSISTANT', type: 'RESULT' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { fragment: true },
          },
        },
      })
      if (!project) throw new TRPCError({ code: 'NOT_FOUND' })

      const fragment = project.messages[0]?.fragment
      if (!fragment) throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Project has no generated code yet. Generate something first.',
      })

      // Check not already published from this project
      const existing = await prisma.marketplaceTemplate.findFirst({
        where: { projectId: input.projectId, userId: ctx.auth.userId },
      })
      if (existing) throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'You have already published this project as a template.',
      })

      const template = await prisma.marketplaceTemplate.create({
        data: {
          projectId:   input.projectId,
          userId:      ctx.auth.userId,
          title:       input.title,
          description: input.description,
          category:    input.category,
          emoji:       input.emoji,
          prompt:      project.messages[0]?.content ?? '',
          files:       fragment.files,
        },
      })

      return template
    }),

  // ── Fork a template — creates a new project ────────────────────────────────
  fork: protectedProcedure
    .input(z.object({ templateId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const template = await prisma.marketplaceTemplate.findUnique({
        where: { id: input.templateId },
      })
      if (!template || !template.isPublic) throw new TRPCError({ code: 'NOT_FOUND' })

      // Increment use count
      await prisma.marketplaceTemplate.update({
        where: { id: input.templateId },
        data:  { useCount: { increment: 1 } },
      })

      // Return the prompt so the client can create a project with it
      return { prompt: template.prompt, title: template.title }
    }),

  // ── Like a template ────────────────────────────────────────────────────────
  like: protectedProcedure
    .input(z.object({ templateId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await prisma.templateLike.findUnique({
        where: { userId_templateId: { userId: ctx.auth.userId, templateId: input.templateId } },
      })
      if (existing) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Already liked' })

      await prisma.templateLike.create({
        data: { userId: ctx.auth.userId, templateId: input.templateId },
      })
      await prisma.marketplaceTemplate.update({
        where: { id: input.templateId },
        data:  { likeCount: { increment: 1 } },
      })
      return { success: true }
    }),

  // ── Unlike a template ──────────────────────────────────────────────────────
  unlike: protectedProcedure
    .input(z.object({ templateId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await prisma.templateLike.deleteMany({
        where: { userId: ctx.auth.userId, templateId: input.templateId },
      })
      await prisma.marketplaceTemplate.update({
        where: { id: input.templateId },
        data:  { likeCount: { decrement: 1 } },
      })
      return { success: true }
    }),

  // ── Check if user liked a template ────────────────────────────────────────
  isLiked: protectedProcedure
    .input(z.object({ templateId: z.string() }))
    .query(async ({ input, ctx }) => {
      const like = await prisma.templateLike.findUnique({
        where: { userId_templateId: { userId: ctx.auth.userId, templateId: input.templateId } },
      })
      return { liked: !!like }
    }),

  // ── Admin: feature/unfeature ───────────────────────────────────────────────
  setFeatured: baseProcedure
    .input(z.object({ templateId: z.string(), featured: z.boolean() }))
    .mutation(async ({ input }) => {
      await prisma.marketplaceTemplate.update({
        where: { id: input.templateId },
        data:  { featured: input.featured },
      })
      return { success: true }
    }),

  // ── My published templates ─────────────────────────────────────────────────
  myTemplates: protectedProcedure.query(async ({ ctx }) => {
    return prisma.marketplaceTemplate.findMany({
      where:   { userId: ctx.auth.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, title: true, description: true, category: true,
        emoji: true, useCount: true, likeCount: true, featured: true,
        isPublic: true, createdAt: true,
      },
    })
  }),
})
