'use client'

import { DocsCallout } from '@/components/docs/docs-callout'
import { DocsSteps } from '@/components/docs/docs-steps'
import {
  ScrollTextIcon, RocketIcon, SparklesIcon, BugIcon, AlertTriangleIcon, BellIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ENTRY_TYPES = [
  { icon: RocketIcon,        label: 'New Feature',  colour: 'text-violet-500', bg: 'bg-violet-500/10 border-violet-500/20', desc: 'A brand-new capability that didn\'t exist before.' },
  { icon: SparklesIcon,      label: 'Improvement',  colour: 'text-blue-500',   bg: 'bg-blue-500/10 border-blue-500/20',   desc: 'An enhancement to an existing feature — faster, cleaner, or easier to use.' },
  { icon: BugIcon,           label: 'Bug Fix',      colour: 'text-green-500',  bg: 'bg-green-500/10 border-green-500/20', desc: 'A fix for something that was broken.' },
  { icon: AlertTriangleIcon, label: 'Breaking',     colour: 'text-red-500',    bg: 'bg-red-500/10 border-red-500/20',     desc: 'A change that requires action from users — migration, config update, etc.' },
]

export default function ChangelogDocPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <ScrollTextIcon className="size-5 text-primary" />
          <h1 className="text-2xl font-bold">Changelog</h1>
        </div>
        <p className="text-muted-foreground">
          Keep your users informed about what's new — publish updates and notify subscribers automatically.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Overview</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The Changelog is a public page at <code>/changelog</code> where you announce new features, improvements, and fixes.
          Users can subscribe with their email to get notified when you publish a new entry.
          You manage all entries from the <strong>Admin dashboard</strong> at <code>/admin → Changelog tab</code>.
        </p>
        <DocsCallout type="info">
          The Changelog requires the <code>changelog-taskboard</code> migration. Run <code>npx prisma migrate dev --name changelog-taskboard</code> to create the <code>ChangelogEntry</code> and <code>ChangelogSubscriber</code> tables.
        </DocsCallout>
      </div>

      {/* Entry types */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Entry types</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ENTRY_TYPES.map(t => (
            <div key={t.label} className={cn('rounded-xl border p-4 space-y-2', t.bg)}>
              <div className="flex items-center gap-2">
                <t.icon className={cn('size-4', t.colour)} />
                <p className={cn('text-sm font-semibold', t.colour)}>{t.label}</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{t.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Publishing flow */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Publishing an entry</h2>
        <DocsSteps steps={[
          { title: 'Go to /admin → Changelog tab', description: 'You must be listed in ADMIN_USER_IDS to access the admin dashboard. Find your Clerk user ID in the Clerk dashboard.' },
          { title: 'Fill in the entry form', description: 'Enter a title, pick a type (Feature / Improvement / Bug Fix / Breaking), write the content, and optionally add tags.' },
          { title: 'Save as Draft', description: 'Click "Save Draft" to save without publishing. The entry gets a Draft badge and is not visible on /changelog yet.' },
          { title: 'Publish + Notify', description: 'When ready, click "Publish + Notify". This publishes the entry publicly AND emails all active subscribers in one action. There\'s no separate "send email" step.' },
          { title: 'Verify it went live', description: 'Visit /changelog — the entry should appear at the top, sorted by publish date. Subscribers will receive the notification email within seconds.' },
        ]} />
      </div>

      {/* Subscriptions */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Email subscriptions</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Users visit <code>/changelog</code> and enter their email in the Subscribe form at the top of the page.
          Signed-in users get their primary email pre-filled. Each subscription is stored in the <code>ChangelogSubscriber</code> table.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Every notification email includes an <strong>unsubscribe link</strong> that deactivates the subscriber's record.
          They won't receive future emails unless they subscribe again.
        </p>
        <DocsCallout type="warning">
          Email notifications require <strong>Resend</strong> to be set up. Make sure <code>RESEND_API_KEY</code> and <code>ADMIN_EMAIL</code> are set, and that your sending domain is verified in Resend. See the Email Notifications doc for the full setup.
        </DocsCallout>
      </div>

      {/* Filtering */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Filtering on /changelog</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The public changelog page has filter chips at the top — All updates, New Feature, Improvement, Bug Fix, and Breaking.
          Users can click any chip to filter entries by type. Entries are always sorted newest first.
        </p>
      </div>

      <DocsCallout type="tip">
        Tag your entries well — tags appear as chips on each entry card and help users quickly scan what changed. Good tags: <code>auth</code>, <code>billing</code>, <code>performance</code>, <code>UI</code>.
      </DocsCallout>
    </div>
  )
}
