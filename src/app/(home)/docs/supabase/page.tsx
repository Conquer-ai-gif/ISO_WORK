'use client'

import { DatabaseIcon } from 'lucide-react'
import { DocsCallout } from '@/components/docs/docs-callout'
import { DocsSteps } from '@/components/docs/docs-steps'

export default function SupabasePage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <DatabaseIcon className="size-5 text-primary" />
          <h1 className="text-2xl font-bold">Supabase Database</h1>
        </div>
        <p className="text-muted-foreground">Every project gets its own real database — automatically provisioned.</p>
      </div>

      <DocsCallout type="warning">
        Supabase database provisioning is a <strong>Pro and Team plan</strong> feature. Upgrade to access it.
      </DocsCallout>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">What gets provisioned</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          When you enable Supabase for a project, Isotope automatically creates a new Supabase project under your organization with a PostgreSQL database. You get a unique database URL and anon key scoped to that project.
        </p>
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">What you get per project</p>
          {['PostgreSQL database', 'Unique database URL', 'Anon (public) key', 'Auto-injected into generated code', 'Accessible from your Supabase dashboard'].map((item) => (
            <div key={item} className="flex items-center gap-2 text-sm text-foreground">
              <div className="size-1.5 rounded-full bg-primary flex-shrink-0" />
              {item}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Setting it up</h2>
        <DocsSteps steps={[
          { title: 'Get a Supabase access token', description: 'Go to supabase.com → Account → Access Tokens → Generate new token.' },
          { title: 'Find your organization ID', description: 'Go to supabase.com → Account → Your organizations → copy the org ID.' },
          { title: 'Add both to Isotope settings', description: 'Go to Settings in the Isotope app and paste both values. Supabase is now enabled.' },
          { title: 'Enable per project', description: 'Open any project → click the Supabase button in the header → Isotope will provision a database instantly.' },
        ]} />
      </div>

      <DocsCallout type="tip">
        Generated apps automatically have the Supabase URL and anon key injected as environment variables — you don't need to configure anything manually in the generated code.
      </DocsCallout>
    </div>
  )
}
