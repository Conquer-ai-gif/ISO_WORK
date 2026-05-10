'use client'

import { DocsCallout } from '@/components/docs/docs-callout'
import { DocsSteps } from '@/components/docs/docs-steps'
import { MailIcon, BellIcon, MessageSquareIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const TRIGGERS = [
  {
    icon: MessageSquareIcon,
    label: 'Feedback submitted',
    colour: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
    who: 'You (admin)',
    desc: 'When a user submits feedback at /feedback, an alert email is sent to ADMIN_EMAIL with the type, rating, message, and user ID.',
  },
  {
    icon: BellIcon,
    label: 'Changelog published',
    colour: 'text-violet-400',
    bg: 'bg-violet-500/10 border-violet-500/20',
    who: 'All subscribers',
    desc: 'When you click "Publish + Notify" on a changelog entry, every active ChangelogSubscriber receives a notification email with the full entry content.',
  },
]

export default function EmailNotificationsPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <MailIcon className="size-5 text-primary" />
          <h1 className="text-2xl font-bold">Email Notifications</h1>
        </div>
        <p className="text-muted-foreground">
          Isotope sends two types of email — feedback alerts to you, and changelog notifications to subscribers.
          Both are powered by Resend.
        </p>
      </div>

      {/* What triggers emails */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">What sends an email</h2>
        <div className="space-y-3">
          {TRIGGERS.map(t => (
            <div key={t.label} className={cn('rounded-xl border p-4 space-y-2', t.bg)}>
              <div className="flex items-center gap-2">
                <t.icon className={cn('size-4', t.colour)} />
                <p className={cn('text-sm font-semibold', t.colour)}>{t.label}</p>
                <span className="ml-auto text-xs text-muted-foreground">→ {t.who}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{t.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Resend setup */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Resend setup</h2>
        <DocsSteps steps={[
          { title: 'Create a Resend account', description: 'Go to resend.com and sign up. The free tier gives you 3,000 emails/month — more than enough to start.' },
          { title: 'Create an API key', description: 'Resend dashboard → API Keys → Create API Key → copy the key. Add it to .env.local and Vercel as RESEND_API_KEY.' },
          { title: 'Add your admin email', description: 'Add ADMIN_EMAIL=your@email.com to .env.local and Vercel. This is where feedback alert emails will be delivered.' },
          { title: 'Verify your sending domain', description: 'Resend → Domains → Add Domain → enter your domain → add the DNS records shown at your registrar (usually 2 TXT records and a CNAME). Verification takes a few minutes.' },
          { title: 'Update the from address in code', description: 'Open src/lib/email.ts and change the from field to match your verified domain: \'Isotope <hello@yourdomain.com>\'. The domain must match what you verified in Resend.' },
          { title: 'Test it', description: 'Submit feedback at /feedback and confirm the alert arrives at ADMIN_EMAIL. Then subscribe to the changelog and publish a test entry — confirm the notification arrives.' },
        ]} />
      </div>

      <DocsCallout type="warning">
        The <code>from</code> address in <code>src/lib/email.ts</code> <strong>must use a domain you've verified in Resend</strong>.
        Using an unverified domain will cause all emails to fail silently — Resend rejects them without throwing an error in the app.
      </DocsCallout>

      {/* Env vars */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Environment variables</h2>
        <div className="rounded-xl border border-border bg-muted/30 divide-y divide-border">
          {[
            { key: 'RESEND_API_KEY', where: 'resend.com → API Keys → Create', required: true },
            { key: 'ADMIN_EMAIL',    where: 'Your email address — receives feedback alerts', required: true },
          ].map(v => (
            <div key={v.key} className="flex items-start gap-3 px-4 py-3">
              <code className="text-xs text-primary font-mono w-44 flex-shrink-0 pt-0.5">{v.key}</code>
              <span className="text-xs text-muted-foreground leading-relaxed">{v.where}</span>
              {v.required && (
                <span className="ml-auto text-xs text-red-400 flex-shrink-0">required</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Unsubscribe */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Unsubscribe</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Every changelog notification email includes an unsubscribe link at the bottom.
          Clicking it calls the <code>changelog.unsubscribe</code> tRPC procedure which sets the subscriber's
          <code> active</code> field to <code>false</code>. They won't receive future emails unless they resubscribe at <code>/changelog</code>.
        </p>
        <DocsCallout type="info">
          Feedback alert emails go only to <code>ADMIN_EMAIL</code> — users cannot unsubscribe from those because they don't receive them.
        </DocsCallout>
      </div>

      {/* Limits */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Rate limits & costs</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Resend's free tier includes 3,000 emails/month and 100/day. If you have a large subscriber list, emails are sent
          concurrently using <code>Promise.allSettled</code> — individual failures don't block others.
          For very large lists (1,000+ subscribers), consider upgrading to a paid Resend plan to avoid hitting daily limits.
        </p>
        <div className="rounded-xl border border-border overflow-hidden text-sm">
          <div className="grid grid-cols-3 bg-muted/50 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span>Resend plan</span><span>Monthly emails</span><span>Price</span>
          </div>
          {[
            { plan: 'Free',  emails: '3,000',   price: '$0' },
            { plan: 'Pro',   emails: '50,000',   price: '$20/mo' },
            { plan: 'Scale', emails: '250,000+', price: '$90/mo' },
          ].map(r => (
            <div key={r.plan} className="grid grid-cols-3 px-4 py-2.5 border-t border-border text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{r.plan}</span>
              <span>{r.emails}</span>
              <span>{r.price}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
