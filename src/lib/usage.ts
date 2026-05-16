// // ══════════════════════════════════════════════════════════════════════════════
// // Usage & Billing V2
// // ══════════════════════════════════════════════════════════════════════════════
// //
// // V2 upgrades over V1:
// //   - Dynamic cost model: different operations cost different amounts
// //   - Integer-scaled credits (×10 internally) — no schema migration needed
// //     Free plan = 50 units, displayed as 5 credits to the user
// //   - Atomic credit deduction via updateMany — race-condition safe
// //   - Preflight cost estimation before execution
// //   - Plan-based capability enforcement (maxTasks, maxFixLoops)
// //   - Granular per-operation event logging
// //
// // USER-FACING CREDITS vs INTERNAL UNITS:
// //   All public-facing numbers use credits (divide by CREDIT_SCALE).
// //   All DB operations use units (raw integer). This lets us charge 0.2 credits
// //   (= 2 units) per task without touching the schema.
// //
// // ══════════════════════════════════════════════════════════════════════════════

// import { prisma } from '@/lib/db'
// import { auth }   from '@clerk/nextjs/server'
// import type { Plan, CreditEventReason } from '@/generated/prisma'

// // ── Credit scale factor ───────────────────────────────────────────────────────
// // 1 credit = 10 internal units. Lets us do fractional credit costs without
// // changing the DB schema (balance remains Int).
// const CREDIT_SCALE = 10

// // ── Operation costs (in internal units) ───────────────────────────────────────
// // Displayed to users as: units / CREDIT_SCALE = credits
// // e.g. COSTS.task = 2 units = 0.2 credits per task
// export const COSTS = {
//   base:      2,   // 0.2 credits — always charged per generation
//   task:      2,   // 0.2 credits per task executed
//   search:    3,   // 0.3 credits per search/doc fetch
//   fix:       2,   // 0.2 credits per fix loop
//   embedding: 1,   // 0.1 credits per vector embedding
// } as const

// // ── Plan config ───────────────────────────────────────────────────────────────
// // balance stored in DB = credits × CREDIT_SCALE
// export const PLAN_CREDITS: Record<Plan, number> = {
//   free: 5,    // 5 credits = 50 units in DB
//   pro:  100,  // 100 credits = 1000 units
//   team: 300,  // 300 credits = 3000 units
// }

// // Plan-based feature limits — enforced during task graph execution
// export const PLAN_FEATURES: Record<Plan, { maxTasks: number; maxFixLoops: number }> = {
//   free: { maxTasks: 3,  maxFixLoops: 1 },
//   pro:  { maxTasks: 10, maxFixLoops: 3 },
//   team: { maxTasks: 30, maxFixLoops: 10 },
// }

// const REFERRAL_BONUS = 5  // credits (not units — applied as credits × CREDIT_SCALE)

// // ── Usage breakdown ───────────────────────────────────────────────────────────

// export interface UsageBreakdown {
//   tasks?:      number
//   searches?:   number
//   fixes?:      number
//   embeddings?: number
// }

// /**
//  * Calculate total cost in internal units.
//  * Always includes the base cost.
//  *
//  * @example
//  * calculateCost({ tasks: 3, searches: 1, fixes: 1 })
//  * // → 2 + (3×2) + (1×3) + (1×2) = 13 units = 1.3 credits
//  */
// export function calculateCost(breakdown: UsageBreakdown): number {
//   return (
//     COSTS.base +
//     (breakdown.tasks      ?? 0) * COSTS.task +
//     (breakdown.searches   ?? 0) * COSTS.search +
//     (breakdown.fixes      ?? 0) * COSTS.fix +
//     (breakdown.embeddings ?? 0) * COSTS.embedding
//   )
// }

// /** Convert internal units to user-facing credits (1 decimal place) */
// export function unitsToCredits(units: number): number {
//   return Math.round((units / CREDIT_SCALE) * 10) / 10
// }

// // ── Helpers ───────────────────────────────────────────────────────────────────

