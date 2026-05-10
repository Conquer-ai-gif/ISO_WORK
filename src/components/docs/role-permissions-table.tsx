'use client'

import { useState } from 'react'
import { CheckIcon, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const ROLES = ['Owner', 'Editor', 'Viewer'] as const
type Role = typeof ROLES[number]

const PERMISSIONS: { action: string; owner: boolean; editor: boolean; viewer: boolean }[] = [
  { action: 'View projects',          owner: true,  editor: true,  viewer: true  },
  { action: 'Generate code',          owner: true,  editor: true,  viewer: false },
  { action: 'Edit prompts',           owner: true,  editor: true,  viewer: false },
  { action: 'Delete projects',        owner: true,  editor: false, viewer: false },
  { action: 'Invite members',         owner: true,  editor: false, viewer: false },
  { action: 'Remove members',         owner: true,  editor: false, viewer: false },
  { action: 'Manage billing',         owner: true,  editor: false, viewer: false },
  { action: 'Connect GitHub',         owner: true,  editor: true,  viewer: false },
  { action: 'Deploy to Vercel',       owner: true,  editor: true,  viewer: false },
  { action: 'View version history',   owner: true,  editor: true,  viewer: true  },
]

export function RolePermissionsTable() {
  const [active, setActive] = useState<Role>('Owner')

  const key = active.toLowerCase() as 'owner' | 'editor' | 'viewer'

  return (
    <div className="rounded-xl border border-border bg-card my-6 overflow-hidden">
      {/* Role tabs */}
      <div className="flex border-b border-border">
        {ROLES.map((role) => (
          <button
            key={role}
            onClick={() => setActive(role)}
            className={cn(
              'flex-1 py-3 text-sm font-medium transition-colors',
              active === role
                ? 'bg-primary/10 text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {role}
          </button>
        ))}
      </div>

      {/* Permissions list */}
      <div className="divide-y divide-border">
        {PERMISSIONS.map((p) => (
          <div key={p.action} className="flex items-center justify-between px-5 py-3">
            <span className="text-sm text-foreground">{p.action}</span>
            {p[key]
              ? <CheckIcon className="size-4 text-green-400" />
              : <XIcon className="size-4 text-muted-foreground" />
            }
          </div>
        ))}
      </div>
    </div>
  )
}
