import { inngest, sendInngestEvent } from '@/inngest/client';
import { prisma } from '@/lib/db';
import { protectedProcedure, baseProcedure, createTRPCRouter } from '@/trpc/init';
import z from 'zod';
import { TRPCError } from '@trpc/server';
import { generateSlug } from 'random-word-slugs';
import { getGitHubToken } from '@/lib/github-token';
import { getOctokit, pushFragmentToGitHub, registerGitHubWebhook, deleteGitHubWebhook, smartPushToGitHub, generateBranchName } from '@/lib/github';
import { parseFigmaUrl, figmaToPrompt } from '@/lib/figma';
import { createSupabaseProject, deleteSupabaseProject, getSupabaseOrganizationId } from '@/lib/supabase-mgmt';

import { createVercelProject, deleteVercelProject, getLatestDeployUrl, addCustomDomain, removeCustomDomain, getDomainStatus } from '@/lib/vercel';
import crypto from 'crypto';

// ── Plan gate helper ──────────────────────────────────────────────────────────
async function requirePaidPlan(userId: string): Promise<void> {
  const { getUsageStatus } = await import('@/lib/usage')
  const status = await getUsageStatus(userId)
  if (status.plan === 'free') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'This feature requires a Pro or Team plan. Upgrade at /pricing.',
    })
  }
}


