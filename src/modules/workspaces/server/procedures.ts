import { prisma } from '@/lib/db'
import { clerkClient } from '@clerk/nextjs/server'
import { protectedProcedure, createTRPCRouter } from '@/trpc/init'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { MemberRole } from '@/generated/prisma/client'
import { getUserPlanTier, getMemberLimit } from '@/lib/clerk-plan'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function requireMember(
  workspaceId: string,
  userId: string,
  minRole: MemberRole = 'VIEWER',
) {
  const member = await prisma.member.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  })
  if (!member) throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a member of this workspace' })

  const roleRank: Record<MemberRole, number> = { VIEWER: 0, EDITOR: 1, OWNER: 2 }
  if (roleRank[member.role] < roleRank[minRole]) {
    throw new TRPCError({ code: 'FORBIDDEN', message: `Requires ${minRole} role` })
  }
  return member
}

// ── Router ────────────────────────────────────────────────────────────────────
export const workspaceRouter = createTRPCRouter({

  // ── Create workspace ──────────────────────────────────────────────────────
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(60) }))
    .mutation(async ({ input, ctx }) => {
      const workspace = await prisma.workspace.create({
        data: {
          name: input.name,
          ownerId: ctx.auth.userId,
          members: {
            create: {
              userId: ctx.auth.userId,
              role: 'OWNER',
            },
          },
        },
      })
      return workspace
    }),

  // ── Get all workspaces the current user belongs to ─────────────────────────
  getMany: protectedProcedure.query(async ({ ctx }) => {
    return prisma.workspace.findMany({
      where: { members: { some: { userId: ctx.auth.userId } } },
      include: {
        _count: { select: { members: true, projects: true } },
        members: {
          where: { userId: ctx.auth.userId },
          select: { role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }),

  // ── Get one workspace (member-gated) ──────────────────────────────────────
  getOne: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      await requireMember(input.id, ctx.auth.userId)
      return prisma.workspace.findUnique({
        where: { id: input.id },
        include: {
          members: true,
          _count: { select: { projects: true } },
        },
      })
    }),

  // ── Rename workspace (owner only) ──────────────────────────────────────────
  rename: protectedProcedure
    .input(z.object({ id: z.string().min(1), name: z.string().min(1).max(60) }))
    .mutation(async ({ input, ctx }) => {
      await requireMember(input.id, ctx.auth.userId, 'OWNER')
      return prisma.workspace.update({ where: { id: input.id }, data: { name: input.name } })
    }),

  // ── Delete workspace (owner only) ─────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await requireMember(input.id, ctx.auth.userId, 'OWNER')
      return prisma.workspace.delete({ where: { id: input.id } })
    }),

  // ── Get members ───────────────────────────────────────────────────────────
  getMembers: protectedProcedure
    .input(z.object({ workspaceId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      await requireMember(input.workspaceId, ctx.auth.userId)
      return prisma.member.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { joinedAt: 'asc' },
      })
    }),

  // ── Remove member (owner only, cannot remove self) ────────────────────────
  removeMember: protectedProcedure
    .input(z.object({ workspaceId: z.string().min(1), userId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await requireMember(input.workspaceId, ctx.auth.userId, 'OWNER')
      if (input.userId === ctx.auth.userId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot remove yourself — delete the workspace instead' })
      }
      return prisma.member.delete({
        where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
      })
    }),

  // ── Update member role (owner only, cannot change own role) ───────────────
  updateRole: protectedProcedure
    .input(z.object({
      workspaceId: z.string().min(1),
      userId: z.string().min(1),
      role: z.enum(['EDITOR', 'VIEWER']),  // owner cannot be reassigned via this
    }))
    .mutation(async ({ input, ctx }) => {
      await requireMember(input.workspaceId, ctx.auth.userId, 'OWNER')
      if (input.userId === ctx.auth.userId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot change your own role' })
      }
      return prisma.member.update({
        where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
        data: { role: input.role },
      })
    }),

  // ── Leave workspace (non-owner members only) ──────────────────────────────
  leave: protectedProcedure
    .input(z.object({ workspaceId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const member = await requireMember(input.workspaceId, ctx.auth.userId)
      if (member.role === 'OWNER') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Owner cannot leave — transfer ownership or delete the workspace' })
      }
      return prisma.member.delete({
        where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: ctx.auth.userId } },
      })
    }),

  // ── Create invite link ────────────────────────────────────────────────────
  createInvite: protectedProcedure
    .input(z.object({
      workspaceId: z.string().min(1),
      role: z.enum(['EDITOR', 'VIEWER']),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireMember(input.workspaceId, ctx.auth.userId, 'OWNER')

      // Enforce member limits per plan
      // Free: 1 member (owner only, no invites)
      // Pro: 3 members total
      // Team: 5 members total
      const workspace = await prisma.workspace.findUnique({
        where: { id: input.workspaceId },
        include: { _count: { select: { members: true } } },
      });
      if (!workspace) throw new TRPCError({ code: 'NOT_FOUND' });

      // Enforce member limits per plan using safe Clerk plan helper
      const ownerPlan  = await getUserPlanTier(workspace.ownerId)
      const memberLimit = getMemberLimit(ownerPlan)

      if (memberLimit <= 1) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Upgrade to Pro or Team to invite members',
        })
      }

      const currentCount = workspace._count.members
      if (currentCount >= memberLimit) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Your plan allows a maximum of ${memberLimit} members. Upgrade to add more.`,
        })
      }

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)  // 7 days
      return prisma.invite.create({
        data: {
          workspaceId: input.workspaceId,
          role: input.role,
          expiresAt,
        },
      })
    }),

  // ── Get active invites (owner only) ───────────────────────────────────────
  getInvites: protectedProcedure
    .input(z.object({ workspaceId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      await requireMember(input.workspaceId, ctx.auth.userId, 'OWNER')
      return prisma.invite.findMany({
        where: {
          workspaceId: input.workspaceId,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      })
    }),

  // ── Revoke invite (owner only) ────────────────────────────────────────────
  revokeInvite: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const invite = await prisma.invite.findUnique({
        where: { id: input.id },
        include: { workspace: true },
      })
      if (!invite) throw new TRPCError({ code: 'NOT_FOUND' })
      await requireMember(invite.workspaceId, ctx.auth.userId, 'OWNER')
      return prisma.invite.delete({ where: { id: input.id } })
    }),

  // ── Get invite details (public — for the accept page) ─────────────────────
  getInviteByToken: protectedProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const invite = await prisma.invite.findUnique({
        where: { token: input.token },
        include: { workspace: { select: { id: true, name: true, _count: { select: { members: true } } } } },
      })
      if (!invite) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found or expired' })
      if (invite.acceptedAt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite has already been used' })
      if (invite.expiresAt < new Date()) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite has expired' })
      return invite
    }),

  // ── Accept invite ─────────────────────────────────────────────────────────
  acceptInvite: protectedProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const invite = await prisma.invite.findUnique({ where: { token: input.token } })
      if (!invite) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' })
      if (invite.acceptedAt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Already used' })
      if (invite.expiresAt < new Date()) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invite expired' })

      // Check if already a member
      const existing = await prisma.member.findUnique({
        where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: ctx.auth.userId } },
      })
      if (existing) throw new TRPCError({ code: 'BAD_REQUEST', message: 'You are already a member of this workspace' })

      // Add as member + mark invite accepted
      await prisma.$transaction([
        prisma.member.create({
          data: { workspaceId: invite.workspaceId, userId: ctx.auth.userId, role: invite.role },
        }),
        prisma.invite.update({
          where: { id: invite.id },
          data: { acceptedAt: new Date(), acceptedBy: ctx.auth.userId },
        }),
      ])

      return { workspaceId: invite.workspaceId }
    }),

  // ── Get workspace projects (member-gated) ─────────────────────────────────
  getProjects: protectedProcedure
    .input(z.object({ workspaceId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      await requireMember(input.workspaceId, ctx.auth.userId)
      return prisma.project.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { updatedAt: 'desc' },
        include: {
          messages: {
            where: { role: 'ASSISTANT', type: 'RESULT' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { fragment: true },
          },
        },
      })
    }),
})
