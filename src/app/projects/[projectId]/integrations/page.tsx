'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeftIcon, CheckIcon, Loader2Icon, Trash2Icon, ShieldIcon,
  KeyIcon, MailIcon, DatabaseIcon, CreditCardIcon, BrainIcon,
  PlusIcon, ExternalLinkIcon, EyeIcon, EyeOffIcon, XIcon,
  WrenchIcon, SparklesIcon,
} from 'lucide-react'
import { useTRPC } from '@/trpc/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { IntegrationProvider } from '@/generated/prisma'
import { SupabaseButton } from '@/components/supabase-button'

// ── Supabase auto-provision section ──────────────────────────────────────────

function SupabaseProvisionSection({ projectId }: { projectId: string }) {
  const trpc = useTRPC()
  const { data: project } = useQuery(trpc.projects.getOne.queryOptions({ id: projectId }))

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b bg-muted/30">
        <SparklesIcon className="size-4 text-emerald-400" />
        <h2 className="text-sm font-semibold">Supabase Auto-Provision</h2>
        <span className="ml-auto text-xs text-muted-foreground border rounded-full px-2 py-0.5">Pro</span>
      </div>

      <div className="px-5 py-4 space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Instantly create a dedicated Supabase project for this app — URL, anon key, and service role key
          are provisioned automatically. No copy-pasting required.
        </p>

        {project?.supabaseUrl && (
          <div className="rounded-lg bg-green-500/5 border border-green-500/20 px-3 py-2.5 space-y-1">
            <p className="text-xs font-medium text-green-600 dark:text-green-400">Supabase connected ✓</p>
            <p className="text-[11px] font-mono text-muted-foreground truncate">{project.supabaseUrl}</p>
          </div>
        )}

        <SupabaseButton
          projectId={projectId}
          supabaseUrl={project?.supabaseUrl}
          supabaseAnonKey={project?.supabaseAnonKey}
        />

        {!project?.supabaseUrl && (
          <p className="text-[11px] text-muted-foreground">
            Requires a Pro or Team plan and <code className="bg-muted px-1 rounded text-[10px]">SUPABASE_ACCESS_TOKEN</code> configured on the server.
            See <code className="bg-muted px-1 rounded text-[10px]">INSTRUCTIONS.md</code> for setup steps.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Provider definitions ──────────────────────────────────────────────────────

interface ProviderDef {
  provider: IntegrationProvider
  label: string
  envVar: string
  placeholder: string
  docsUrl: string
  steps: string[]
  note?: string
}

interface SectionDef {
  title: string
  icon: React.ElementType
  color: string
  bgColor: string
  borderColor: string
  providers: ProviderDef[]
}

const SECTIONS: SectionDef[] = [
  {
    title: 'Email',
    icon: MailIcon,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
    providers: [
      {
        provider: 'resend',
        label: 'Resend',
        envVar: 'RESEND_API_KEY',
        placeholder: 're_...',
        docsUrl: 'https://resend.com/api-keys',
        steps: [
          'Go to resend.com and sign in to your account.',
          'Click "API Keys" in the left sidebar.',
          'Click "Create API Key", give it a name, and set permission to "Sending access".',
          'Copy the key that starts with re_ and paste it below.',
        ],
        note: 'Free tier allows 3,000 emails/month and 100/day.',
      },
    ],
  },
  {
    title: 'Database',
    icon: DatabaseIcon,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
    providers: [
      {
        provider: 'supabase_url',
        label: 'Supabase URL',
        envVar: 'NEXT_PUBLIC_SUPABASE_URL',
        placeholder: 'https://xxxxxxxxxxxx.supabase.co',
        docsUrl: 'https://supabase.com/dashboard',
        steps: [
          'Open your project in the Supabase Dashboard.',
          'Go to Project Settings → API (left sidebar).',
          'Under "Project URL", copy the URL that looks like https://xxxx.supabase.co.',
          'Paste it below.',
        ],
      },
      {
        provider: 'supabase_anon_key',
        label: 'Supabase Anon Key',
        envVar: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        placeholder: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        docsUrl: 'https://supabase.com/dashboard',
        steps: [
          'Open your project in the Supabase Dashboard.',
          'Go to Project Settings → API.',
          'Under "Project API Keys", find the anon public key.',
          'Copy the long eyJ... string and paste it below.',
        ],
        note: 'Safe to expose in frontend code — Row Level Security controls access.',
      },
      {
        provider: 'supabase_service_key',
        label: 'Supabase Service Role Key',
        envVar: 'SUPABASE_SERVICE_ROLE_KEY',
        placeholder: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        docsUrl: 'https://supabase.com/dashboard',
        steps: [
          'Open your project in the Supabase Dashboard.',
          'Go to Project Settings → API.',
          'Under "Project API Keys", find the service_role key.',
          'Click "Reveal" and copy the key.',
          'Paste it below — this key bypasses RLS so keep it secret.',
        ],
        note: '⚠️ Never expose this key in frontend code. It bypasses all Row Level Security.',
      },
    ],
  },
  {
    title: 'Payments',
    icon: CreditCardIcon,
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/10',
    borderColor: 'border-violet-500/20',
    providers: [
      {
        provider: 'stripe_secret_key',
        label: 'Stripe Secret Key',
        envVar: 'STRIPE_SECRET_KEY',
        placeholder: 'sk_live_... or sk_test_...',
        docsUrl: 'https://dashboard.stripe.com/apikeys',
        steps: [
          'Go to dashboard.stripe.com and sign in.',
          'Click "Developers" in the top nav, then "API keys".',
          'Use the "Test mode" toggle to switch between test and live keys.',
          'Copy the Secret key (starts with sk_test_ or sk_live_).',
          'Paste it below.',
        ],
        note: 'Start with sk_test_ keys during development. Switch to sk_live_ before going live.',
      },
      {
        provider: 'stripe_publishable_key',
        label: 'Stripe Publishable Key',
        envVar: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
        placeholder: 'pk_live_... or pk_test_...',
        docsUrl: 'https://dashboard.stripe.com/apikeys',
        steps: [
          'Go to dashboard.stripe.com → Developers → API keys.',
          'Copy the Publishable key (starts with pk_test_ or pk_live_).',
          'Paste it below.',
        ],
        note: 'Safe to use in frontend code — only initiates payment intents, cannot charge.',
      },
    ],
  },
  {
    title: 'AI',
    icon: BrainIcon,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20',
    providers: [
      {
        provider: 'figma_token',
        label: 'Figma',
        envVar: 'FIGMA_ACCESS_TOKEN',
        placeholder: 'figd_...',
        docsUrl: 'https://www.figma.com/developers/api#access-tokens',
        steps: [
          'Go to figma.com and sign in.',
          'Click your profile icon (top left) → Settings.',
          'Scroll to "Personal access tokens" → click "Generate new token".',
          'Give it a name and click "Generate token".',
          'Copy the token immediately — it starts with figd_.',
          'Paste it below.',
        ],
        note: 'Required to import your own Figma designs. Each user needs their own token — Figma tokens only access files your Figma account can view.',
      },
        label: 'OpenRouter',
        envVar: 'OPENROUTER_API_KEY',
        placeholder: 'sk-or-...',
        docsUrl: 'https://openrouter.ai/keys',
        steps: [
          'Go to openrouter.ai and sign in.',
          'Click your profile icon → "Keys".',
          'Click "Create Key", give it a name, and click "Create".',
          'Copy the key immediately — it starts with sk-or-.',
          'Paste it below.',
        ],
        note: 'OpenRouter gives access to many AI models including free ones. Your generated app can use any model via the OpenRouter API.',
      },
      {
        provider: 'openai_api_key',
        label: 'OpenAI',
        envVar: 'OPENAI_API_KEY',
        placeholder: 'sk-...',
        docsUrl: 'https://platform.openai.com/api-keys',
        steps: [
          'Go to platform.openai.com and sign in.',
          'Click your profile icon (top right) → "API keys".',
          'Click "Create new secret key", give it a name, and click "Create secret key".',
          "Copy the key immediately — it won't be shown again.",
          'Paste it below.',
        ],
        note: 'Add billing credits at platform.openai.com/settings/billing to avoid rate limits.',
      },
    ],
  },
]

// ── Guided Connect Modal ──────────────────────────────────────────────────────

interface ConnectModalProps {
  provider: ProviderDef
  section: SectionDef
  projectId: string
  isSaved: boolean
  onClose: () => void
}

function ConnectModal({ provider, section, projectId, isSaved, onClose }: ConnectModalProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [value, setValue] = useState('')
  const [showValue, setShowValue] = useState(false)
  const [saved, setSaved] = useState(false)

  const upsert = useMutation(trpc.integrations.upsert.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries(trpc.integrations.getMany.queryOptions({ projectId }))
      setValue('')
      setSaved(true)
      toast.success(`${provider.label} connected`)
      setTimeout(() => onClose(), 1200)
    },
    onError: (e) => toast.error(e.message),
  }))

  const handleSave = () => {
    if (!value.trim()) return
    upsert.mutate({ projectId, provider: provider.provider, key: value.trim() })
  }

  const SectionIcon = section.icon

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md rounded-2xl border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={cn('flex items-center gap-3 px-5 py-4 border-b rounded-t-2xl', section.bgColor)}>
          <div className={cn('size-9 rounded-lg border flex items-center justify-center', section.bgColor, section.borderColor)}>
            <SectionIcon className={cn('size-4', section.color)} />
          </div>
          <div>
            <p className="text-sm font-semibold">{provider.label}</p>
            <p className="text-xs text-muted-foreground font-mono">{provider.envVar}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Steps */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">How to get your key</p>
            <ol className="space-y-2">
              {provider.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                  <span className={cn('size-4 rounded-full text-[10px] font-semibold flex items-center justify-center flex-shrink-0 mt-0.5', section.bgColor, section.color)}>
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {/* Docs link */}
          <a
            href={provider.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn('inline-flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-80', section.color)}
          >
            <ExternalLinkIcon className="size-3" />
            Open {provider.label} Dashboard
          </a>

          {/* Note */}
          {provider.note && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 border">
              {provider.note}
            </p>
          )}

          {/* Input */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {isSaved ? 'Update key' : 'Paste your key'}
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showValue ? 'text' : 'password'}
                  placeholder={isSaved ? '••••••••••••••••' : provider.placeholder}
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
              <Button
                size="sm"
                className="h-9 gap-1.5 min-w-[80px]"
                disabled={!value.trim() || upsert.isPending}
                onClick={handleSave}
              >
                {upsert.isPending ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : saved ? (
                  <><CheckIcon className="size-3.5" /> Saved</>
                ) : (
                  isSaved ? 'Update' : 'Connect'
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Custom Key Modal ──────────────────────────────────────────────────────────

interface CustomKeyModalProps {
  projectId: string
  onClose: () => void
}

function CustomKeyModal({ projectId, onClose }: CustomKeyModalProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [envVar, setEnvVar] = useState('')
  const [value, setValue] = useState('')
  const [showValue, setShowValue] = useState(false)
  const [saved, setSaved] = useState(false)

  const upsert = useMutation(trpc.integrations.upsert.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries(trpc.integrations.getMany.queryOptions({ projectId }))
      setEnvVar('')
      setValue('')
      setSaved(true)
      toast.success('Custom key saved')
      setTimeout(() => onClose(), 1200)
    },
    onError: (e) => toast.error(e.message),
  }))

  const handleSave = () => {
    if (!envVar.trim() || !value.trim()) return
    upsert.mutate({
      projectId,
      provider: 'custom' as IntegrationProvider,
      key: value.trim(),
      customEnvVar: envVar.trim().toUpperCase(),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md rounded-2xl border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b rounded-t-2xl bg-muted/30">
          <div className="size-9 rounded-lg border bg-muted/50 flex items-center justify-center">
            <WrenchIcon className="size-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold">Custom Key</p>
            <p className="text-xs text-muted-foreground">Any env var not in the list above</p>
          </div>
          <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-muted-foreground">
            Use this for any third-party service not listed above — Twilio, SendGrid, Cloudinary, etc.
            The env var name will be injected into your sandbox exactly as you type it.
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Env var name</label>
            <Input
              placeholder="TWILIO_AUTH_TOKEN"
              value={envVar}
              onChange={(e) => setEnvVar(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
              className="font-mono text-xs h-9"
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">Uppercase letters, numbers, underscores only</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Value</label>
            <div className="relative">
              <Input
                type={showValue ? 'text' : 'password'}
                placeholder="Paste your key or secret"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                className="pr-9 font-mono text-xs h-9"
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
          </div>

          <Button
            className="w-full gap-1.5"
            disabled={!envVar.trim() || !value.trim() || upsert.isPending}
            onClick={handleSave}
          >
            {upsert.isPending ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : saved ? (
              <><CheckIcon className="size-3.5" /> Saved</>
            ) : (
              'Save Custom Key'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Provider Card ─────────────────────────────────────────────────────────────

interface ProviderCardProps {
  provider: ProviderDef
  section: SectionDef
  projectId: string
  isSaved: boolean
  savedAt?: Date
  onConnect: () => void
  onDelete: () => void
  isDeleting: boolean
}

function ProviderCard({ provider, section, isSaved, savedAt, onConnect, onDelete, isDeleting }: ProviderCardProps) {
  const SectionIcon = section.icon

  return (
    <div className="flex items-center gap-3 p-4 border-b last:border-0">
      <div className={cn('size-8 rounded-lg border flex items-center justify-center flex-shrink-0', section.bgColor, section.borderColor)}>
        <SectionIcon className={cn('size-3.5', section.color)} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{provider.label}</p>
          {isSaved ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/20 font-medium">
              Connected
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border font-medium">
              Not connected
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">{provider.envVar}</p>
        {isSaved && savedAt && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Updated {new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(savedAt)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {isSaved && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-muted-foreground hover:text-destructive"
            disabled={isDeleting}
            onClick={onDelete}
          >
            {isDeleting ? <Loader2Icon className="size-3.5 animate-spin" /> : <Trash2Icon className="size-3.5" />}
          </Button>
        )}
        <Button
          size="sm"
          variant={isSaved ? 'outline' : 'default'}
          className="h-7 text-xs gap-1.5"
          onClick={onConnect}
        >
          {isSaved ? 'Update' : <><PlusIcon className="size-3" />Connect</>}
        </Button>
      </div>
    </div>
  )
}

// ── Custom Keys Section ───────────────────────────────────────────────────────

interface CustomKeyRowProps {
  customConfigs: Array<{ provider: string; customEnvVar?: string | null; updatedAt: Date }>
  onAdd: () => void
  onDelete: (provider: string) => void
  isDeletingProvider: string | null
}

function CustomKeysSection({ customConfigs, onAdd, onDelete, isDeletingProvider }: CustomKeyRowProps) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b bg-muted/30">
        <WrenchIcon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Custom Keys</h2>
        <span className="ml-auto text-xs text-muted-foreground">{customConfigs.length} configured</span>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 ml-2" onClick={onAdd}>
          <PlusIcon className="size-3" />Add
        </Button>
      </div>

      {customConfigs.length === 0 ? (
        <div className="px-5 py-6 text-center">
          <p className="text-xs text-muted-foreground">
            No custom keys yet. Use this for any provider not listed above — Twilio, SendGrid, Cloudinary, etc.
          </p>
        </div>
      ) : (
        <div className="px-5">
          {customConfigs.map((c) => (
            <div key={c.customEnvVar} className="flex items-center gap-3 py-3.5 border-b last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono font-medium">{c.customEnvVar}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Updated {new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(c.updatedAt)}
                </p>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/20 font-medium">
                Connected
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-muted-foreground hover:text-destructive"
                disabled={isDeletingProvider === c.customEnvVar}
                onClick={() => onDelete(c.provider)}
              >
                {isDeletingProvider === c.customEnvVar
                  ? <Loader2Icon className="size-3.5 animate-spin" />
                  : <Trash2Icon className="size-3.5" />}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const [activeModal, setActiveModal] = useState<
    | { type: 'provider'; provider: ProviderDef; section: SectionDef }
    | { type: 'custom' }
    | null
  >(null)
  const [deletingProvider, setDeletingProvider] = useState<string | null>(null)

  const { data: configs = [], isLoading } = useQuery(
    trpc.integrations.getMany.queryOptions({ projectId })
  )

  const savedMap = Object.fromEntries(configs.map((c) => [c.provider, c]))
  const customConfigs = configs.filter((c) => c.provider === 'custom')

  const remove = useMutation(trpc.integrations.delete.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries(trpc.integrations.getMany.queryOptions({ projectId }))
      setDeletingProvider(null)
      toast.info('Key removed')
    },
    onError: (e) => {
      setDeletingProvider(null)
      toast.error(e.message)
    },
  }))

  const handleDelete = (provider: IntegrationProvider) => {
    setDeletingProvider(provider)
    remove.mutate({ projectId, provider })
  }

  const totalConfigured = configs.filter((c) => c.provider !== 'custom').length
  const totalProviders = SECTIONS.reduce((acc, s) => acc + s.providers.length, 0)

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div className="space-y-4">
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground -ml-2">
            <Link href={`/projects/${projectId}`}>
              <ArrowLeftIcon className="size-3.5" />
              Back to project
            </Link>
          </Button>

          <div className="flex items-start gap-3">
            <div className="size-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <KeyIcon className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Integrations</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Connect third-party services to your project. Keys are encrypted and injected
                at runtime — they never appear in AI prompts or frontend code.
              </p>
            </div>
          </div>

          {/* Progress bar */}
          {!isLoading && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">{totalConfigured} of {totalProviders} providers connected</p>
                  <p className="text-xs text-muted-foreground">{Math.round((totalConfigured / totalProviders) * 100)}%</p>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${(totalConfigured / totalProviders) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Security notice */}
          <div className="flex items-start gap-2.5 rounded-lg bg-green-500/5 border border-green-500/20 p-3">
            <ShieldIcon className="size-4 text-green-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Keys are encrypted with AES-256-GCM before storage. They are decrypted only inside the
              isolated E2B sandbox at generation time — never logged, never sent to AI models, never
              exposed in API responses.
            </p>
          </div>
        </div>

        {/* Connector sections */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {SECTIONS.map((section) => (
              <div key={section.title} className="rounded-xl border bg-card overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b bg-muted/30">
                  <section.icon className={cn('size-4', section.color)} />
                  <h2 className="text-sm font-semibold">{section.title}</h2>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {section.providers.filter((p) => savedMap[p.provider]).length}/{section.providers.length} connected
                  </span>
                </div>
                <div>
                  {section.providers.map((provider) => (
                    <ProviderCard
                      key={provider.provider}
                      provider={provider}
                      section={section}
                      projectId={projectId}
                      isSaved={!!savedMap[provider.provider]}
                      savedAt={savedMap[provider.provider]?.updatedAt}
                      onConnect={() => setActiveModal({ type: 'provider', provider, section })}
                      onDelete={() => handleDelete(provider.provider)}
                      isDeleting={deletingProvider === provider.provider}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Custom keys */}
            <CustomKeysSection
              customConfigs={customConfigs}
              onAdd={() => setActiveModal({ type: 'custom' })}
              onDelete={(provider) => handleDelete(provider as IntegrationProvider)}
              isDeletingProvider={deletingProvider}
            />

            {/* Supabase auto-provision */}
            <SupabaseProvisionSection projectId={projectId} />
          </div>
        )}

        {/* How it works */}
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="text-sm font-semibold">How it works</h3>
          <ol className="space-y-2">
            {[
              'Request a feature that needs a third-party API — e.g. "Add email signup with Resend"',
              'AI generates code using process.env.RESEND_API_KEY with a clear mock fallback',
              'Preview works in stub mode showing a "Missing key" notice until you connect',
              'Connect your key here → the next generation injects it live into the sandbox',
              'Real API calls work in preview — no .env files, no manual setup needed',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                <span className="size-4 rounded-full bg-primary/10 text-primary text-[10px] font-medium flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

      </div>

      {/* Modals */}
      {activeModal?.type === 'provider' && (
        <ConnectModal
          provider={activeModal.provider}
          section={activeModal.section}
          projectId={projectId}
          isSaved={!!savedMap[activeModal.provider.provider]}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal?.type === 'custom' && (
        <CustomKeyModal
          projectId={projectId}
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  )
}
