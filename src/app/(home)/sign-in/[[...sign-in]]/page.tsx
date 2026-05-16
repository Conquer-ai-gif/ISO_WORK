'use client'

import { SignIn } from '@clerk/nextjs'
import { useCurrentTheme } from '@/hooks/use-current-theme'
import { getClerkAppearance } from '@/lib/clerk-appearance'
import { useEffect, useState } from 'react'

const Page = () => {
  const theme = useCurrentTheme()
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  return (
    <div className="flex flex-col max-w-3xl mx-auto w-full">
      <section className="space-y-6 pt-[16vh] 2xl:pt-48">
        <div className="flex flex-col items-center">
          {isMounted ? (
            <SignIn appearance={getClerkAppearance(theme)} />
          ) : (
            <div className="h-96 w-full max-w-sm animate-pulse rounded-xl bg-muted" />
          )}
        </div>
      </section>
    </div>
  )
}

export default Page
