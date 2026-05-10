'use client'

import { useState } from 'react'
import { ZapIcon, CheckIcon, LoaderIcon, SparklesIcon } from 'lucide-react'
import { useTRPC } from '@/trpc/client'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { CreditPackage } from '@/lib/stripe'
import { cn } from '@/lib/utils'

function PackageCard({
  pkg,
  loading,
  onBuy,
}: {
  pkg:     CreditPackage
  loading: boolean
  onBuy:   (id: string) => void
}) {
  return (
    <div
      className={cn(
        'relative rounded-xl border bg-card p-5 flex flex-col gap-4 transition-all duration-200',
        pkg.badge
          ? 'border-primary/40 shadow-sm shadow-primary/10'
          : 'border-border hover:border-primary/20',
      )}
    >
      {/* Badge */}
      {pkg.badge && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary text-primary-foreground whitespace-nowrap">
            {pkg.badge}
          </span>
        </div>
      )}

      {/* Credits + price */}
      <div className="space-y-1 pt-1">
        <div className="flex items-center gap-2">
          <ZapIcon className="size-4 text-primary" />
          <p className="text-2xl font-bold">{pkg.credits}</p>
          <p className="text-sm text-muted-foreground font-medium">credits</p>
        </div>
        <p className="text-xs text-muted-foreground">{pkg.perCredit}</p>
      </div>

      {/* What you get */}
      <div className="space-y-1.5 text-xs text-muted-foreground">
        {[
          `~${Math.floor(pkg.credits / 0.4)} simple generations`,
          `~${Math.floor(pkg.credits / 1.1)} standard builds`,
          'Credits never expire',
        ].map((item) => (
          <div key={item} className="flex items-center gap-1.5">
            <CheckIcon className="size-3 text-green-500 shrink-0" />
            {item}
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={() => onBuy(pkg.id)}
        disabled={loading}
        className={cn(
          'mt-auto flex items-center justify-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-lg transition-colors',
          pkg.badge
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'bg-muted text-foreground hover:bg-muted/80 border border-border',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        )}
      >
        {loading ? (
          <LoaderIcon className="size-3.5 animate-spin" />
        ) : (
          <>
            Buy for {pkg.label}
          </>
        )}
      </button>
    </div>
  )
}

export function CreditMarketplace() {
  const trpc          = useTRPC()
  const [buyingId, setBuyingId] = useState<string | null>(null)

  const { data: packages = [] } = useQuery(
    trpc.usage.getCreditPackages.queryOptions(),
  )

  const checkout = useMutation(
    trpc.usage.createCheckoutSession.mutationOptions({
      onSuccess: (data) => {
        if (data.url) window.location.href = data.url
      },
      onError: (err) => {
        console.error('Checkout failed:', err)
        setBuyingId(null)
      },
    }),
  )

  function handleBuy(packageId: string) {
    setBuyingId(packageId)
    checkout.mutate({ packageId })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <SparklesIcon className="size-4 text-primary" />
        <h2 className="text-base font-semibold">Buy Credits</h2>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">
        Credits never expire and stack on top of your monthly allowance.
        Use them for complex generations, search tasks, or fix loops.
      </p>

      {/* Packages grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {packages.map((pkg) => (
          <PackageCard
            key={pkg.id}
            pkg={pkg}
            loading={buyingId === pkg.id && checkout.isPending}
            onBuy={handleBuy}
          />
        ))}
      </div>

      {/* Fine print */}
      <p className="text-xs text-muted-foreground">
        Payments processed securely by Stripe. Credits are added instantly after payment.
        No subscriptions — one-time purchases only.
      </p>
    </div>
  )
}
