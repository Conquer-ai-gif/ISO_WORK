'use client'

import { GithubIcon, GitBranchIcon, GitMergeIcon, ArrowLeftRightIcon } from 'lucide-react'
import { DocsCallout } from '@/components/docs/docs-callout'
import { DocsSteps } from '@/components/docs/docs-steps'
import { SyncFlowDiagram } from '@/components/docs/sync-flow-diagram'

export default function GitHubSyncPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <GithubIcon className="size-5 text-primary" />
          <h1 className="text-2xl font-bold">GitHub Sync</h1>
        </div>
        <p className="text-muted-foreground">
          Two-way sync between Isotope and GitHub — you push manually, the platform handles the rest.
        </p>
      </div>

      <SyncFlowDiagram />

      {/* Connecting a repo */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <GitBranchIcon className="size-4 text-primary" />
          <h2 className="text-lg font-semibold">Connecting a repo</h2>
        </div>
        <DocsSteps steps={[
          { title: 'Connect your GitHub account', description: 'Sign in or connect GitHub via Settings → Connected Accounts. Isotope uses this to create branches and PRs on your behalf.' },
          { title: 'Open your project', description: 'Go to any project and click the GitHub button in the project header toolbar.' },
          { title: 'Bind a repo', description: 'Create a new private repo or connect an existing one. Isotope registers a webhook on the repo so it can receive push events from GitHub.' },
          { title: 'Ready', description: 'Your project is now linked. Use the "Push to GitHub" button on any generated fragment to start syncing.' },
        ]} />
      </div>

      {/* Pushing to GitHub */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <GitMergeIcon className="size-4 text-primary" />
          <h2 className="text-lg font-semibold">Pushing generated code</h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          After a generation completes, click <strong>Push to GitHub</strong> on the fragment card. Isotope will:
        </p>
        <ol className="space-y-2 text-sm text-muted-foreground list-none">
          {[
            'Create an isotope/{slug} branch from main',
            'Push only the changed files (smart diff — unchanged files are skipped)',
            'Open a Pull Request targeting main with a descriptive title',
            'Auto-merge the PR on your behalf',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="size-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-medium">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <DocsCallout type="info">
          Isotope never auto-pushes on generation — you always decide when to push.
          This keeps your repo clean and gives you full control over what lands on main.
        </DocsCallout>
      </div>

      {/* Pulling commits back */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ArrowLeftRightIcon className="size-4 text-primary" />
          <h2 className="text-lg font-semibold">Pulling changes from GitHub</h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          If you or a teammate push commits directly to main from a local machine or another tool,
          Isotope detects the push via the registered webhook and automatically updates the project's
          file snapshot in the database. The next time you generate, the AI agent starts with the
          latest files — no manual action needed.
        </p>
        <DocsCallout type="info">
          Pulling commits from GitHub does <strong>not</strong> cost credits — only AI generations do.
        </DocsCallout>
      </div>

      {/* After merge */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">What happens after a merge</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          When an <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">isotope/</span> PR is merged,
          the webhook fires and the platform automatically:
        </p>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {[
            'Fetches the full file tree from main',
            'Updates Fragment.files in the database (the sandbox source of truth)',
            'Marks the fragment as merged',
            'Refreshes the Vercel deploy URL if Vercel is connected',
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-primary mt-0.5">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Import existing repo */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <GitBranchIcon className="size-4 text-primary" />
          <h2 className="text-lg font-semibold">Import an existing repo</h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Have an existing codebase you want to continue building with Isotope? Use the
          <strong> Import Existing Repo</strong> button on the home page (or inside the <strong>+</strong> menu in the prompt box).
        </p>
        <DocsSteps steps={[
          { title: 'Click + → Import existing repo', description: 'Or use the "Import Existing Repo" button below the prompt box on the home page.' },
          { title: 'Paste your GitHub repo URL', description: 'Public repos work immediately. Private repos require a connected GitHub account.' },
          { title: 'Review the analysis', description: 'Isotope reads your package.json to detect framework, language, styling, database, and auth. Any risk flags are shown before you confirm.' },
          { title: 'Confirm import', description: 'A new project is created linked to your repo. On your first generation, the agent starts with your full existing codebase.' },
        ]} />
        <DocsCallout type="warning">
          Supported frameworks: Next.js, React, Vue, Svelte. Other frameworks will show a warning but can still be imported at your own risk.
        </DocsCallout>
      </div>

      {/* Conflict resolution */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Conflict resolution</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          If both Isotope and GitHub modify the same file, a conflict is flagged in your project above the chat.
          You'll see both versions and can choose which one to keep.
        </p>
        <DocsCallout type="warning">
          Generate in Isotope before pushing manually to GitHub to minimise conflicts.
        </DocsCallout>
      </div>
    </div>
  )
}
