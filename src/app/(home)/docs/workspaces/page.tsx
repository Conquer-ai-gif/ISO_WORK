'use client'

import { UsersIcon } from 'lucide-react'
import { DocsCallout } from '@/components/docs/docs-callout'
import { DocsSteps } from '@/components/docs/docs-steps'
import { RolePermissionsTable } from '@/components/docs/role-permissions-table'

export default function WorkspacesPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <UsersIcon className="size-5 text-primary" />
          <h1 className="text-2xl font-bold">Team Workspaces</h1>
        </div>
        <p className="text-muted-foreground">Collaborate with your team — shared projects, roles, and credits.</p>
      </div>

      <DocsCallout type="info">
        Team Workspaces are available on the <strong>Team plan</strong>. The workspace owner's credits are used for all generations by team members.
      </DocsCallout>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Creating a workspace</h2>
        <DocsSteps steps={[
          { title: 'Go to Workspaces', description: 'Click Workspaces in the navbar or go to /workspaces.' },
          { title: 'Create a new workspace', description: 'Click "New workspace", give it a name, and it\'s created instantly.' },
          { title: 'Invite members', description: 'Open the workspace → Settings → Invite link. Share the link with your team. Each person who clicks it and signs in joins the workspace.' },
          { title: 'Create projects inside the workspace', description: 'Projects created inside a workspace are visible to all members based on their role.' },
        ]} />
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Roles & permissions</h2>
        <p className="text-sm text-muted-foreground">Click a role to see what it can and can't do.</p>
        <RolePermissionsTable />
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">How credits work in teams</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The workspace <strong>Owner</strong> pays for all generations. When an Editor generates code, 1 credit is deducted from the owner's balance — not the editor's. Viewers never trigger credit usage.
        </p>
        <DocsCallout type="warning">
          If the workspace owner runs out of credits, Editors won't be able to generate until the owner's credits reset or they upgrade their plan.
        </DocsCallout>
      </div>
    </div>
  )
}
