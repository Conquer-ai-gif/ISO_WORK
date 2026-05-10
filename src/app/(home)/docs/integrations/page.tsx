'use client'

import { KeyIcon, ShieldIcon, AlertTriangleIcon, SparklesIcon, WrenchIcon, BellIcon } from 'lucide-react'
import { DocsCallout } from '@/components/docs/docs-callout'
import { DocsSteps } from '@/components/docs/docs-steps'

export default function IntegrationsPage() {
  return (
    <div className="space-y-10">

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <KeyIcon className="size-5 text-primary" />
          <h1 className="text-2xl font-bold">Integrations</h1>
        </div>
        <p className="text-muted-foreground">
          Securely connect third-party services to your generated apps — without ever exposing keys to the AI or your frontend.
        </p>
      </div>

      {/* How it works overview */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">How it works</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Isotope uses a <strong>user-supplied keys</strong> model. You paste your own API keys for services
          like Resend, Stripe, and Supabase. Isotope encrypts them with AES-256-GCM before storing in the
          database, and decrypts them only at runtime — inside the isolated E2B sandbox — just before
          your AI generation runs.
        </p>

        <DocsCallout icon={ShieldIcon} variant="success" title="End-to-end encryption">
          Keys are encrypted before they hit the database. They are never logged, never sent to AI models,
          and never returned in API responses — even in masked form. Decryption happens exclusively inside
          the E2B sandbox at generation time.
        </DocsCallout>
      </div>

      {/* Connector cards */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Connector cards</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The Integrations page shows a card for each supported provider with a <strong>Connected</strong> or{' '}
          <strong>Not connected</strong> badge. Clicking <strong>Connect</strong> opens a guided modal that walks
          you through exactly where to find your key in that provider's dashboard — with step-by-step instructions
          and a direct link to the right page.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { name: 'Resend', env: 'RESEND_API_KEY', category: 'Email' },
            { name: 'Supabase URL', env: 'NEXT_PUBLIC_SUPABASE_URL', category: 'Database' },
            { name: 'Supabase Anon Key', env: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', category: 'Database' },
            { name: 'Supabase Service Key', env: 'SUPABASE_SERVICE_ROLE_KEY', category: 'Database' },
            { name: 'Stripe Secret Key', env: 'STRIPE_SECRET_KEY', category: 'Payments' },
            { name: 'Stripe Publishable Key', env: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', category: 'Payments' },
            { name: 'OpenRouter', env: 'OPENROUTER_API_KEY', category: 'AI' },
            { name: 'OpenAI', env: 'OPENAI_API_KEY', category: 'AI' },
            { name: 'Figma Token', env: 'FIGMA_ACCESS_TOKEN', category: 'Design' },
          ].map((p) => (
            <div key={p.env} className="rounded-lg border bg-muted/20 px-3.5 py-3 space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{p.name}</p>
                <span className="text-[10px] text-muted-foreground border rounded-full px-1.5 py-0.5">{p.category}</span>
              </div>
              <p className="text-xs font-mono text-muted-foreground">{p.env}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Custom keys */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <WrenchIcon className="size-4" /> Custom keys
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Need a provider that isn't in the list above? Use the <strong>Custom Keys</strong> section at the bottom
          of the Integrations page. You define both the env var name and the value — Isotope encrypts and injects
          it into the sandbox exactly like any other key.
        </p>

        <DocsSteps steps={[
          'Scroll to "Custom Keys" at the bottom of the Integrations page.',
          'Click "Add" to open the custom key modal.',
          'Enter the env var name in uppercase (e.g. TWILIO_AUTH_TOKEN).',
          'Paste your key value and click "Save Custom Key".',
          'The next generation will have access to process.env.TWILIO_AUTH_TOKEN in the sandbox.',
        ]} />

        <DocsCallout icon={AlertTriangleIcon} variant="warning" title="Naming convention">
          Use the exact env var name the SDK or library expects. For example, the Twilio Node.js SDK
          reads <code className="text-xs bg-muted px-1 py-0.5 rounded">TWILIO_AUTH_TOKEN</code> and{' '}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">TWILIO_ACCOUNT_SID</code> — so add both
          as separate custom keys.
        </DocsCallout>
      </div>

      {/* Missing key notifications */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BellIcon className="size-4" /> Missing key notifications
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          When the AI generates code that calls a third-party service, it signals which keys it needs via a{' '}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">{'<required_integrations>'}</code> tag in its
          output. Isotope reads this tag and compares the list against your configured keys for this project.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          If any required key is missing, a <strong>non-blocking banner</strong> appears below the generation
          card in the chat — it does not stop you from previewing the result. The banner shows which key is
          needed and links directly to the Integrations page so you can add it in one click.
        </p>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-1">
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Example banner</p>
          <p className="text-xs text-muted-foreground">
            ⚠️ This feature needs: <strong>Resend API Key</strong> — add it in your project → Integrations tab
            to enable real functionality. <span className="text-primary underline cursor-pointer">Add key →</span>
          </p>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          The banner is computed at render time — once you add the missing key, refreshing the page will
          make the banner disappear automatically without needing to regenerate.
        </p>
      </div>

      {/* Security model */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Security model</h2>
        <div className="rounded-lg border bg-muted/20 p-4 space-y-3 text-sm text-muted-foreground font-mono">
          <p>User pastes key → AES-256-GCM encrypt → stored in IntegrationConfig (Postgres)</p>
          <p className="pl-4 border-l-2 border-muted-foreground/20">↓</p>
          <p>Inngest inject-keys step → decrypt → export into E2B sandbox env</p>
          <p className="pl-4 border-l-2 border-muted-foreground/20">↓</p>
          <p>AI-generated code reads process.env.VARIABLE_NAME → real API call works</p>
        </div>

        <DocsCallout icon={ShieldIcon} variant="success" title="What never happens">
          Keys are never returned in tRPC responses (even masked), never included in AI prompts, never
          written to logs, and never stored in the E2B sandbox after the generation finishes.
        </DocsCallout>
      </div>

      {/* Supported providers table */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Supported providers</h2>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Provider</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Env var injected</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Category</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[
                { provider: 'resend', env: 'RESEND_API_KEY', category: 'Email' },
                { provider: 'supabase_url', env: 'NEXT_PUBLIC_SUPABASE_URL', category: 'Database' },
                { provider: 'supabase_anon_key', env: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', category: 'Database' },
                { provider: 'supabase_service_key', env: 'SUPABASE_SERVICE_ROLE_KEY', category: 'Database' },
                { provider: 'stripe_secret_key', env: 'STRIPE_SECRET_KEY', category: 'Payments' },
                { provider: 'stripe_publishable_key', env: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', category: 'Payments' },
                { provider: 'openai_api_key', env: 'OPENAI_API_KEY', category: 'AI' },
                { provider: 'custom', env: '(your custom name)', category: 'Any' },
              ].map((row) => (
                <tr key={row.provider} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs">{row.provider}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{row.env}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{row.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