// function addDays(date: Date, days: number): Date {
//   return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
// }

// async function logEvent(
//   userId: string,
//   delta:  number,
//   reason: CreditEventReason,
// ): Promise<void> {
//   await prisma.creditEvent.create({ data: { userId, delta, reason } })
// }

// // ── Init credits for new user ─────────────────────────────────────────────────

// export async function initCredits(userId: string): Promise<void> {
//   const now       = new Date()
//   const nextReset = addDays(now, 30)
//   const balance   = PLAN_CREDITS.free * CREDIT_SCALE  // 5 credits × 10 = 50 units

//   await prisma.credits.upsert({
//     where:  { userId },
//     update: {},
//     create: { userId, balance, plan: 'free', lastReset: now, nextReset },
//   })

//   await logEvent(userId, PLAN_CREDITS.free, 'signup')
// }

// // ── Preflight cost estimation ─────────────────────────────────────────────────

// export interface CostEstimate {
//   estimatedCost: number   // in credits (user-facing)
//   balance:       number   // current balance in credits
//   allowed:       boolean
//   breakdown:     UsageBreakdown
// }

// /**
//  * Estimate the cost of executing a task graph before running it.
//  * Returns whether the user has enough credits to proceed.
//  */
// export async function estimateCostFromTaskGraph(
//   userId:    string,
//   breakdown: UsageBreakdown,
// ): Promise<CostEstimate> {
//   const credits = await prisma.credits.findUnique({ where: { userId } })
//   const balanceUnits = credits?.balance ?? 0
//   const costUnits    = calculateCost(breakdown)

//   return {
//     estimatedCost: unitsToCredits(costUnits),
//     balance:       unitsToCredits(balanceUnits),
//     allowed:       balanceUnits >= costUnits,
//     breakdown,
//   }
// }

// // ── Atomic credit consumption (V2) ───────────────────────────────────────────

// export interface ConsumeCreditsOptions {
//   userId:    string
//   breakdown: UsageBreakdown
//   reason?:   CreditEventReason
// }

// /**
//  * Atomically deduct credits after execution completes.
//  *
//  * Uses updateMany with a balance check in the WHERE clause —
//  * if balance < cost, the update affects 0 rows and we throw.
//  * This prevents race conditions without needing a transaction.
//  *
//  * IMPORTANT: Call this AFTER execution, not before.
//  */
// export async function consumeCreditsV2(opts: ConsumeCreditsOptions): Promise<void> {
//   const { userId, breakdown, reason = 'generation' } = opts
//   const costUnits = calculateCost(breakdown)

//   // Ensure the credits record exists
//   let credits = await prisma.credits.findUnique({ where: { userId } })
//   if (!credits) {
//     await initCredits(userId)
//     credits = await prisma.credits.findUnique({ where: { userId } })
//     if (!credits) throw new Error('Failed to initialize credits')
//   }

//   // Atomic deduction — WHERE balance >= cost prevents overdraft
//   const result = await prisma.credits.updateMany({
//     where: { userId, balance: { gte: costUnits } },
//     data:  { balance: { decrement: costUnits } },
//   })

//   if (result.count === 0) {
//     throw new Error(
//       `Insufficient credits. Required: ${unitsToCredits(costUnits)} credits, ` +
//       `available: ${unitsToCredits(credits.balance)} credits.`,
//     )
//   }

//   // Log each operation type separately for granular analytics
//   await logEvent(userId, -costUnits, reason)
// }

// // ── Legacy single-credit consume (V1 — kept for backwards compat) ─────────────
// // Used by message/project procedures that haven't been upgraded yet.
// // These charge 1 full credit (= CREDIT_SCALE units) upfront.

// export async function consumeCredits(ownerUserId?: string): Promise<void> {
//   const { userId: actorId } = await auth()
//   if (!actorId) throw new Error('User not authenticated')

//   const chargeId   = ownerUserId ?? actorId
//   const costUnits  = CREDIT_SCALE  // 1 credit = 10 units

