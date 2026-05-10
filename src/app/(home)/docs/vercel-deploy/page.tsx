'use client'

import { RocketIcon } from 'lucide-react'
import { DocsCallout } from '@/components/docs/docs-callout'
import { DocsSteps } from '@/components/docs/docs-steps'

export default function VercelDeployPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <RocketIcon className="size-5 text-primary" />
          <h1 className="text-2xl font-bold">Vercel Deploy</h1>
        </div>
        <p className="text-muted-foreground">Get a live URL for every generation — automatically deployed to Vercel.</p>
      </div>

      <DocsCallout type="info">
        Vercel deploy is an optional feature. It requires a Vercel account and token. Without it, you still get a live preview inside Isotope.
      </DocsCallout>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Setting up Vercel deploy</h2>
        <DocsSteps steps={[
          { title: 'Create a Vercel account', description: 'Go to vercel.com and sign up if you haven\'t already. It\'s free.' },
          { title: 'Generate a Vercel token', description: 'Go to vercel.com → Account Settings → Tokens → Create Token. Set scope to Full Access.' },
          { title: 'Add token to Isotope', description: 'Go to Settings in the Isotope app and paste your Vercel token. Vercel deploy is now enabled for all your projects.' },
          { title: 'Generate something', description: 'On your next generation, Isotope will automatically deploy the app to Vercel and show you a live URL in the project header.' },
        ]} />
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Custom domains</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Pro and Team plan users can attach a custom domain to any deployed project. Open the project, click the domain icon in the header, and enter your domain. You'll need to add a CNAME record at your domain registrar pointing to Vercel.
        </p>
        <DocsCallout type="tip">
          Custom domains are per-project. You can have different domains on different projects.
        </DocsCallout>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">How auto-deploy works</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Every time you generate, Isotope pushes the new code to your connected GitHub repo, and Vercel picks it up automatically via its GitHub integration. The live URL is updated within seconds of generation completing.
        </p>
      </div>
    </div>
  )
}
