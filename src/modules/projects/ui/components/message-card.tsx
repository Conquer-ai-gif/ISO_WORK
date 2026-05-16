'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Fragment as PrismaFragment, MessageRole, MessageType } from '@/generated/prisma/client'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import {
  ChevronRightIcon, Code2Icon, RefreshCcwIcon, AlertCircleIcon,
  SparklesIcon, KeyRoundIcon, EyeIcon, EyeOffIcon, XIcon, Loader2Icon,
} from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { useTRPC } from '@/trpc/client'
import { toast } from 'sonner'
import { useState } from 'react'
import { PlanApproval } from './plan-approval'
import { NextStepSuggestions } from '@/components/next-step-suggestions'
import { IntegrationProvider } from '@/generated/prisma'

// ── Known provider → human-readable label ────────────────────────────────────
function extractDeferredTasks(planJson: string | null | undefined): string[] {
  if (!planJson) return []
  try {
    const plan = JSON.parse(planJson)
    return Array.isArray(plan.deferredTasks) ? plan.deferredTasks : []
  } catch {
    return []
  }
}

interface UserMessageProps { 
  content: string
  imageUrl?: string | null
  plan?: string | null
  planStatus?: string | null
  messageId?: string
  projectId?: string
}

const UserMessage = ({ content, imageUrl, plan, planStatus, messageId, projectId }: UserMessageProps) => {
  const queryClient = useQueryClient()
  const trpc = useTRPC()

  return (
    <div className="flex justify-end pb-4 pr-2 pl-10">
      <div className="flex flex-col gap-1.5 max-w-[80%]">
        {imageUrl && (
          <img src={imageUrl} alt="Attached" className="rounded-lg max-h-48 object-contain self-end border" />
        )}
        <Card className="rounded-lg bg-muted p-3 shadow-none border-none break-words text-sm">
          {content}
        </Card>

        {/* Plan approval — shows when plan is pending */}
        {plan && planStatus === 'pending' && messageId && projectId && (
          <PlanApproval
            messageId={messageId}
            planJson={plan}
            onApproved={() => {
              queryClient.invalidateQueries(trpc.messages.getMany.queryOptions({ projectId }))
            }}
            onRejected={() => {
              queryClient.invalidateQueries(trpc.messages.getMany.queryOptions({ projectId }))
            }}
          />
        )}
      </div>
    </div>
  )
}

interface FragmentCardProps {
  fragment: PrismaFragment
  isActiveFragment: boolean
  onFragmentClick: (fragment: PrismaFragment) => void
}

