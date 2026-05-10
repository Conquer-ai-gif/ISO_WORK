// ── Clerk plan helper ─────────────────────────────────────────────────────────
// Reads the user's plan from Clerk publicMetadata safely.
// Clerk billing stores the plan slug in publicMetadata.plan.
//
// IMPORTANT: The slug must match exactly what you set in the Clerk dashboard.
// Default slugs used here: 'free', 'pro', 'team'
// If you named them differently (e.g. 'pro_monthly'), update PLAN_SLUGS below.

import { clerkClient } from '@clerk/nextjs/server'

const PLAN_SLUGS = {
  free: ['free', null, undefined, ''],
  pro:  ['pro', 'pro_monthly', 'pro_yearly'],
  team: ['team', 'team_monthly', 'team_yearly'],
} as const

type PlanTier = 'free' | 'pro' | 'team'

/**
 * Get the user's plan tier from Clerk publicMetadata.
 * Returns 'free' if the plan is unset or unrecognised.
 */
export async function getUserPlanTier(userId: string): Promise<PlanTier> {
  try {
    const client = await clerkClient()
    const user   = await client.users.getUser(userId)
    const raw    = (user.publicMetadata as Record<string, unknown>)?.plan

    if (PLAN_SLUGS.team.includes(raw as string)) return 'team'
    if (PLAN_SLUGS.pro.includes(raw as string))  return 'pro'
    return 'free'
  } catch {
    return 'free'
  }
}

/**
 * Returns member limit for the given plan tier.
 * Free: owner only (no invites)
 * Pro: 3 members total
 * Team: 5 members total
 */
export function getMemberLimit(plan: PlanTier): number {
  switch (plan) {
    case 'team': return 5
    case 'pro':  return 3
    default:     return 1  // free — owner only
  }
}