//   let credits = await prisma.credits.findUnique({ where: { userId: chargeId } })
//   if (!credits) {
//     await initCredits(chargeId)
//     credits = await prisma.credits.findUnique({ where: { userId: chargeId } })
//     if (!credits) throw new Error('Failed to initialize credits')
//   }

//   if (credits.balance < costUnits) throw new Error('Insufficient credits')

//   await prisma.credits.update({
//     where: { userId: chargeId },
//     data:  { balance: { decrement: costUnits } },
//   })

//   await logEvent(chargeId, -CREDIT_SCALE, 'generation')
// }

// // ── Get current credit status ─────────────────────────────────────────────────

// export async function getUsageStatus(userId?: string) {
//   const uid = userId ?? (await auth()).userId
//   if (!uid) throw new Error('User not authenticated')

//   const credits = await prisma.credits.findUnique({ where: { userId: uid } })
//   if (!credits) return { balance: 0, plan: 'free' as Plan, nextReset: new Date() }

//   return {
//     // Convert internal units back to user-facing credits
//     balance:   Math.max(0, Math.round(credits.balance / CREDIT_SCALE)),
//     plan:      credits.plan,
//     nextReset: credits.nextReset,
//   }
// }

// // ── Plan change (upgrade / renewal) ──────────────────────────────────────────

// export async function applyPlanChange(
//   userId:  string,
//   newPlan: Plan,
//   reason:  Extract<CreditEventReason, 'plan_upgrade' | 'plan_renewal'>,
// ): Promise<void> {
//   const now        = new Date()
//   const nextReset  = addDays(now, 30)
//   const newBalance = PLAN_CREDITS[newPlan] * CREDIT_SCALE

//   await prisma.credits.upsert({
//     where:  { userId },
//     update: { plan: newPlan, balance: newBalance, lastReset: now, nextReset },
//     create: { userId, plan: newPlan, balance: newBalance, lastReset: now, nextReset },
//   })

//   await logEvent(userId, PLAN_CREDITS[newPlan], reason)
// }

// // ── Daily free-tier top-up ────────────────────────────────────────────────────

// export async function resetFreeCredits(): Promise<number> {
//   const now           = new Date()
//   const maxBalanceUnits = PLAN_CREDITS.free * CREDIT_SCALE  // 50 units

//   const result = await prisma.credits.updateMany({
//     where: { plan: 'free', balance: { lt: maxBalanceUnits } },
//     data:  { balance: maxBalanceUnits, lastReset: now },
//   })

//   return result.count
// }

// // ── Referral helpers ──────────────────────────────────────────────────────────

// export async function getOrCreateReferralCode(userId: string): Promise<string> {
//   const existing = await prisma.referral.findUnique({ where: { ownerId: userId } })
//   if (existing) return existing.code
//   const code     = Math.random().toString(36).slice(2, 10)
//   const referral = await prisma.referral.create({ data: { code, ownerId: userId } })
//   return referral.code
// }

// export async function applyReferralCode(
//   newUserId: string,
//   code:      string,
// ): Promise<{ success: boolean; message: string }> {
//   const referral = await prisma.referral.findUnique({
//     where: { code: code.toLowerCase().trim() },
//   })
//   if (!referral)
//     return { success: false, message: 'Invalid referral code' }
//   if (referral.ownerId === newUserId)
//     return { success: false, message: 'Cannot use your own referral code' }

//   const alreadyUsed = await prisma.referralUse.findUnique({ where: { newUserId } })
//   if (alreadyUsed)
//     return { success: false, message: 'You have already used a referral code' }

//   await prisma.referralUse.create({ data: { referralId: referral.id, newUserId } })

//   const bonusUnits = REFERRAL_BONUS * CREDIT_SCALE
//   await prisma.credits.updateMany({
//     where: { userId: { in: [referral.ownerId, newUserId] } },
//     data:  { balance: { increment: bonusUnits } },
//   })

