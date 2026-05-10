'use client'

import { SignUp } from '@clerk/nextjs'
import { useCurrentTheme } from '@/hooks/use-current-theme'
import { getClerkAppearance } from '@/lib/clerk-appearance'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function SignUpContent() {
  const theme = useCurrentTheme()
  const searchParams = useSearchParams()
  const ref = searchParams.get('ref')

  return (
    <SignUp
      appearance={getClerkAppearance(theme)}
      // Pass ref code through Clerk's unsafeMetadata so the webhook can read it
      unsafeMetadata={ref ? { referralCode: ref } : undefined}
    />
  )
}

const Page = () => (
  <div className="flex flex-col max-w-3xl mx-auto w-full">
    <section className="space-y-6 pt-[16vh] 2xl:pt-48">
      <div className="flex flex-col items-center">
        <Suspense fallback={<div className="h-96 w-full max-w-sm animate-pulse rounded-xl bg-muted" />}>
          <SignUpContent />
        </Suspense>
      </div>
    </section>
  </div>
)

export default Page
