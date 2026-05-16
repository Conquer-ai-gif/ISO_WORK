import { prisma } from '@/lib/db'
import { protectedProcedure, createTRPCRouter } from '@/trpc/init'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { encrypt, maskKey } from '@/lib/encryption'
import { IntegrationProvider } from '@/generated/prisma'

// ── Maps each known provider to its sandbox env var name ─────────────────────
// custom provider uses IntegrationConfig.customEnvVar at runtime
export const PROVIDER_ENV_MAP: Record<Exclude<IntegrationProvider, 'custom'>, string> = {
  resend:                 'RESEND_API_KEY',
  supabase_url:           'NEXT_PUBLIC_SUPABASE_URL',
  supabase_anon_key:      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  supabase_service_key:   'SUPABASE_SERVICE_ROLE_KEY',
  stripe_secret_key:      'STRIPE_SECRET_KEY',
  stripe_publishable_key: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  openrouter_api_key:     'OPENROUTER_API_KEY',
  openai_api_key:         'OPENAI_API_KEY',
  figma_token:            'FIGMA_ACCESS_TOKEN',
}

/** Resolve the sandbox env var name for any provider, including custom */
export function resolveEnvVar(provider: IntegrationProvider, customEnvVar?: string | null): string {
  if (provider === 'custom') return customEnvVar ?? ''
  return PROVIDER_ENV_MAP[provider]
}

// ── Format validation per provider ───────────────────────────────────────────
const PROVIDER_VALIDATORS: Partial<Record<IntegrationProvider, RegExp>> = {
  resend:                 /^re_/,
  stripe_secret_key:      /^sk_(live|test)_/,
  stripe_publishable_key: /^pk_(live|test)_/,
  openrouter_api_key:     /^sk-or-/,
  openai_api_key:         /^sk-/,
  figma_token:            /^figd_/,
}

function validateKeyFormat(provider: IntegrationProvider, key: string): void {
  const pattern = PROVIDER_VALIDATORS[provider]
  if (pattern && !pattern.test(key)) {
    const examples: Partial<Record<IntegrationProvider, string>> = {
      resend:                 're_...',
      stripe_secret_key:      'sk_live_... or sk_test_...',
      stripe_publishable_key: 'pk_live_... or pk_test_...',
      openrouter_api_key:     'sk-or-...',
      openai_api_key:         'sk-...',
      figma_token:            'figd_...',
    }
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Invalid key format for ${provider}. Expected: ${examples[provider] ?? 'valid key'}`,
    })
  }
}

// ── Helper to verify project ownership ───────────────────────────────────────
async function requireProjectAccess(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [
        { userId },
        { workspace: { members: { some: { userId } } } },
      ],
    },
  })
  if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' })
  return project
}

export const integrationsRouter = createTRPCRouter({

  // ── List integrations for a project — keys are masked, never plaintext ────
  getMany: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      await requireProjectAccess(input.projectId, ctx.auth.userId)

      const configs = await prisma.integrationConfig.findMany({
        where: { projectId: input.projectId },
        orderBy: { provider: 'asc' },
      })

      // Return masked keys only — plaintext never leaves the server
      return configs.map((c) => ({
        id: c.id,
        projectId: c.projectId,
        provider: c.provider,
        customEnvVar: c.customEnvVar,
        maskedKey: '••••••••',
        envVar: resolveEnvVar(c.provider, c.customEnvVar),
        updatedAt: c.updatedAt,
      }))
    }),

  // ── Upsert an integration key — validates format, encrypts, saves ─────────
  upsert: protectedProcedure
    .input(z.object({
      projectId:    z.string().min(1),
      provider:     z.nativeEnum(IntegrationProvider),
      key:          z.string().min(1).max(512),
      customEnvVar: z.string().min(1).max(64).regex(/^[A-Z][A-Z0-9_]*$/, {
        message: 'Env var name must be uppercase letters, numbers, and underscores (e.g. TWILIO_AUTH_TOKEN)',
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess(input.projectId, ctx.auth.userId)

      // custom provider requires a customEnvVar name
      if (input.provider === 'custom' && !input.customEnvVar) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'A custom env var name is required for custom keys (e.g. TWILIO_AUTH_TOKEN)',
        })
      }

      validateKeyFormat(input.provider, input.key.trim())

      const { encryptedKey, iv } = encrypt(input.key.trim())

      await prisma.integrationConfig.upsert({
        where: {
          projectId_provider: {
            projectId: input.projectId,
            provider: input.provider,
          },
        },
        create: {
          projectId: input.projectId,
          provider: input.provider,
          encryptedKey,
          iv,
          customEnvVar: input.provider === 'custom' ? input.customEnvVar : null,
        },
        update: {
          encryptedKey,
          iv,
          customEnvVar: input.provider === 'custom' ? input.customEnvVar : null,
          updatedAt: new Date(),
        },
      })

      return { success: true, provider: input.provider }
    }),

  // ── Delete an integration key ─────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({
      projectId: z.string().min(1),
      provider:  z.nativeEnum(IntegrationProvider),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess(input.projectId, ctx.auth.userId)

      await prisma.integrationConfig.deleteMany({
        where: { projectId: input.projectId, provider: input.provider },
      })

      return { success: true }
    }),
})

