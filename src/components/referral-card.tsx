'use client'

import { useState } from 'react'
import { useSuspenseQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { GiftIcon, CopyIcon, CheckIcon, SparklesIcon, UsersIcon } from 'lucide-react'
import { useTRPC } from '@/trpc/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  appUrl: string
}

export const ReferralCard = ({ appUrl }: Props) => {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [inputCode, setInputCode] = useState('')

  const { data } = useSuspenseQuery(trpc.referral.getMyCode.queryOptions())

  const applyCode = useMutation(trpc.referral.applyCode.mutationOptions({
    onSuccess: (result) => {
      toast.success(result.message)
      queryClient.invalidateQueries(trpc.usage.status.queryOptions())
      setInputCode('')
    },
    onError: (e) => toast.error(e.message),
  }))

  const referralLink = `${appUrl}?ref=${data.code}`

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b flex items-center gap-2">
        <GiftIcon className="size-4 text-primary" />
        <h2 className="font-semibold text-sm">Refer a friend</h2>
      </div>

      <div className="p-5 space-y-5">
        {/* How it works */}
        <div className="flex items-start gap-4">
          <div className="flex-1 flex items-start gap-3">
            <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <UsersIcon className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Share your link</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                When someone signs up using your link, you both get <span className="font-medium text-primary">+5 free credits</span>
              </p>
            </div>
          </div>
          <div className="flex-1 flex items-start gap-3">
            <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <SparklesIcon className="size-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Earn credits</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                You've earned <span className="font-medium text-primary">{data.bonusEarned} credits</span> from <span className="font-medium">{data.uses}</span> {data.uses === 1 ? 'referral' : 'referrals'} so far
              </p>
            </div>
          </div>
        </div>

        {/* Referral link */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Your referral link
          </label>
          <div className="flex gap-2">
            <Input
              value={referralLink}
              readOnly
              className="font-mono text-xs bg-muted/30"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={copyLink}
              className="flex-shrink-0 gap-1.5"
            >
              {copied
                ? <><CheckIcon className="size-3.5" /> Copied</>
                : <><CopyIcon className="size-3.5" /> Copy</>
              }
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Code: <span className="font-mono font-medium text-foreground">{data.code}</span>
          </p>
        </div>

        {/* Apply someone else's code */}
        <div className="space-y-1.5 pt-1 border-t">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Have a referral code?
          </label>
          <div className="flex gap-2">
            <Input
              placeholder="Enter code..."
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toLowerCase())}
              onKeyDown={(e) => e.key === 'Enter' && inputCode && applyCode.mutate({ code: inputCode })}
              className="font-mono text-sm"
              maxLength={20}
            />
            <Button
              size="sm"
              disabled={!inputCode || applyCode.isPending}
              onClick={() => applyCode.mutate({ code: inputCode })}
              className="flex-shrink-0"
            >
              Apply
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
