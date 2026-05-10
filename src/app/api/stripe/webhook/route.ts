// ── Stripe Webhook — handles credit top-up fulfilment ────────────────────────
// Listens for checkout.session.completed events and credits the user's account.
//
// Register this URL in Stripe dashboard:
//   https://your-domain.com/api/stripe/webhook
//
// Events to subscribe to:
//   checkout.session.completed

import { headers }   from 'next/headers'
import { prisma }    from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import * as Sentry   from '@sentry/nextjs'
import type Stripe   from 'stripe'
import type { PurchaseStatus } from '@/generated/prisma'

export async function POST(req: Request) {
  const body          = await req.text()
  const headersList   = await headers()
  const sig           = headersList.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !webhookSecret) {
    return new Response('Missing stripe signature or webhook secret', { status: 400 })
  }

  let event
  try {
    const stripe = getStripe()
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    Sentry.captureException(err, { extra: { context: 'stripe-webhook:verify' } })
    return new Response('Webhook signature verification failed', { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    if (session.payment_status !== 'paid') {
      return new Response('Payment not completed', { status: 200 })
    }

    const metadata  = session.metadata ?? {}
    const userId    = metadata.userId
    const credits   = metadata.credits
    const units     = metadata.units
    const creditInt = parseInt(credits ?? '', 10)
    const unitsInt  = parseInt(units  ?? '', 10)

    if (!userId || isNaN(creditInt) || isNaN(unitsInt)) {
      Sentry.captureMessage('Stripe webhook: missing metadata', {
        extra: { sessionId: session.id },
        level: 'error',
      })
      return new Response('Invalid metadata', { status: 400 })
    }

    try {
      await prisma.$transaction([
        // 1. Add units to user balance
        prisma.credits.upsert({
          where:  { userId },
          update: { balance: { increment: unitsInt } },
          create: {
            userId,
            balance:   unitsInt,
            plan:      'free',
            lastReset: new Date(),
            nextReset: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        }),
        // 2. Log credit event
        prisma.creditEvent.create({
          data: { userId, delta: creditInt, reason: 'plan_upgrade' },
        }),
        // 3. Mark purchase completed
        prisma.creditPurchase.updateMany({
          where: { stripeSessionId: session.id },
          data:  { status: 'completed' as PurchaseStatus, completedAt: new Date() },
        }),
      ])

      console.log(`[stripe-webhook] +${creditInt} credits → user ${userId}`)
    } catch (err) {
      Sentry.captureException(err, {
        extra: { context: 'stripe-webhook:credit', userId, sessionId: session.id },
      })
      return new Response('Failed to credit account', { status: 500 })
    }
  }

  return new Response('OK', { status: 200 })
}
