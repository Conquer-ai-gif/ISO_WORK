import type { Metadata } from 'next'
import { TemplatesClient } from '@/modules/home/ui/components/templates-client'

export const metadata: Metadata = {
  title: 'Templates',
  description: 'Start building instantly with pre-built app templates. E-commerce, dashboards, landing pages, chat apps, and more — one click to generate.',
}

export default function TemplatesPage() {
  return <TemplatesClient />
}
