'use client'

import { DocsCallout } from '@/components/docs/docs-callout'
import { DocsSteps } from '@/components/docs/docs-steps'
import {
  PaintbrushIcon, PaletteIcon, TypeIcon, MoveIcon, LayoutIcon,
  MousePointerClickIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'

const MODES = [
  {
    id: 'color',
    label: 'Colors',
    icon: PaletteIcon,
    colour: 'text-pink-400',
    bg: 'bg-pink-500/10 border-pink-500/20',
    desc: 'Change backgrounds, text colours, border colours, and gradients without touching layout or content.',
    examples: ['Make background dark / #09090b', 'Change primary colour to violet', 'Add a subtle gradient to hero'],
  },
  {
    id: 'text',
    label: 'Text',
    icon: TypeIcon,
    colour: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
    desc: 'Adjust font sizes, weights, line heights, and letter spacing. Targets typography only.',
    examples: ['Increase heading size', 'Make body text lighter weight', 'Use a mono font for code blocks'],
  },
  {
    id: 'spacing',
    label: 'Spacing',
    icon: MoveIcon,
    colour: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
    desc: 'Tweak padding, margins, and gaps between elements. Keeps everything else intact.',
    examples: ['Add more padding to cards', 'Tighten gap between sections', 'More breathing room in navbar'],
  },
  {
    id: 'layout',
    label: 'Layout',
    icon: LayoutIcon,
    colour: 'text-green-400',
    bg: 'bg-green-500/10 border-green-500/20',
    desc: 'Rearrange elements, change flex/grid direction, move sidebars, reorder sections.',
    examples: ['Stack cards vertically on mobile', 'Centre the hero content', 'Make 3-column grid 2-column'],
  },
]

export default function VisualEditPage() {
  const [activeMode, setActiveMode] = useState('color')
  const active = MODES.find(m => m.id === activeMode)!

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <PaintbrushIcon className="size-5 text-primary" />
          <h1 className="text-2xl font-bold">Visual Edit</h1>
        </div>
        <p className="text-muted-foreground">
          Make targeted style changes to your generated app without rewriting your whole prompt.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">How it works</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Visual Edit lets you tweak the look of your app in four focused modes — Colors, Text, Spacing, and Layout.
          Instead of sending a vague "make it look better" prompt, you pick a mode and describe exactly what to change.
          The AI applies only that targeted change and leaves everything else alone.
        </p>
        <DocsCallout type="info">
          Visual Edit is available on the <strong>Preview tab</strong> only. Switch to Preview and look for the paintbrush button in the top-right toolbar.
        </DocsCallout>
      </div>

      {/* Mode explorer */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">The four modes</h2>
        <div className="flex gap-2 flex-wrap">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setActiveMode(m.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                activeMode === m.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'text-muted-foreground hover:bg-muted border-border'
              )}
            >
              <m.icon className="size-3" />
              {m.label}
            </button>
          ))}
        </div>

        <div className={cn('rounded-xl border p-5 space-y-3', active.bg)}>
          <div className="flex items-center gap-2">
            <active.icon className={cn('size-5', active.colour)} />
            <p className={cn('font-semibold', active.colour)}>{active.label}</p>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{active.desc}</p>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Example instructions</p>
            <div className="flex flex-wrap gap-2">
              {active.examples.map(ex => (
                <span key={ex} className="text-xs px-2.5 py-1 rounded-md bg-background border border-border text-muted-foreground">
                  {ex}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Element picker */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Element Picker</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Use the <strong>cursor icon</strong> in the preview toolbar to activate Element Picker mode.
          Click any element in the live preview and Isotope will pre-fill your chat with a description of that element —
          so your Visual Edit instruction targets exactly the right component.
        </p>
        <DocsCallout type="warning">
          Element Picker only works in <strong>Preview (simulation) mode</strong>, not in Live (Vercel) mode.
          If you're viewing the live deployed app, switch back to Preview first.
        </DocsCallout>
      </div>

      {/* How to use */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Step by step</h2>
        <DocsSteps steps={[
          { title: 'Open a project with a generated app', description: 'You need at least one generation in the project before Visual Edit is available.' },
          { title: 'Switch to the Preview tab', description: 'The Visual Edit button only appears on the Preview tab — it\'s hidden on Code and Tasks.' },
          { title: 'Click the paintbrush icon', description: 'The Visual Edit panel slides up from the bottom. It shows four mode tabs and quick-suggestion chips.' },
          { title: 'Pick a mode', description: 'Choose Colors, Text, Spacing, or Layout depending on what you want to change. The hint text updates to describe what that mode targets.' },
          { title: 'Type your instruction or click a suggestion', description: 'Be specific — "make the hero background #0a0a0a" works better than "make it darker". Quick-suggestion chips give you one-click starting points.' },
          { title: 'Submit and review', description: 'The AI applies only the targeted change. Your credit is consumed and a new version appears in the preview. Check Version History if you want to go back.' },
        ]} />
      </div>

      <DocsCallout type="tip">
        Combine Element Picker + Visual Edit for the most precise results. Click the element you want to change first, then open Visual Edit — your instruction will already reference the right part of the UI.
      </DocsCallout>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Credits</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Each Visual Edit submission costs <strong>1 credit</strong>, same as a regular generation.
          The plan-first step still runs — you'll see the plan card and can approve or reject before the credit is charged.
        </p>
      </div>
    </div>
  )
}
