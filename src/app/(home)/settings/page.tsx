'use client'

import { UserProfile } from '@clerk/nextjs'
import { useCurrentTheme } from '@/hooks/use-current-theme'
import { getClerkAppearance } from '@/lib/clerk-appearance'
import { useEffect, useState } from 'react'

export default function SettingsPage() {
  const theme = useCurrentTheme()
  const appearance = getClerkAppearance(theme)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  return (
    <div className="flex justify-center py-12 px-4">
      {isMounted ? (
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
      ) : (
        <div className="h-96 w-full max-w-4xl animate-pulse rounded-xl bg-muted" />
      )}
    </div>
  )
}
