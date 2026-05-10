'use client'

import { UserProfile } from '@clerk/nextjs'
import { useCurrentTheme } from '@/hooks/use-current-theme'
import { getClerkAppearance } from '@/lib/clerk-appearance'

export default function SettingsPage() {
  const theme = useCurrentTheme()
  const appearance = getClerkAppearance(theme)

  return (
    <div className="flex justify-center py-12 px-4">
      <UserProfile
        appearance={{
          ...appearance,
          elements: {
            ...appearance.elements,
            rootBox: 'w-full max-w-4xl',
            card: 'shadow-none! border rounded-xl! w-full',
            navbar: 'border-r!',
            navbarMobileMenuRow: 'border-b!',
            pageScrollBox: 'p-6!',
          },
        }}
      />
    </div>
  )
}