//   await logEvent(referral.ownerId, REFERRAL_BONUS, 'referral')
//   await logEvent(newUserId,        REFERRAL_BONUS, 'referral')

//   return {
//     success: true,
//     message: `${REFERRAL_BONUS} bonus credits added to both accounts`,
//   }
// }


// ══════════════════════════════════════════════════════════════════════════════
// Usage & Billing V2
// ══════════════════════════════════════════════════════════════════════════════
//
// V2 upgrades over V1:
//   - Dynamic cost model: different operations cost different amounts
//   - Integer-scaled credits (×10 internally) — no schema migration needed
//     Free plan = 50 units, displayed as 5 credits to the user
//   - Atomic credit deduction via updateMany — race-condition safe
//   - Preflight cost estimation before execution
//   - Plan-based capability enforcement (maxTasks, maxFixLoops)
//   - Granular per-operation event logging
//
// USER-FACING CREDITS vs INTERNAL UNITS:
//   All public-facing numbers use credits (divide by CREDIT_SCALE).
//   All DB operations use units (raw integer). This lets us charge 0.2 credits
//   (= 2 units) per task without touching the schema.
//
// ══════════════════════════════════════════════════════════════════════════════

import { prisma } from '@/lib/db'
import { auth }   from '@clerk/nextjs/server'
import type { Plan, CreditEventReason } from '@/generated/prisma'

// ── Credit scale factor ───────────────────────────────────────────────────────
// 1 credit = 10 internal units. Lets us do fractional credit costs without
// changing the DB schema (balance remains Int).
const CREDIT_SCALE = 10

// ── Operation costs (in internal units) ───────────────────────────────────────
// Displayed to users as: units / CREDIT_SCALE = credits
// e.g. COSTS.task = 2 units = 0.2 credits per task
export const COSTS = {
  base:      2,   // 0.2 credits — always charged per generation
  task:      2,   // 0.2 credits per task executed
  search:    3,   // 0.3 credits per search/doc fetch
  fix:       2,   // 0.2 credits per fix loop
  embedding: 1,   // 0.1 credits per vector embedding
} as const

// ── Plan config ───────────────────────────────────────────────────────────────
// balance stored in DB = credits × CREDIT_SCALE
export const PLAN_CREDITS: Record<Plan, number> = {
  free: 5,    // 5 credits = 50 units in DB
  pro:  100,  // 100 credits = 1000 units
  team: 300,  // 300 credits = 3000 units
}

// Plan-based feature limits — enforced during task graph execution
export const PLAN_FEATURES: Record<Plan, { maxTasks: number; maxFixLoops: number }> = {
  free: { maxTasks: 3,  maxFixLoops: 1 },
  pro:  { maxTasks: 10, maxFixLoops: 3 },
  team: { maxTasks: 30, maxFixLoops: 10 },
}

const REFERRAL_BONUS = 5  // credits (not units — applied as credits × CREDIT_SCALE)

// ── Usage breakdown ───────────────────────────────────────────────────────────

export interface UsageBreakdown {
  tasks?:      number
  searches?:   number
  fixes?:      number
  embeddings?: number
}

/**
 * Calculate total cost in internal units.
 * Always includes the base cost.
 *
 * @example
 * calculateCost({ tasks: 3, searches: 1, fixes: 1 })
 * // → 2 + (3×2) + (1×3) + (1×2) = 13 units = 1.3 credits
 */
export function calculateCost(breakdown: UsageBreakdown): number {
  return (
    COSTS.base +
    (breakdown.tasks      ?? 0) * COSTS.task +
    (breakdown.searches   ?? 0) * COSTS.search +
    (breakdown.fixes      ?? 0) * COSTS.fix +
    (breakdown.embeddings ?? 0) * COSTS.embedding
  )
}

