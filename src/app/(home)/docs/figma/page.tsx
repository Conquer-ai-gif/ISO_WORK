'use client'

import { FigmaIcon } from 'lucide-react'
import { DocsCallout } from '@/components/docs/docs-callout'
import { DocsSteps } from '@/components/docs/docs-steps'

export default function FigmaPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FigmaIcon className="size-5 text-primary" />
          <h1 className="text-2xl font-bold">Figma Import</h1>
        </div>
        <p className="text-muted-foreground">Paste a Figma URL and get matching code generated instantly.</p>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Setting up</h2>
        <DocsSteps steps={[
          { title: 'Get a Figma personal access token', description: 'Go to figma.com → Profile icon (top left) → Settings → Personal access tokens → Generate new token. Copy it — it starts with figd_.' },
          { title: 'Add token to Isotope', description: 'Go to your project → Settings → Integrations → Figma Token. Paste your token and save. Each user needs their own token — Figma tokens only access files your Figma account can view.' },
          { title: 'Copy a Figma frame URL', description: 'In Figma, right-click any frame → Copy link. Make sure the file is set to "Anyone with the link can view".' },
          { title: 'Paste in Isotope', description: 'On the home page click "Import from Figma", paste the URL, and Isotope generates matching code.' },
        ]} />
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">What it generates</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
            <p className="text-xs font-semibold text-green-400 mb-2">Works well with</p>
            {['Simple layouts', 'Card components', 'Landing page sections', 'Navigation bars', 'Form designs'].map(i => (
              <p key={i} className="text-xs text-muted-foreground">✓ {i}</p>
            ))}
          </div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="text-xs font-semibold text-amber-400 mb-2">Limited support</p>
            {['Complex animations', 'Auto-layout edge cases', 'Custom fonts', 'Prototype interactions'].map(i => (
              <p key={i} className="text-xs text-muted-foreground">⚠ {i}</p>
            ))}
          </div>
        </div>
      </div>

      <DocsCallout type="tip">
        For best results, design in Figma using standard components and clear naming. Avoid deeply nested auto-layout groups — they can confuse the import.
      </DocsCallout>
    </div>
  )
}
