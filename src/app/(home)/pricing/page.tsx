import type { Metadata } from 'next'
import { PricingClient } from '@/modules/home/ui/components/pricing-client'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Start free with 5 credits per day. Upgrade to Pro for 100 credits, Supabase databases, Figma import, and custom domains. Team plan for collaborative workspaces.',
}

export default function PricingPage() {
  return <PricingClient />
}