/** Convert internal units to user-facing credits (1 decimal place) */
export function unitsToCredits(units: number): number {
  return Math.round((units / CREDIT_SCALE) * 10) / 10
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

async function logEvent(
  userId: string,
  delta:  number,
  reason: CreditEventReason,
): Promise<void> {
  await prisma.creditEvent.create({ data: { userId, delta, reason } })
}

// ── Init credits for new user ─────────────────────────────────────────────────

export async function initCredits(userId: string): Promise<void> {
  const now       = new Date()
  const nextReset = addDays(now, 30)
  const balance   = PLAN_CREDITS.free * CREDIT_SCALE  // 5 credits × 10 = 50 units

  await prisma.credits.upsert({
    where:  { userId },
    update: {},
    create: { userId, balance, plan: 'free', lastReset: now, nextReset },
  })

  await logEvent(userId, PLAN_CREDITS.free, 'signup')
}

// ── Preflight cost estimation ─────────────────────────────────────────────────

export interface CostEstimate {
  estimatedCost: number   // in credits (user-facing)
  balance:       number   // current balance in credits
  allowed:       boolean
  breakdown:     UsageBreakdown
}

/**
 * Estimate the cost of executing a task graph before running it.
 * Returns whether the user has enough credits to proceed.
 */
export async function estimateCostFromTaskGraph(
  userId:    string,
  breakdown: UsageBreakdown,
): Promise<CostEstimate> {
  let credits = await prisma.credits.findUnique({ where: { userId } })

  // Auto-init credits if the row doesn't exist yet.
  // This handles two cases:
  //   1. Clerk webhook fired but initCredits failed silently
  //   2. User submits a prompt before the webhook fires (race condition)
  if (!credits) {
    await initCredits(userId)
    credits = await prisma.credits.findUnique({ where: { userId } })
  }

  const balanceUnits = credits?.balance ?? 0
  const costUnits    = calculateCost(breakdown)

  return {
    estimatedCost: unitsToCredits(costUnits),
    balance:       unitsToCredits(balanceUnits),
    allowed:       balanceUnits >= costUnits,
    breakdown,
  }
}

// ── Atomic credit consumption (V2) ───────────────────────────────────────────

export interface ConsumeCreditsOptions {
  userId:    string
  breakdown: UsageBreakdown
  reason?:   CreditEventReason
}

/**
 * Atomically deduct credits after execution completes.
 *
 * Uses updateMany with a balance check in the WHERE clause —
 * if balance < cost, the update affects 0 rows and we throw.
 * This prevents race conditions without needing a transaction.
 *
 * IMPORTANT: Call this AFTER execution, not before.
 */
export async function consumeCreditsV2(opts: ConsumeCreditsOptions): Promise<void> {
  const { userId, breakdown, reason = 'generation' } = opts
  const costUnits = calculateCost(breakdown)

  // Ensure the credits record exists
  let credits = await prisma.credits.findUnique({ where: { userId } })
  if (!credits) {
    await initCredits(userId)
    credits = await prisma.credits.findUnique({ where: { userId } })
    if (!credits) throw new Error('Failed to initialize credits')
  }

  // Atomic deduction — WHERE balance >= cost prevents overdraft
  const result = await prisma.credits.updateMany({
    where: { userId, balance: { gte: costUnits } },
    data:  { balance: { decrement: costUnits } },
  })

  if (result.count === 0) {
    throw new Error(
      `Insufficient credits. Required: ${unitsToCredits(costUnits)} credits, ` +
      `available: ${unitsToCredits(credits.balance)} credits.`,
    )
  }

  // Log each operation type separately for granular analytics
  await logEvent(userId, -costUnits, reason)
}

// ── Legacy single-credit consume (V1 — kept for backwards compat) ─────────────
// Used by message/project procedures that haven't been upgraded yet.
// These charge 1 full credit (= CREDIT_SCALE units) upfront.

export async function consumeCredits(ownerUserId?: string): Promise<void> {
  const { userId: actorId } = await auth()
  if (!actorId) throw new Error('User not authenticated')

  const chargeId   = ownerUserId ?? actorId
  const costUnits  = CREDIT_SCALE  // 1 credit = 10 units

  let credits = await prisma.credits.findUnique({ where: { userId: chargeId } })
  if (!credits) {
    await initCredits(chargeId)
    credits = await prisma.credits.findUnique({ where: { userId: chargeId } })
    if (!credits) throw new Error('Failed to initialize credits')
  }

  if (credits.balance < costUnits) throw new Error('Insufficient credits')

  await prisma.credits.update({
    where: { userId: chargeId },
    data:  { balance: { decrement: costUnits } },
  })

  await logEvent(chargeId, -CREDIT_SCALE, 'generation')
}

// ── Get current credit status ─────────────────────────────────────────────────

export async function getUsageStatus(userId?: string) {
  const uid = userId ?? (await auth()).userId
  if (!uid) throw new Error('User not authenticated')

  const credits = await prisma.credits.findUnique({ where: { userId: uid } })
  if (!credits) return { balance: 0, plan: 'free' as Plan, nextReset: new Date() }

  return {
    // Convert internal units back to user-facing credits
    balance:   Math.max(0, Math.round(credits.balance / CREDIT_SCALE)),
    plan:      credits.plan,
    nextReset: credits.nextReset,
  }
}

// ── Plan change (upgrade / renewal) ──────────────────────────────────────────

export async function applyPlanChange(
  userId:  string,
  newPlan: Plan,
  reason:  Extract<CreditEventReason, 'plan_upgrade' | 'plan_renewal'>,
): Promise<void> {
  const now        = new Date()
  const nextReset  = addDays(now, 30)
  const newBalance = PLAN_CREDITS[newPlan] * CREDIT_SCALE

  await prisma.credits.upsert({
    where:  { userId },
    update: { plan: newPlan, balance: newBalance, lastReset: now, nextReset },
    create: { userId, plan: newPlan, balance: newBalance, lastReset: now, nextReset },
  })

  await logEvent(userId, PLAN_CREDITS[newPlan], reason)
}

// ── Daily free-tier top-up ────────────────────────────────────────────────────

export async function resetFreeCredits(): Promise<number> {
  const now           = new Date()
  const maxBalanceUnits = PLAN_CREDITS.free * CREDIT_SCALE  // 50 units

  const result = await prisma.credits.updateMany({
    where: { plan: 'free', balance: { lt: maxBalanceUnits } },
    data:  { balance: maxBalanceUnits, lastReset: now },
  })

  return result.count
}

// ── Referral helpers ──────────────────────────────────────────────────────────

export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const existing = await prisma.referral.findUnique({ where: { ownerId: userId } })
  if (existing) return existing.code
  const code     = Math.random().toString(36).slice(2, 10)
  const referral = await prisma.referral.create({ data: { code, ownerId: userId } })
  return referral.code
}

export async function applyReferralCode(
  newUserId: string,
  code:      string,
): Promise<{ success: boolean; message: string }> {
  const referral = await prisma.referral.findUnique({
    where: { code: code.toLowerCase().trim() },
  })
  if (!referral)
    return { success: false, message: 'Invalid referral code' }
  if (referral.ownerId === newUserId)
    return { success: false, message: 'Cannot use your own referral code' }

  const alreadyUsed = await prisma.referralUse.findUnique({ where: { newUserId } })
  if (alreadyUsed)
    return { success: false, message: 'You have already used a referral code' }

  await prisma.referralUse.create({ data: { referralId: referral.id, newUserId } })

  const bonusUnits = REFERRAL_BONUS * CREDIT_SCALE
  await prisma.credits.updateMany({
    where: { userId: { in: [referral.ownerId, newUserId] } },
    data:  { balance: { increment: bonusUnits } },
  })

  await logEvent(referral.ownerId, REFERRAL_BONUS, 'referral')
  await logEvent(newUserId,        REFERRAL_BONUS, 'referral')

  return {
    success: true,
    message: `${REFERRAL_BONUS} bonus credits added to both accounts`,
  }
}