export const projectsRouter = createTRPCRouter({

  // ── Core CRUD ──────────────────────────────────────────────────────────────
  getOne: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const project = await prisma.project.findFirst({
        where: {
          id: input.id,
          OR: [
            { userId: ctx.auth.userId },
            { workspace: { members: { some: { userId: ctx.auth.userId } } } },
          ],
        },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
      return project;
    }),

  getMany: protectedProcedure.query(async ({ ctx }) => {
    return prisma.project.findMany({
      where: {
        OR: [
          { userId: ctx.auth.userId },
          { workspace: { members: { some: { userId: ctx.auth.userId } } } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          where: { role: 'ASSISTANT', type: 'RESULT' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { fragment: true },
        },
      },
    });
  }),

  create: protectedProcedure
    .input(z.object({
      value: z.string().min(1).max(10000),
      workspaceId: z.string().optional(),
      imageUrl: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // If workspace project, find the owner to charge their credits
      let ownerUserId: string | undefined;
      if (input.workspaceId) {
        const workspace = await prisma.workspace.findUnique({
          where: { id: input.workspaceId },
          include: { members: { where: { userId: ctx.auth.userId } } },
        });
        if (!workspace) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' });
        if (!workspace.members.length) throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a member' });
        if (workspace.members[0].role === 'VIEWER') throw new TRPCError({ code: 'FORBIDDEN', message: 'Viewers cannot generate' });
        ownerUserId = workspace.ownerId;  // charge owner
      }

      // Preflight credit check — V2 billing charges after execution (in Inngest).
      // Early check here gives a clear error before the generation starts.
      const chargeId = ownerUserId ?? ctx.auth.userId
      const { estimateCostFromTaskGraph } = await import('@/lib/usage')
      const estimate = await estimateCostFromTaskGraph(chargeId, { tasks: 1 })
      if (!estimate.allowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `You have run out of credits. You need at least ${estimate.estimatedCost} credits but have ${estimate.balance}.`,
        })
      }
      const createdProject = await prisma.project.create({
        data: {
          userId: ctx.auth.userId,
          workspaceId: input.workspaceId ?? null,
          name: generateSlug(2, { format: 'kebab' }),
          messages: { create: { content: input.value, role: 'USER', type: 'RESULT', imageUrl: input.imageUrl ?? null } },
        },
        include: { messages: { select: { id: true }, take: 1 } },
      });
      const messageId = createdProject.messages[0]?.id
      if (!messageId) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create message' })
      try {
        await sendInngestEvent({
          name: 'code-agent/run',
          data: { value: input.value, projectId: createdProject.id, messageId, imageUrl: input.imageUrl },
        })
      } catch (err) {
        await prisma.project.delete({ where: { id: createdProject.id } }).catch(() => {})
        throw new TRPCError({
          code: 'SERVICE_UNAVAILABLE',
          message: err instanceof Error ? err.message : 'Failed to start code generation',
        })
      }
      return createdProject;
    }),

  rename: protectedProcedure
    .input(z.object({ id: z.string().min(1), name: z.string().min(1).max(60) }))
    .mutation(async ({ input, ctx }) => {
      const project = await prisma.project.findUnique({ where: { id: input.id, userId: ctx.auth.userId } });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND' });
      return prisma.project.update({ where: { id: input.id }, data: { name: input.name } });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const project = await prisma.project.findUnique({ where: { id: input.id, userId: ctx.auth.userId } });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND' });

      // Clean up GitHub webhook
      if (project.repoOwner && project.repoName && project.repoWebhookId) {
        const githubToken = await getGitHubToken(ctx.auth.userId);
        if (githubToken) {
          await deleteGitHubWebhook({
            accessToken: githubToken.accessToken,
            owner: project.repoOwner,
            repo: project.repoName,
            hookId: project.repoWebhookId,
          }).catch((e) => {
            console.error(`Failed to delete GitHub webhook for project ${input.id}:`, e);
          });
        }
      }

      // Clean up Vercel project
      if (project.vercelProjectId) {
        await deleteVercelProject(project.vercelProjectId).catch((e) => {
          console.error(`Failed to delete Vercel project ${project.vercelProjectId} for project ${input.id}:`, e);
        });
      }

      await prisma.project.delete({ where: { id: input.id } });
      return { success: true };
    }),

  setPublic: protectedProcedure
    .input(z.object({ id: z.string().min(1), isPublic: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const project = await prisma.project.findUnique({ where: { id: input.id, userId: ctx.auth.userId } });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND' });
      return prisma.project.update({ where: { id: input.id }, data: { isPublic: input.isPublic } });
    }),

  getPublic: baseProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }) => {
      const project = await prisma.project.findUnique({
        where: { id: input.id, isPublic: true },
        include: {
          messages: {
            where: { role: 'ASSISTANT', type: 'RESULT' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { fragment: true },
          },
        },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found or not public' });
      return project;
    }),

  // ── Vercel: link project → GitHub repo → auto-deploy on every push ─────────
  // Called after bindRepo succeeds. Creates a Vercel project connected to the
  // GitHub repo — from this point every git push triggers a Vercel deployment.
  linkVercel: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const project = await prisma.project.findUnique({
        where: { id: input.projectId, userId: ctx.auth.userId },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!project.repoOwner || !project.repoName) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Bind a GitHub repo first before linking Vercel',
        });
      }
      if (!process.env.VERCEL_TOKEN) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'VERCEL_TOKEN is not configured on the server',
        });
      }

      // If already linked, just refresh the deploy URL
      if (project.vercelProjectId) {
        const deployUrl = await getLatestDeployUrl(project.vercelProjectId);
        if (deployUrl) {
          await prisma.project.update({
            where: { id: input.projectId },
            data: { vercelDeployUrl: deployUrl },
          });
        }
        return prisma.project.findUnique({ where: { id: input.projectId } });
      }

      const { projectId: vercelProjectId, deployUrl: vercelDeployUrl } = await createVercelProject({
        name: project.name,
        githubOwner: project.repoOwner,
        githubRepo: project.repoName,
      });

      return prisma.project.update({
        where: { id: input.projectId },
        data: { vercelProjectId, vercelDeployUrl },
      });
    }),

  // Refresh deploy URL — called after a new generation to show updated live URL
  refreshVercelUrl: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const project = await prisma.project.findUnique({
        where: { id: input.projectId, userId: ctx.auth.userId },
      });
      if (!project?.vercelProjectId) return null;

      const deployUrl = await getLatestDeployUrl(project.vercelProjectId);
      if (!deployUrl) return null;

      return prisma.project.update({
        where: { id: input.projectId },
        data: { vercelDeployUrl: deployUrl },
      });
    }),

  // Unlink Vercel — deletes the Vercel project
  unlinkVercel: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const project = await prisma.project.findUnique({
        where: { id: input.projectId, userId: ctx.auth.userId },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND' });
      if (project.vercelProjectId) {
        await deleteVercelProject(project.vercelProjectId).catch((e) => {
          console.error(`Failed to delete Vercel project ${project.vercelProjectId} during unlink for project ${input.projectId}:`, e);
        });
      }
      return prisma.project.update({
        where: { id: input.projectId },
        data: { vercelProjectId: null, vercelDeployUrl: null },
      });
    }),

  // ── GitHub two-way sync ────────────────────────────────────────────────────
  pushToGitHub: protectedProcedure
    .input(z.object({ fragmentId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const githubToken = await getGitHubToken(ctx.auth.userId)
      if (!githubToken) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Connect your GitHub account first' })

      const fragment = await prisma.fragment.findFirst({
        where: { id: input.fragmentId, message: { project: { userId: ctx.auth.userId } } },
        include: { message: { include: { project: true } } },
      })
      if (!fragment) throw new TRPCError({ code: 'NOT_FOUND' })

      const project = fragment.message.project
      if (!project.repoOwner || !project.repoName) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Bind a GitHub repo first' })
      }

      const octokit = getOctokit(githubToken.accessToken)

      // 1 — Create isotope/ branch + push files
      const branchName = generateBranchName(fragment.title)
      const { commitSha } = await smartPushToGitHub({
        accessToken: githubToken.accessToken,
        owner: project.repoOwner,
        repo: project.repoName,
        branchName,
        newFiles: fragment.files as Record<string, string>,
        taskSummary: fragment.title,
        autoMerge: false, // platform handles the merge
      })

      // 2 — Open a PR targeting the default branch
      const { data: repoData } = await octokit.repos.get({ owner: project.repoOwner, repo: project.repoName })
      const { data: pr } = await octokit.pulls.create({
        owner: project.repoOwner,
        repo: project.repoName,
        title: `feat: ${fragment.title}`,
        head: branchName,
        base: repoData.default_branch,
        body: `## Isotope Generation\n\n${fragment.title}\n\nGenerated by [Isotope](${process.env.NEXT_PUBLIC_APP_URL}) — auto-merge will complete this PR.`,
      })

      // 3 — Platform auto-merges the PR immediately
      try {
        await octokit.pulls.merge({
          owner: project.repoOwner,
          repo: project.repoName,
          pull_number: pr.number,
          merge_method: 'squash',
          commit_title: `feat: ${fragment.title} (isotope)`,
          commit_message: `Generated by Isotope\n\nBranch: ${branchName}`,
        })
      } catch (e) {
        // If auto-merge fails (e.g. branch protection rules), leave PR open for user
        console.error('[pushToGitHub] Auto-merge failed — PR left open:', e)
      }

      // 4 — Store branchName + prUrl on Fragment
      await prisma.fragment.update({
        where: { id: fragment.id },
        data: { branchName, prUrl: pr.html_url },
      })

      // 5 — Update project lastSyncedAt
      await prisma.project.update({
        where: { id: project.id },
        data: { lastSyncedAt: new Date() },
      })

      return {
        commitSha,
        branchName,
        prUrl: pr.html_url,
        prNumber: pr.number,
      }
    }),

  bindRepo: protectedProcedure
    .input(z.object({
      projectId: z.string().min(1),
      owner: z.string().min(1),
      repo: z.string().min(1),
      createRepo: z.boolean().optional().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const project = await prisma.project.findUnique({
        where: { id: input.projectId, userId: ctx.auth.userId },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND' });

      const githubToken = await getGitHubToken(ctx.auth.userId);
      if (!githubToken) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Connect your GitHub account first' });

      const octokit = getOctokit(githubToken.accessToken);

      // Step 1 — optionally create the GitHub repo
      if (input.createRepo) {
        try {
          await octokit.repos.createForAuthenticatedUser({
            name: input.repo,
            private: true,
            auto_init: true,
            description: `Generated by Isotope — ${project.name}`,
          });
        } catch (e) {
          if ((e as any).status !== 422) throw new TRPCError({ code: 'BAD_REQUEST', message: `Failed to create repo: ${e instanceof Error ? e.message : String(e)}` });
        }
      }

      // Step 2 — register GitHub webhook for inbound sync
      const webhookSecret = crypto.randomBytes(32).toString('hex');
      const hookId = await registerGitHubWebhook({
        accessToken: githubToken.accessToken,
        owner: input.owner,
        repo: input.repo,
        webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/github/webhook`,
        secret: webhookSecret,
      });

      // Step 3 — save GitHub binding
      await prisma.project.update({
        where: { id: input.projectId },
        data: {
          repoOwner: input.owner,
          repoName: input.repo,
          repoWebhookId: hookId,
          repoWebhookSecret: webhookSecret,
        },
      });

      // Step 4 — push existing fragment immediately so first build isn't lost
      const latestMessage = await prisma.message.findFirst({
        where: { projectId: input.projectId, role: 'ASSISTANT', type: 'RESULT' },
        orderBy: { createdAt: 'desc' },
        include: { fragment: true },
      });
      if (latestMessage?.fragment?.files) {
        try {
          await pushFragmentToGitHub({
            accessToken: githubToken.accessToken,
            owner: input.owner,
            repo: input.repo,
            files: latestMessage.fragment.files as { [path: string]: string },
            commitMessage: `feat: initial project — ${latestMessage.fragment.title}`,
          });
          await prisma.project.update({
            where: { id: input.projectId },
            data: { lastSyncedAt: new Date() },
          });
        } catch {}
      }

      // Step 5 — if VERCEL_TOKEN is configured, automatically link Vercel too
      let vercelProjectId: string | null = null;
      let vercelDeployUrl: string | null = null;

      if (process.env.VERCEL_TOKEN) {
        try {
          const result = await createVercelProject({
            name: project.name,
            githubOwner: input.owner,
            githubRepo: input.repo,
          });
          vercelProjectId = result.projectId;
          vercelDeployUrl = result.deployUrl;
        } catch (e) {
          // Don't fail the whole bind if Vercel setup fails
          console.error('Vercel link failed (non-fatal):', e);
        }
      }

      return prisma.project.update({
        where: { id: input.projectId },
        data: { vercelProjectId, vercelDeployUrl },
      });
    }),

  unbindRepo: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const project = await prisma.project.findUnique({
        where: { id: input.projectId, userId: ctx.auth.userId },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND' });

      // Remove GitHub webhook
      const githubToken = await getGitHubToken(ctx.auth.userId);
      if (githubToken && project.repoOwner && project.repoName && project.repoWebhookId) {
        await deleteGitHubWebhook({
          accessToken: githubToken.accessToken,
          owner: project.repoOwner,
          repo: project.repoName,
          hookId: project.repoWebhookId,
        }).catch((e) => {
          console.error(`Failed to delete GitHub webhook during unbind for project ${input.projectId}:`, e);
        });
      }

      // Remove Vercel project
      if (project.vercelProjectId) {
        await deleteVercelProject(project.vercelProjectId).catch((e) => {
          console.error(`Failed to delete Vercel project ${project.vercelProjectId} during unbind for project ${input.projectId}:`, e);
        });
      }

      return prisma.project.update({
        where: { id: input.projectId },
        data: {
          repoOwner: null, repoName: null,
          repoWebhookId: null, repoWebhookSecret: null,
          vercelProjectId: null, vercelDeployUrl: null,
        },
      });
    }),

  deprovisionSupabase: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const project = await prisma.project.findUnique({ where: { id: input.projectId, userId: ctx.auth.userId } });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND' });
      if (project.supabaseProjectId) {
        await deleteSupabaseProject(project.supabaseProjectId).catch((e) => {
          console.error(`Failed to delete Supabase project ${project.supabaseProjectId} for project ${input.projectId}:`, e);
        });
      }
      return prisma.project.update({
        where: { id: input.projectId },
        data: { supabaseProjectId: null, supabaseUrl: null, supabaseAnonKey: null },
      });
    }),

  getConflicts: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const project = await prisma.project.findUnique({ where: { id: input.projectId, userId: ctx.auth.userId } });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND' });
      return prisma.syncConflict.findMany({
        where: { projectId: input.projectId, resolvedBy: null },
        orderBy: { createdAt: 'asc' },
      });
    }),

  resolveConflict: protectedProcedure
    .input(z.object({ id: z.string().min(1), resolvedBy: z.enum(['isotope', 'github']) }))
    .mutation(async ({ input, ctx }) => {
      const conflict = await prisma.syncConflict.findFirst({
        where: { id: input.id, project: { userId: ctx.auth.userId } },
        include: {
          project: {
            include: {
              messages: {
                where: { role: 'ASSISTANT', type: 'RESULT' },
                orderBy: { createdAt: 'desc' },
                take: 1,
                include: { fragment: true },
              },
            },
          },
        },
      });
      if (!conflict) throw new TRPCError({ code: 'NOT_FOUND' });

      const latestFragment = conflict.project.messages[0]?.fragment;
      if (latestFragment && input.resolvedBy === 'github') {
        const files = (latestFragment.files ?? {}) as { [path: string]: string };
        files[conflict.filePath] = conflict.githubContent;
        await prisma.fragment.update({ where: { id: latestFragment.id }, data: { files } });
      }

      return prisma.syncConflict.update({
        where: { id: input.id },
        data: { resolvedBy: input.resolvedBy },
      });
    }),
  // ── Supabase: provision a real database for the generated app ──────────────
  provisionSupabase: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const project = await prisma.project.findUnique({
        where: { id: input.projectId, userId: ctx.auth.userId },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND' });
      await requirePaidPlan(ctx.auth.userId);
      if (!process.env.SUPABASE_ACCESS_TOKEN) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'SUPABASE_ACCESS_TOKEN not configured' });
      }
      if (project.supabaseProjectId) {
        // Already provisioned — return existing credentials
        return { url: project.supabaseUrl!, anonKey: project.supabaseAnonKey! };
      }

      const orgId = await getSupabaseOrganizationId();
      const { id, url, anonKey } = await createSupabaseProject({
        name: project.name,
        organizationId: orgId,
      });

      await prisma.project.update({
        where: { id: input.projectId },
        data: { supabaseProjectId: id, supabaseUrl: url, supabaseAnonKey: anonKey },
      });

      return { url, anonKey };
    }),

  // ── Figma: import a design and generate a project from it ───────────────────
  importFromFigma: protectedProcedure
    .input(z.object({
      figmaUrl: z.string().url(),
      extraPrompt: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await requirePaidPlan(ctx.auth.userId);
      let figmaAccessToken: string | null = null

      const figmaIntegration = await prisma.integrationConfig.findFirst({
        where: { project: { userId: ctx.auth.userId }, provider: 'figma_token' },
        select: { encryptedKey: true, iv: true },
      })
      if (figmaIntegration?.encryptedKey && figmaIntegration.iv) {
        try {
          const { decrypt } = await import('@/lib/encryption')
          figmaAccessToken = decrypt(figmaIntegration.encryptedKey, figmaIntegration.iv)
        } catch { /* fall through */ }
      }

      if (!figmaAccessToken) figmaAccessToken = process.env.FIGMA_ACCESS_TOKEN ?? null

      if (!figmaAccessToken) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'No Figma token found. Please add your personal Figma access token in Settings → Integrations → Figma Token.',
        })
      }

      const { estimateCostFromTaskGraph } = await import('@/lib/usage')
      const figmaEstimate = await estimateCostFromTaskGraph(ctx.auth.userId, { tasks: 1 })
      if (!figmaEstimate.allowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `You have run out of credits. You need at least ${figmaEstimate.estimatedCost} credits but have ${figmaEstimate.balance}.`,
        })
      }

      let figmaResult: { prompt: string; screenshotBase64: string | null; pageName: string }
      const operationalToken = process.env.FIGMA_ACCESS_TOKEN
      try {
        process.env.FIGMA_ACCESS_TOKEN = figmaAccessToken
        figmaResult = await figmaToPrompt(input.figmaUrl)
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Failed to fetch Figma design. Make sure the file is accessible.',
        })
      } finally {
        process.env.FIGMA_ACCESS_TOKEN = operationalToken // restore original token
      }

      const extra = input.extraPrompt ? `\n\nAdditional instructions: ${input.extraPrompt}` : ''
      const fullPrompt = figmaResult.prompt + extra

      const projectName = figmaResult.pageName
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 40) || generateSlug(2, { format: 'kebab' })

      const createdProject = await prisma.project.create({
        data: {
          userId: ctx.auth.userId,
          name: projectName,
          messages: {
            create: {
              content: fullPrompt,
              role: 'USER',
              type: 'RESULT',
              imageUrl: figmaResult.screenshotBase64,
            },
          },
        },
        include: { messages: { select: { id: true }, take: 1 } },
      })
      const figmaMessageId = createdProject.messages[0]?.id
      if (!figmaMessageId) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create message' })

      await inngest.send({
        name: 'code-agent/run',
        data: {
          value: fullPrompt,
          projectId: createdProject.id,
          messageId: figmaMessageId,
          imageUrl: figmaResult.screenshotBase64,
        },
      })

      return createdProject
    }),
  
  
  
  // importFromFigma: protectedProcedure
  //   .input(z.object({
  //     figmaUrl: z.string().url(),
  //     extraPrompt: z.string().max(500).optional(),
  //   }))
  //   .mutation(async ({ input, ctx }) => {
  //     await requirePaidPlan(ctx.auth.userId);
  //     // Resolve Figma token — user's own token takes priority over server env var
  //     // Figma personal tokens are per-user — using a shared token causes 403 errors
  //     let figmaAccessToken: string | null = null

  //     // 1. Try user's own Figma token from IntegrationConfig
  //     const figmaIntegration = await prisma.integrationConfig.findFirst({
  //       where: { project: { userId: ctx.auth.userId }, provider: 'figma_token' },
  //       select: { encryptedKey: true, iv: true },
  //     })
  //     if (figmaIntegration?.encryptedKey && figmaIntegration.iv) {
  //       try {
  //         const { decrypt } = await import('@/lib/encryption')
  //         figmaAccessToken = decrypt(figmaIntegration.encryptedKey, figmaIntegration.iv)
  //       } catch { /* decryption failed — fall through to env var */ }
  //     }

  //     // 2. Fall back to server-wide env var (useful for single-tenant deployments)
  //     if (!figmaAccessToken) figmaAccessToken = process.env.FIGMA_ACCESS_TOKEN ?? null

  //     // 3. Neither configured — give a clear actionable error (not a 500)
  //     if (!figmaAccessToken) {
  //       throw new TRPCError({
  //         code: 'PRECONDITION_FAILED',
  //         message: 'No Figma token found. Please add your personal Figma access token in Settings → Integrations → Figma Token.',
  //       })
  //     }

  //     // Temporarily set for this request scope so figmaToPrompt can use it
  //     process.env.FIGMA_ACCESS_TOKEN = figmaAccessToken

  //     // Preflight credit check before Figma generation
  //     const { estimateCostFromTaskGraph } = await import('@/lib/usage')
  //     const figmaEstimate = await estimateCostFromTaskGraph(ctx.auth.userId, { tasks: 1 })
  //     if (!figmaEstimate.allowed) {
  //       throw new TRPCError({
  //         code: 'TOO_MANY_REQUESTS',
  //         message: `You have run out of credits. You need at least ${figmaEstimate.estimatedCost} credits but have ${figmaEstimate.balance}.`,
  //       })
  //     }

  //     // Use figmaToPrompt which handles everything: fetching, parsing, screenshot, description
  //     let figmaResult: { prompt: string; screenshotBase64: string | null; pageName: string };
  //     try {
  //       figmaResult = await figmaToPrompt(input.figmaUrl);
  //     } catch (e) {
  //       throw new TRPCError({
  //         code: 'BAD_REQUEST',
  //         message: e instanceof Error ? e.message : 'Failed to fetch Figma design. Make sure the file is accessible.',
  //       });
  //     }

  //     const extra = input.extraPrompt ? `\n\nAdditional instructions: ${input.extraPrompt}` : '';
  //     const fullPrompt = figmaResult.prompt + extra;

  //     const projectName = figmaResult.pageName
  //       .toLowerCase()
  //       .replace(/[^a-z0-9\s]/g, '')
  //       .trim()
  //       .replace(/\s+/g, '-')
  //       .slice(0, 40) || generateSlug(2, { format: 'kebab' });

  //     const createdProject = await prisma.project.create({
  //       data: {
  //         userId: ctx.auth.userId,
  //         name: projectName,
  //         messages: {
  //           create: {
  //             content: fullPrompt,
  //             role: 'USER',
  //             type: 'RESULT',
  //             imageUrl: figmaResult.screenshotBase64,
  //           },
  //         },
  //       },
  //       include: { messages: { select: { id: true }, take: 1 } },
  //     });
  //     const figmaMessageId = createdProject.messages[0]?.id
  //     if (!figmaMessageId) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create message' })

  //     await inngest.send({
  //       name: 'code-agent/run',
  //       data: {
  //         value: fullPrompt,
  //         projectId: createdProject.id,
  //         messageId: figmaMessageId,
  //         imageUrl: figmaResult.screenshotBase64,
  //       },
  //     });

  //     return createdProject;
  //   }),

  // ── Figma: get frames from a file URL (for the picker) ──────────────────────

  // ── Figma: list frames (lightweight check before import) ────────────────────
  getFigmaFrames: protectedProcedure
    .input(z.object({ figmaUrl: z.string().url() }))
    .query(async ({ input }) => {
      const token = process.env.FIGMA_ACCESS_TOKEN;
      if (!token) return { frames: [], fileName: '' };

      const parsed = parseFigmaUrl(input.figmaUrl);
      if (!parsed) return { frames: [], fileName: '' };

      try {
        const { fetchFigmaNodes } = await import('@/lib/figma');
        const data = await fetchFigmaNodes(parsed.fileId);
        const fileName = data.name ?? data.document?.name ?? '';

        // Extract top-level frames from first page
        const pages = data.document?.children ?? [];
        const frames: { id: string; name: string }[] = [];
        for (const page of pages) {
          for (const child of page.children ?? []) {
            if (child.type === 'FRAME' || child.type === 'COMPONENT') {
              frames.push({ id: child.id, name: `${page.name} / ${child.name}` });
            }
          }
        }

        return {
          frames: frames.slice(0, 50),
          fileName,
          selectedNodeId: parsed.nodeId,
        };
      } catch {
        return { frames: [], fileName: '' };
      }
    }),

  // ── Save direct file edits back to the fragment ───────────────────────────
  saveFileEdits: protectedProcedure
    .input(z.object({
      fragmentId: z.string().min(1),
      files: z.record(z.string()),  // { [path]: content }
    }))
    .mutation(async ({ input, ctx }) => {
      const fragment = await prisma.fragment.findFirst({
        where: { id: input.fragmentId, message: { project: { userId: ctx.auth.userId } } },
      });
      if (!fragment) throw new TRPCError({ code: 'NOT_FOUND', message: 'Fragment not found' });

      const currentFiles = (fragment.files ?? {}) as { [path: string]: string };
      const updatedFiles = { ...currentFiles, ...input.files };

      return prisma.fragment.update({
        where: { id: input.fragmentId },
        data: { files: updatedFiles },
      });
    }),

  // ── Save project context document ─────────────────────────────────────────
  saveContext: protectedProcedure
    .input(z.object({
      projectId: z.string().min(1),
      contextDocument: z.string().max(8000),
    }))
    .mutation(async ({ input, ctx }) => {
      const project = await prisma.project.findUnique({
        where: { id: input.projectId, userId: ctx.auth.userId },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND' });
      return prisma.project.update({
        where: { id: input.projectId },
        data: { contextDocument: input.contextDocument },
      });
    }),

  // ── Fork a public project into the current user's account ─────────────────
  fork: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      // Source must be public
      const source = await prisma.project.findUnique({
        where: { id: input.projectId, isPublic: true },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            include: { fragment: true },
          },
        },
      });
      if (!source) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found or not public' });

      // Create the forked project
      const forked = await prisma.project.create({
        data: {
          userId: ctx.auth.userId,
          name: `${source.name}-fork`,
          isPublic: false,
        },
      });

      // Copy all messages + fragments
      for (const message of source.messages) {
        const newMessage = await prisma.message.create({
          data: {
            projectId: forked.id,
            content: message.content,
            role: message.role,
            type: message.type,
            imageUrl: message.imageUrl,
          },
        });

        if (message.fragment) {
          await prisma.fragment.create({
            data: {
              messageId: newMessage.id,
              sandboxUrl: message.fragment.sandboxUrl,
              title: message.fragment.title,
              files: message.fragment.files,
            },
          });
        }
      }

      return forked;
    }),

  // ── Custom domain: add to Vercel project ──────────────────────────────────
  addCustomDomain: protectedProcedure
    .input(z.object({
      projectId: z.string().min(1),
      domain: z.string().min(3).max(253).regex(
        /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
        'Please enter a valid domain name (e.g. myapp.com or app.myapp.com)'
      ),
    }))
    .mutation(async ({ input, ctx }) => {
      const project = await prisma.project.findUnique({
        where: { id: input.projectId, userId: ctx.auth.userId },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND' });
      await requirePaidPlan(ctx.auth.userId);
      if (!project.vercelProjectId) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Connect Vercel first before adding a custom domain',
        });
      }

      let domainData: Awaited<ReturnType<typeof addCustomDomain>>
      try {
        domainData = await addCustomDomain(project.vercelProjectId, input.domain)
      } catch (e) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : String(e) })
      }

      await prisma.project.update({
        where: { id: input.projectId },
        data: { customDomain: input.domain },
      });

      return domainData;
    }),

  // ── Custom domain: check verification status ───────────────────────────────
  checkDomainStatus: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const project = await prisma.project.findUnique({
        where: { id: input.projectId, userId: ctx.auth.userId },
      });
      if (!project?.vercelProjectId || !project.customDomain) return null;

      return getDomainStatus(project.vercelProjectId, project.customDomain);
    }),

  // ── Custom domain: remove ─────────────────────────────────────────────────
  removeCustomDomain: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const project = await prisma.project.findUnique({
        where: { id: input.projectId, userId: ctx.auth.userId },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND' });

      if (project.vercelProjectId && project.customDomain) {
        await removeCustomDomain(project.vercelProjectId, project.customDomain).catch((e) => {
          console.error(`Failed to remove custom domain ${project.customDomain} from Vercel project ${project.vercelProjectId} for project ${input.projectId}:`, e);
        });
      }

      return prisma.project.update({
        where: { id: input.projectId },
        data: { customDomain: null },
      });
    }),

  // ── Toggle "Built with Isotope" badge (Pro only) ─────────────────────────────
  toggleBadge: protectedProcedure
    .input(z.object({ projectId: z.string().min(1), hide: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const project = await prisma.project.findUnique({
        where: { id: input.projectId, userId: ctx.auth.userId },
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND' });
      return prisma.project.update({
        where: { id: input.projectId },
        data: { hideBadge: input.hide },
      });
    }),

  // ── Import existing GitHub repo — analyse only, no code written ───────────
  importRepo: protectedProcedure
    .input(z.object({
      repoUrl: z.string().url().refine(
        (u) => /^https:\/\/github\.com\/[^/]+\/[^/]+/.test(u),
        { message: 'Must be a valid github.com/owner/repo URL' },
      ),
    }))
    .mutation(async ({ input, ctx }) => {
      // Parse owner/repo from URL
      const match = input.repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/)
      if (!match) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid GitHub URL' })

      const [, owner, repoRaw] = match
      const repo = repoRaw.replace(/\.git$/, '')

      // Fetch repo metadata via GitHub API (no auth needed for public repos)
      const metaRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      })
      if (!metaRes.ok) {
        if (metaRes.status === 404) throw new TRPCError({ code: 'NOT_FOUND', message: 'Repository not found or is private' })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to reach GitHub API' })
      }

      // Fetch package.json to detect framework/language
      const pkgRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/package.json`,
        { headers: { Accept: 'application/vnd.github+json' } },
      )

      interface AnalysisResult {
        isSupported: boolean
        framework: string
        language: string
        router: string
        styling: string
        database: string
        auth: string
        riskFlags: string[]
        projectId?: string
      }

      const result: AnalysisResult = {
        isSupported: false,
        framework: 'other',
        language: 'javascript',
        router: 'none',
        styling: 'none',
        database: 'none',
        auth: 'none',
        riskFlags: [],
      }

      if (pkgRes.ok) {
        const pkgData = await pkgRes.json()
        const content = Buffer.from(pkgData.content, 'base64').toString('utf-8')
        const pkg = JSON.parse(content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
        const deps = { ...pkg.dependencies, ...pkg.devDependencies }

        // Framework detection
        if (deps['next']) { result.framework = 'nextjs'; result.isSupported = true }
        else if (deps['react']) { result.framework = 'react'; result.isSupported = true }
        else if (deps['vue']) { result.framework = 'vue'; result.isSupported = true }
        else if (deps['svelte']) { result.framework = 'svelte'; result.isSupported = true }
        else result.riskFlags.push('Framework not supported — Isotope works best with Next.js, React, Vue, or Svelte')

        // Language
        if (deps['typescript'] || deps['ts-node']) result.language = 'typescript'

        // Router
        if (result.framework === 'nextjs') {
          result.router = 'app-router' // default assumption for modern Next.js
        }

        // Styling
        if (deps['tailwindcss']) result.styling = 'tailwind'
        else if (deps['styled-components']) result.styling = 'styled-components'
        else if (deps['sass']) result.styling = 'sass'

        // Database
        if (deps['@prisma/client']) result.database = 'prisma'
        else if (deps['@supabase/supabase-js']) result.database = 'supabase'
        else if (deps['drizzle-orm']) result.database = 'drizzle'

        // Auth
        if (deps['@clerk/nextjs']) result.auth = 'clerk'
        else if (deps['next-auth']) result.auth = 'next-auth'
        else if (deps['@supabase/auth-helpers-nextjs']) result.auth = 'supabase'

        // Risk flags
        if (deps['turbo'] || deps['nx']) result.riskFlags.push('Monorepo detected — workspace support is beta')
        if (deps['webpack']) result.riskFlags.push('Custom webpack config — may need manual adjustment')
      } else {
        result.riskFlags.push('No package.json found — manual review recommended')
      }

      // Create a staging project record (not yet visible to user — confirmed in next step)
      const project = await prisma.project.create({
        data: {
          name: `${owner}/${repo}`,
          userId: ctx.auth.userId,
          repoOwner: owner,
          repoName: repo,
          // Store the analysis as the initial architecture map
          contextDocument: JSON.stringify(result),
        },
      })

      // Fire background job to embed all repo files into vector store
      await inngest.send({
        name: 'isotope/repo.imported',
        data: {
          projectId: project.id,
          userId: ctx.auth.userId,
          owner,
          repo,
        },
      })

      return { ...result, projectId: project.id }
    }),

  // ── Confirm import — makes the project live and redirects user to chat ───
  confirmImport: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, userId: ctx.auth.userId },
      })
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' })

      // Project was already created in importRepo — just return the id to redirect
      return { projectId: project.id }
    }),

});