const FragmentCard = ({ fragment, isActiveFragment, onFragmentClick }: FragmentCardProps) => {
  const previewUrl = fragment.deployUrl ?? fragment.sandboxUrl

  return (
    <div
      className={cn(
        'w-full rounded-xl border overflow-hidden transition-all cursor-pointer',
        isActiveFragment
          ? 'border-primary ring-1 ring-primary/20 shadow-sm shadow-primary/10'
          : 'border-border hover:border-border/80',
      )}
      onClick={() => onFragmentClick(fragment)}
    >
      {/* Live iframe preview */}
      <div className="relative w-full h-32 bg-muted overflow-hidden border-b border-border">
        {previewUrl ? (
          <>
            <iframe
              src={previewUrl}
              className="absolute inset-0 w-[200%] h-[200%] pointer-events-none border-none"
              style={{ transform: 'scale(0.5)', transformOrigin: 'top left' }}
              sandbox="allow-scripts allow-same-origin"
              loading="lazy"
              title={fragment.title}
            />
            <div className="absolute inset-0" />
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <Code2Icon className="size-8 text-muted-foreground/30" />
          </div>
        )}
        {isActiveFragment && (
          <div className="absolute top-2 right-2 flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
            <span className="size-1.5 rounded-full bg-primary-foreground inline-block" />
            Previewing
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 px-3 py-2.5 bg-card">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{fragment.title}</p>
          {fragment.deployUrl ? (
            <p className="text-[11px] text-green-500">Deployed</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">Sandbox preview</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            className="text-[11px] px-2.5 py-1 rounded-md border border-border hover:bg-muted transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              if (previewUrl) window.open(previewUrl, '_blank')
            }}
          >
            View code
          </button>
          <button
            className={cn(
              'text-[11px] px-2.5 py-1 rounded-md transition-colors',
              isActiveFragment
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
            onClick={(e) => {
              e.stopPropagation()
              onFragmentClick(fragment)
            }}
          >
            {isActiveFragment ? 'Active' : 'Open preview'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Provider metadata for the inline modal ───────────────────────────────────
const PROVIDER_META: Record<string, { label: string; placeholder: string; hint: string; mockKey: string }> = {
  resend:                { label: 'Resend API Key',           placeholder: 're_...',                          hint: 'resend.com → API Keys → Create API Key',                          mockKey: 're_mock_isotope_test_key' },
  supabase_url:          { label: 'Supabase Project URL',     placeholder: 'https://xxxx.supabase.co',        hint: 'Supabase Dashboard → Project Settings → API → Project URL',       mockKey: 'https://mock.supabase.co' },
  supabase_anon_key:     { label: 'Supabase Anon Key',        placeholder: 'eyJhbGci...',                     hint: 'Supabase Dashboard → Project Settings → API → anon public key',   mockKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock' },
  supabase_service_key:  { label: 'Supabase Service Role Key',placeholder: 'eyJhbGci...',                     hint: 'Supabase Dashboard → Project Settings → API → service_role key',  mockKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock_service' },
  stripe_secret_key:     { label: 'Stripe Secret Key',        placeholder: 'sk_live_... or sk_test_...',      hint: 'dashboard.stripe.com → Developers → API keys → Secret key',       mockKey: 'sk_test_mock_isotope_key' },
  stripe_publishable_key:{ label: 'Stripe Publishable Key',   placeholder: 'pk_live_... or pk_test_...',      hint: 'dashboard.stripe.com → Developers → API keys → Publishable key',  mockKey: 'pk_test_mock_isotope_key' },
  openai_api_key:        { label: 'OpenAI API Key',           placeholder: 'sk-...',                          hint: 'platform.openai.com → API keys → Create new secret key',          mockKey: 'sk-mock-isotope-test-key' },
}

function getProviderMeta(provider: string) {
  return PROVIDER_META[provider] ?? {
    label: provider,
    placeholder: 'Paste your key or secret',
    hint: 'Find this key in your provider dashboard',
    mockKey: `mock_${provider}_key`,
  }
}

// ── Inline API Key Modal ──────────────────────────────────────────────────────

interface InlineKeyModalProps {
  provider: string
  projectId: string
  onClose: () => void
  onSaved: () => void
}

function InlineKeyModal({ provider, projectId, onClose, onSaved }: InlineKeyModalProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [value, setValue] = useState('')
  const [showValue, setShowValue] = useState(false)
  const meta = getProviderMeta(provider)

  const upsert = useMutation(trpc.integrations.upsert.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries(trpc.integrations.getMany.queryOptions({ projectId }))
      toast.success(`${meta.label} saved`)
      onSaved()
    },
    onError: (e) => toast.error(e.message),
  }))

  const handleSave = () => {
    if (!value.trim()) return
    upsert.mutate({
      projectId,
      provider: provider as IntegrationProvider,
      key: value.trim(),
    })
  }

  const handleLater = () => {
    // Inject a mock key so the sandbox preview keeps working in stub mode
    // The mock key goes through the same upsert → AES-256-GCM encrypt path
    upsert.mutate({
      projectId,
      provider: provider as IntegrationProvider,
      key: meta.mockKey,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b">
          <div className="size-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
            <KeyRoundIcon className="size-4 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{meta.label}</p>
            <p className="text-xs text-muted-foreground truncate">{meta.hint}</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        {/* Input */}
        <div className="p-4 space-y-3">
          <div className="relative">
            <Input
              type={showValue ? 'text' : 'password'}
              placeholder={meta.placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="pr-9 font-mono text-xs h-9"
              autoFocus
            />
            <button
              type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowValue((v) => !v)}
              tabIndex={-1}
            >
              {showValue ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
            </button>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Keys are encrypted with AES-256-GCM — never stored in plaintext or sent to AI models.
          </p>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 gap-1.5"
              disabled={!value.trim() || upsert.isPending}
              onClick={handleSave}
            >
              {upsert.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : 'Save'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              disabled={upsert.isPending}
              onClick={handleLater}
            >
              Later
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Missing key banner ────────────────────────────────────────────────────────

interface MissingKeyBannerProps {
  missingProviders: string[]
  projectId: string
}

const MissingKeyBanner = ({ missingProviders, projectId }: MissingKeyBannerProps) => {
  const [activeProvider, setActiveProvider] = useState<string | null>(null)
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  if (missingProviders.length === 0) return null

  const labels = missingProviders.map((p) => getProviderMeta(p).label)
  const display = labels.length === 1
    ? labels[0]
    : labels.length === 2
      ? `${labels[0]} and ${labels[1]}`
      : `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`

  return (
    <>
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs">
        <KeyRoundIcon className="size-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <span className="text-amber-600 dark:text-amber-400 font-medium">
            This feature needs: {display}
          </span>
          <span className="text-muted-foreground ml-1">
            — add it in Settings → Integrations to enable real functionality.
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-auto py-0 px-1.5 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 hover:bg-amber-500/10 flex-shrink-0"
          onClick={() => setActiveProvider(missingProviders[0])}
        >
          Add key →
        </Button>
      </div>

      {/* Inline modal — opens in chat, no page navigation */}
      {activeProvider && (
        <InlineKeyModal
          provider={activeProvider}
          projectId={projectId}
          onClose={() => setActiveProvider(null)}
          onSaved={() => {
            setActiveProvider(null)
            queryClient.invalidateQueries(trpc.integrations.getMany.queryOptions({ projectId }))
          }}
        />
      )}
    </>
  )
}

interface SuggestionsProps {
  projectId: string
  summary: string
  onSelect: (prompt: string) => void
}

const Suggestions = ({ projectId, summary, onSelect }: SuggestionsProps) => {
  const trpc = useTRPC()
  const { data, isLoading } = useQuery({
    ...trpc.messages.getSuggestions.queryOptions({ projectId, summary }),
    staleTime: Infinity,
    retry: false,
  })

  const suggestions = data?.suggestions ?? []

  if (isLoading) return null
  if (suggestions.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onSelect(s)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
        >
          <SparklesIcon className="size-3 flex-shrink-0" />
          {s}
        </button>
      ))}
    </div>
  )
}

interface AssistantMessageProps {
  content: string
  fragment: PrismaFragment | null
  createdAt: Date
  isActiveFragment: boolean
  onFragmentClick: (fragment: PrismaFragment) => void
  type: MessageType
  projectId: string
  isLatest: boolean
  onSuggestionSelect: (prompt: string) => void
  // Plan-first props
  messageId: string
  plan?: string | null
  planStatus?: string | null
  requiredIntegrations?: string | null
}

const AssistantMessage = ({
  content, fragment, createdAt, isActiveFragment, onFragmentClick,
  type, projectId, isLatest, onSuggestionSelect,
  messageId, plan, planStatus, requiredIntegrations,
}: AssistantMessageProps) => {
  const trpc = useTRPC()
  const router = useRouter()
  const queryClient = useQueryClient()

  // Compute which required providers are not yet configured
  const { data: configs = [] } = useQuery(
    trpc.integrations.getMany.queryOptions({ projectId })
  )
  const savedProviders = new Set(configs.map((c) => c.provider))

  const allRequired: string[] = (() => {
    if (!requiredIntegrations) return []
    try { return JSON.parse(requiredIntegrations) } catch { return [] }
  })()

  const missingProviders = allRequired.filter((p) => !savedProviders.has(p as never))

  const retryGeneration = useMutation(trpc.messages.create.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries(trpc.messages.getMany.queryOptions({ projectId }))
      toast.success('Retrying generation...')
    },
    onError: (e) => {
      if (e?.message?.includes('run out of credits') || e?.data?.code === 'TOO_MANY_REQUESTS') {
        router.push('/pricing')
      } else {
        toast.error(e.message)
      }
    },
  }))

  return (
    <div className={cn('flex flex-col group px-2 pb-4', type === 'ERROR' && 'text-red-700 dark:text-red-500')}>
      <div className="flex items-center gap-2 pl-2 mb-2">
        <Image src="/logo.svg" alt="Isotope" width={18} height={18} className="shrink-0" />
        <span className="text-sm font-medium">Isotope</span>
        <span className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          {format(createdAt, "HH:mm 'on' MM/dd/yyyy")}
        </span>
      </div>

      <div className="pl-8 flex flex-col gap-y-3">
        {type === 'ERROR' ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <AlertCircleIcon className="size-4 mt-0.5 flex-shrink-0" />
              <span className="text-sm">{content}</span>
            </div>
            <Button
              size="sm" variant="outline"
              className="w-fit text-xs h-7 border-red-300 dark:border-red-800"
              disabled={retryGeneration.isPending}
              onClick={() => retryGeneration.mutate({ projectId, value: 'Please try again' })}
            >
              <RefreshCcwIcon className="size-3" />
              {retryGeneration.isPending ? 'Retrying...' : 'Retry'}
            </Button>
          </div>
        ) : (
          <>
            <span className="text-sm">{content}</span>

            {/* Plan approval — shows when plan is pending */}
            {plan && planStatus === 'pending' && (
              <PlanApproval
                messageId={messageId}
                planJson={plan}
                onApproved={() => {
                  queryClient.invalidateQueries(trpc.messages.getMany.queryOptions({ projectId }))
                }}
                onRejected={() => {
                  queryClient.invalidateQueries(trpc.messages.getMany.queryOptions({ projectId }))
                }}
              />
            )}

            {fragment && (
              <FragmentCard
                fragment={fragment}
                isActiveFragment={isActiveFragment}
                onFragmentClick={onFragmentClick}
              />
            )}

            {/* Missing key banner — non-blocking, shown below fragment card */}
            {fragment && missingProviders.length > 0 && (
              <MissingKeyBanner missingProviders={missingProviders} projectId={projectId} />
            )}

            {/* Deferred tasks from the approved plan — fills textarea, does NOT auto-submit */}
            {isLatest && fragment && planStatus !== 'pending' && (() => {
              try {
                const parsed = plan ? JSON.parse(plan) : null
                const deferred: string[] = Array.isArray(parsed?.deferredTasks) ? parsed.deferredTasks : []
                return deferred.length > 0
                  ? <NextStepSuggestions tasks={deferred} onSelect={onSuggestionSelect} />
                  : null
              } catch {
                return null
              }
            })()}

            {/* AI-generated suggestions — only on latest successful generation */}
            {isLatest && fragment && planStatus !== 'pending' && (
              <Suggestions
                projectId={projectId}
                summary={`${fragment.title}: ${content}`}
                onSelect={onSuggestionSelect}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

export const MessageCard = ({
  content, role, fragment, createdAt, isActiveFragment, onFragmentClick,
  type, projectId, imageUrl, isLatest = false, onSuggestionSelect,
  messageId, plan, planStatus, requiredIntegrations,
}: MessageCardProps) => {
  if (role === 'ASSISTANT') {
    return (
      <AssistantMessage
        content={content} fragment={fragment} createdAt={createdAt}
        isActiveFragment={isActiveFragment} onFragmentClick={onFragmentClick}
        type={type} projectId={projectId}
        isLatest={isLatest}
        onSuggestionSelect={onSuggestionSelect ?? (() => {})}
        messageId={messageId}
        plan={plan}
        planStatus={planStatus}
        requiredIntegrations={requiredIntegrations}
      />
    )
  }
  return <UserMessage content={content} imageUrl={imageUrl} plan={plan} planStatus={planStatus} messageId={messageId} projectId={projectId} />
}

