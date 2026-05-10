// ── Stripe client ─────────────────────────────────────────────────────────────
// Used for one-time credit top-up purchases only.
// Subscription billing (pro/team plans) is handled by Clerk's billing system.
//
// Required env vars:
//   STRIPE_SECRET_KEY          — sk_live_... or sk_test_...
//   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY — pk_live_... or pk_test_...
//   STRIPE_WEBHOOK_SECRET      — whsec_... (from Stripe dashboard)
//   NEXT_PUBLIC_APP_URL        — https://your-domain.com

import Stripe from 'stripe'

// Lazy singleton — only initialised when first used
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
    _stripe = new Stripe(key, { apiVersion: '2024-06-20' })
  }
  return _stripe
}

// ── Credit packages ───────────────────────────────────────────────────────────
// Each package defines: credits (user-facing), price in cents, label, badge

export interface CreditPackage {
  id:          string
  credits:     number    // user-facing credits (e.g. 10)
  units:       number    // internal units (credits × 10)
  amountCents: number    // price in cents
  label:       string    // display price e.g. "$4.99"
  badge?:      string    // optional "Most Popular" etc.
  perCredit:   string    // e.g. "$0.50/credit"
}

export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id:          'credits_25',
    credits:     25,
    units:       250,
    amountCents: 999,
    label:       '$9.99',
    perCredit:   '$0.40/credit',
  },
  {
    id:          'credits_50',
    credits:     50,
    units:       500,
    amountCents: 1799,
    label:       '$17.99',
    badge:       'Most Popular',
    perCredit:   '$0.36/credit',
  },
  {
    id:          'credits_100',
    credits:     100,
    units:       1000,
    amountCents: 2999,
    label:       '$29.99',
    badge:       'Best Value',
    perCredit:   '$0.30/credit',
  },
]
