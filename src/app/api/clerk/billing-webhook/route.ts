
import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { applyPlanChange } from '@/lib/usage'
import type { Plan } from '@/generated/prisma'

// Maps Clerk plan slugs → our internal Plan enum
const PLAN_MAP: Record<string, Plan> = {
  pro:  'pro',
  team: 'team',
}

export async function POST(req: Request) {
  const body = await req.text()
  const headersList = await headers()

  const wh = new Webhook(process.env.CLERK_BILLING_WEBHOOK_SECRET!)

  // Clerk billing webhooks use proprietary event types not exported by @clerk/nextjs.
  // Typed inline with only the fields we actually access.
  type ClerkBillingEvent = {
    type: string
    data: {
      customer_id?: string
      type?:        string
      status?:      string
      plan?: { slug?: string }
      subscription?: { plan?: { slug?: string } }
    }
  }
  let event: ClerkBillingEvent

  try {
    event = wh.verify(body, {
      'svix-id':        headersList.get('svix-id')!,
      'svix-timestamp': headersList.get('svix-timestamp')!,
      'svix-signature': headersList.get('svix-signature')!,
    })
  } catch {
    return new Response('Invalid webhook', { status: 400 })
  }

  // ── User subscribes to a paid plan ─────────────────────────────────────────
  // Fired when a new subscription item is created (first-time upgrade)
  if (event.type === 'subscriptionItem.created') {
    const userId   = event.data.customer_id as string
    const planSlug = event.data.plan?.slug as string | undefined
    const plan     = planSlug ? PLAN_MAP[planSlug] : undefined

    if (userId && plan) {
      await applyPlanChange(userId, plan, 'plan_upgrade').catch((e) =>
        console.error('Failed to apply plan upgrade:', e),
      )
    }
  }

  // ── Subscription renews (monthly billing cycle) ─────────────────────────────
  // Fired on every payment attempt — filter to type === 'recurring' and
  // status === 'paid' only. All other combinations are handled below.
  if (event.type === 'payment.attempt') {
    const isRecurring = event.data.type === 'recurring'
    const isSuccess   = event.data.status === 'paid'
    const userId      = event.data.customer_id as string
    const planSlug    = event.data.subscription?.plan?.slug as string | undefined
    const plan        = planSlug ? PLAN_MAP[planSlug] : undefined

    if (isRecurring && isSuccess) {
      // ── Successful renewal — restore full plan credits ──────────────────────
      if (userId && plan) {
        await applyPlanChange(userId, plan, 'plan_renewal').catch((e) =>
          console.error('Failed to apply plan renewal:', e),
        )
      }
    } else if (isRecurring && !isSuccess) {
      // ── Failed renewal payment — downgrade user to free plan ────────────────
      // Their paid credits will stop being replenished. They keep whatever
      // balance they have left but lose pro/team task limits immediately.
      if (userId) {
        await applyPlanChange(userId, 'free', 'plan_renewal').catch((e) =>
          console.error('Failed to downgrade user after failed payment:', e),
        )
      }
    }
  }

  // ── User cancels their subscription ────────────────────────────────────────
  // Fired when a subscription item is deleted (user cancels or admin revokes).
  // Downgrade them to free so they lose pro/team task limits immediately.
  // Their remaining balance stays — we don't zero it out on cancellation.
  if (event.type === 'subscriptionItem.deleted') {
    const userId = event.data.customer_id as string

    if (userId) {
      await applyPlanChange(userId, 'free', 'plan_renewal').catch((e) =>
        console.error('Failed to downgrade user after subscription cancellation:', e),
      )
    }
  }

  return new Response('OK', { status: 200 })
}






// import { Webhook } from 'svix'
// import { headers } from 'next/headers'
// import { applyPlanChange } from '@/lib/usage'
// import type { Plan } from '@/generated/prisma'

// // Maps Clerk plan slugs → our internal Plan enum
// const PLAN_MAP: Record<string, Plan> = {
//   pro:  'pro',
//   team: 'team',
// }

// export async function POST(req: Request) {
//   const body = await req.text()
//   const headersList = await headers()

//   const wh = new Webhook(process.env.CLERK_BILLING_WEBHOOK_SECRET!)

//   // Clerk billing webhooks use proprietary event types not exported by @clerk/nextjs.
//   // Typed inline with only the fields we actually access.
//   type ClerkBillingEvent = {
//     type: string
//     data: {
//       customer_id?: string
//       type?:        string
//       status?:      string
//       plan?: { slug?: string }
//       subscription?: { plan?: { slug?: string } }
//     }
//   }
//   let event: ClerkBillingEvent

//   try {
//     event = wh.verify(body, {
//       'svix-id':        headersList.get('svix-id')!,
//       'svix-timestamp': headersList.get('svix-timestamp')!,
//       'svix-signature': headersList.get('svix-signature')!,
//     })
//   } catch {
//     return new Response('Invalid webhook', { status: 400 })
//   }

//   // ── User subscribes to a paid plan ─────────────────────────────────────────
//   // Fired when a new subscription item is created (first-time upgrade)
//   if (event.type === 'subscriptionItem.created') {
//     const userId   = event.data.customer_id as string
//     const planSlug = event.data.plan?.slug as string | undefined
//     const plan     = planSlug ? PLAN_MAP[planSlug] : undefined

//     if (userId && plan) {
//       await applyPlanChange(userId, plan, 'plan_upgrade').catch((e) =>
//         console.error('Failed to apply plan upgrade:', e),
//       )
//     }
//   }

//   // ── Subscription renews (monthly billing cycle) ─────────────────────────────
//   // Fired on every payment attempt — filter to type === 'recurring' only
//   if (event.type === 'payment.attempt') {
//     const isRecurring = event.data.type === 'recurring'
//     const isSuccess   = event.data.status === 'paid'

//     if (!isRecurring || !isSuccess) {
//       return new Response('OK', { status: 200 })
//     }

//     const userId   = event.data.customer_id as string
//     const planSlug = event.data.subscription?.plan?.slug as string | undefined
//     const plan     = planSlug ? PLAN_MAP[planSlug] : undefined

//     if (userId && plan) {
//       await applyPlanChange(userId, plan, 'plan_renewal').catch((e) =>
//         console.error('Failed to apply plan renewal:', e),
//       )
//     }
//   }

//   return new Response('OK', { status: 200 })
// }
