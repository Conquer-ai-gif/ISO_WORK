import type { Metadata } from 'next'
import { MarketplaceClient } from '@/modules/home/ui/components/marketplace-client'

export const metadata: Metadata = {
  title: 'Marketplace',
  description: 'Browse community-built app templates. Fork any template and customize it with AI in seconds.',
}

export default function MarketplacePage() {
  return <MarketplaceClient />
}
