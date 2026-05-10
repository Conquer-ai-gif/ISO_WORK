import type { Metadata } from 'next'
import { DocsClient } from '@/modules/home/ui/components/docs-client'

export const metadata: Metadata = {
  title: 'Documentation',
  description: 'Everything you need to build, deploy, and scale with Isotope. Guides for AI generation, billing, GitHub sync, Vercel deploy, Supabase, Figma import, team workspaces, Visual Edit, Task Board, Changelog, and email notifications.',
}

export default function DocsPage() {
  return <DocsClient />
}
