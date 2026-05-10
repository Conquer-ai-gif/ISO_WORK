import { inngest } from '@/inngest/client';
import { prisma } from '@/lib/db';
import { protectedProcedure, createTRPCRouter } from '@/trpc/init';
import z from 'zod';
import { TRPCError } from '@trpc/server';
import { openRouterModel } from '@/lib/openrouter';

// Per-user cooldown — prevents sandbox/API abuse from rapid-fire generation
// Stored in process memory (sufficient for serverless — warm instance handles the same user)
const lastGenerationTime = new Map<string, number>()
const GENERATION_COOLDOWN_MS = 10_000  // 10 seconds between generations

export const messageRouter = createTRPCRouter({
  getMany: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      return prisma.message.findMany({
        where: {
          projectId: input.projectId,
          project: {
            OR: [
              { userId: ctx.auth.userId },
              { workspace: { members: { some: { userId: ctx.auth.userId } } } },
            ],
          },
        },
        select: {
          id: true,
          content: true,
          role: true,
          type: true,
          imageUrl: true,
          plan: true,
          planStatus: true,
          requiredIntegrations: true,
          createdAt: true,
          updatedAt: true,
          projectId: true,
          fragment: true,
        },
        orderBy: { updatedAt: 'asc' },
        take: 200,  // cap at 200 — conversation summary handles older context
      });
    }),

  // ── Generate: full agent run — consumes a credit ──────────────────────────
  create: protectedProcedure
    .input(z.object({
      value: z.string().min(1).max(10000),
      projectId: z.string().min(1),
      imageUrl: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const existingProject = await prisma.project.findFirst({
        where: {
          id: input.projectId,
          OR: [
            { userId: ctx.auth.userId },
            { workspace: { members: { some: { userId: ctx.auth.userId } } } },
          ],
        },
        include: { workspace: true },
      });
      if (!existingProject) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });

      // Check VIEWER cannot generate
      if (existingProject.workspaceId) {
        const member = await prisma.member.findUnique({
          where: { workspaceId_userId: { workspaceId: existingProject.workspaceId, userId: ctx.auth.userId } },
        });
        if (member?.role === 'VIEWER') throw new TRPCError({ code: 'FORBIDDEN', message: 'Viewers cannot generate code' });
      }

      const ownerUserId = existingProject.workspace?.ownerId ?? ctx.auth.userId

      // Rate limit — prevent rapid-fire generation abuse
      const now = Date.now()
      const lastTime = lastGenerationTime.get(ctx.auth.userId) ?? 0
      if (now - lastTime < GENERATION_COOLDOWN_MS) {
        const waitSec = Math.ceil((GENERATION_COOLDOWN_MS - (now - lastTime)) / 1000)
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Please wait ${waitSec} second${waitSec !== 1 ? 's' : ''} before generating again.`,
        })
      }
      lastGenerationTime.set(ctx.auth.userId, now)

      // Preflight credit check — V2 billing charges after execution (in Inngest).
      // We only check here to give the user an early "out of credits" error
      // rather than letting the generation start and fail mid-way.
      const { estimateCostFromTaskGraph } = await import('@/lib/usage')
      const estimate = await estimateCostFromTaskGraph(ownerUserId, { tasks: 1 })
      if (!estimate.allowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `You have run out of credits. You need at least ${estimate.estimatedCost} credits but have ${estimate.balance}.`,
        })
      }

      const createdMessage = await prisma.message.create({
        data: {
          projectId: existingProject.id,
          content: input.value,
          role: 'USER',
          type: 'RESULT',
          imageUrl: input.imageUrl ?? null,
          planStatus: 'pending',
        },
      })

      await inngest.send({
        name: 'code-agent/run',
        data: {
          value: input.value,
          projectId: input.projectId,
          messageId: createdMessage.id,
          imageUrl: input.imageUrl,
          supabaseUrl: existingProject.supabaseUrl,
          supabaseAnonKey: existingProject.supabaseAnonKey,
        },
      })

      return createdMessage
    }),

  // ── Approve plan — triggers code generation ────────────────────────────
  approvePlan: protectedProcedure
    .input(z.object({ messageId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const message = await prisma.message.findFirst({
        where: {
          id: input.messageId,
          project: {
            OR: [
              { userId: ctx.auth.userId },
              { workspace: { members: { some: { userId: ctx.auth.userId } } } },
            ],
          },
        },
        include: { project: { include: { workspace: true } } },
      })
      if (!message) throw new TRPCError({ code: 'NOT_FOUND' })
      if (message.planStatus !== 'pending') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Plan already actioned' })

      await prisma.message.update({
        where: { id: input.messageId },
        data: { planStatus: 'approved' },
      })

      await inngest.send({
        name: 'code-agent/run',
        data: {
          value: message.content,
          projectId: message.projectId,
          messageId: message.id,
          imageUrl: message.imageUrl ?? undefined,
          supabaseUrl: message.project.supabaseUrl ?? undefined,
          supabaseAnonKey: message.project.supabaseAnonKey ?? undefined,
        },
      })

      return { success: true }
    }),

  // ── Reject plan — refunds 1 credit ─────────────────────────────────────
  rejectPlan: protectedProcedure
    .input(z.object({ messageId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const message = await prisma.message.findFirst({
        where: {
          id: input.messageId,
          project: {
            OR: [
              { userId: ctx.auth.userId },
              { workspace: { members: { some: { userId: ctx.auth.userId } } } },
            ],
          },
        },
        include: { project: { include: { workspace: true } } },
      })
      if (!message) throw new TRPCError({ code: 'NOT_FOUND' })

      // Refund the credit — plan was rejected, no code was generated
      const chargeId = message.project.workspace?.ownerId ?? ctx.auth.userId
      await prisma.credits.update({
        where: { userId: chargeId },
        data: { balance: { increment: 1 } },
      })

      await prisma.message.update({
        where: { id: input.messageId },
        data: { planStatus: 'rejected' },
      })

      return { success: true }
    }),

  // ── Resubmit modified plan — user edited tasks, skip AI planning ──────────
  // Sets planStatus back to approved with the user-modified task graph
  // then fires the Inngest generation event directly
  resubmitPlan: protectedProcedure
    .input(z.object({
      messageId: z.string().min(1),
      tasks: z.array(z.object({
        id: z.string(),
        type: z.enum(['ui', 'backend', 'db', 'integration']),
        description: z.string().min(1),
        files: z.array(z.string()),
        dependsOn: z.array(z.string()),
        priority: z.number().int(),
      })).min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const message = await prisma.message.findFirst({
        where: {
          id: input.messageId,
          project: {
            OR: [
              { userId: ctx.auth.userId },
              { workspace: { members: { some: { userId: ctx.auth.userId } } } },
            ],
          },
        },
        include: { project: true },
      })
      if (!message) throw new TRPCError({ code: 'NOT_FOUND' })
      if (message.planStatus === 'approved') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Plan already approved' })
      }

      // Merge modified tasks back into the existing plan JSON
      let existingPlan: Record<string, unknown> = {}
      try { existingPlan = JSON.parse(message.plan ?? '{}') } catch { /* ignore */ }

      const updatedPlan = JSON.stringify({
        ...existingPlan,
        tasks: input.tasks,
      })

      await prisma.message.update({
        where: { id: input.messageId },
        data: { planStatus: 'approved', plan: updatedPlan },
      })

      // Fire Inngest generation event — same as approvePlan
      const { inngest } = await import('@/inngest/client')
      await inngest.send({
        name: 'isotope/code.requested',
        data: {
          projectId: message.projectId,
          messageId: input.messageId,
          userId: ctx.auth.userId,
        },
      })

      return { success: true }
    }),
  // Uses Gemini directly with the project's file context for Q&A, debugging,
  // explanations, and advice. Saves the exchange as messages for history.
  ask: protectedProcedure
    .input(z.object({
      value: z.string().min(1).max(5000),
      projectId: z.string().min(1),
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
        include: {
          messages: {
            where: { role: 'ASSISTANT', type: 'RESULT' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { fragment: true },
          },
        },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });

      // Save the user message
      await prisma.message.create({
        data: {
          projectId: input.projectId,
          content: input.value,
          role: 'USER',
          type: 'RESULT',
        },
      });

      // Build context from latest fragment files
      const latestFragment = project.messages[0]?.fragment;
      const filesContext = latestFragment?.files
        ? Object.entries(latestFragment.files as { [k: string]: string })
            .slice(0, 8)
            .map(([path, content]) => `\`\`\`${path}\n${content.slice(0, 2000)}\n\`\`\``)
            .join('\n\n')
        : 'No files generated yet.';

      // Call OpenRouter — no Inngest, no E2B, no credit consumed
      const systemPrompt = `You are a helpful assistant for a developer using an AI app builder called Isotope.
The user has a project with the following generated files. Answer their questions about the code,
explain how things work, suggest improvements, debug issues, or help them decide what to build next.
Be concise and practical. Do NOT generate new code unless specifically asked.

Current project files:
${filesContext}`

      let replyText: string
      try {
        replyText = await openRouterModel.run([
          { role: 'user', content: `${systemPrompt}\n\n${input.value}` },
        ])
      } catch {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI not configured — check OPENROUTER_API_KEY' })
      }

      // Save AI reply — type RESULT so it shows as a normal assistant message
      // but without a fragment (no code was generated)
      const assistantMessage = await prisma.message.create({
        data: {
          projectId: input.projectId,
          content: replyText,
          role: 'ASSISTANT',
          type: 'RESULT',
        },
      });

      return assistantMessage;
    }),
  // ── Suggestions: generate 3 clickable next-step prompts after a generation ─
  // Called client-side after the assistant message appears.
  // Uses a cheap single-turn Gemini call — no credits consumed.
  getSuggestions: protectedProcedure
    .input(z.object({
      projectId: z.string().min(1),
      summary:   z.string().max(500),  // fragment title / assistant message
    }))
    .query(async ({ input, ctx }) => {
      // Verify user has access to this project
      const project = await prisma.project.findFirst({
        where: {
          id: input.projectId,
          OR: [
            { userId: ctx.auth.userId },
            { workspace: { members: { some: { userId: ctx.auth.userId } } } },
          ],
        },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND' });

      if (!process.env.OPENROUTER_API_KEY) return { suggestions: [] };

      try {
        const text = await openRouterModel.run([
          {
            role: 'user',
            content: `You suggest follow-up prompts for an AI app builder.
Given a short description of what was just built, return EXACTLY 3 short follow-up prompts the user might want to do next.
Rules:
- Each prompt must be under 60 characters
- Start with an action verb (Add, Make, Create, Build, Connect, Show, Improve, Fix, Turn)
- Be specific to what was described — not generic
- Return ONLY a JSON array of 3 strings — no explanation, no markdown, no code fences
Example output: ["Add user authentication", "Make it mobile responsive", "Add a dark mode toggle"]

What was just built: ${input.summary}`,
          },
        ])

        const clean = text.replace(/```json|```/g, '').trim()
        const suggestions = JSON.parse(clean)

        if (!Array.isArray(suggestions)) return { suggestions: [] }
        return { suggestions: suggestions.slice(0, 3).filter((s: unknown) => typeof s === 'string') }
      } catch {
        return { suggestions: [] }
      }
    }),
});
