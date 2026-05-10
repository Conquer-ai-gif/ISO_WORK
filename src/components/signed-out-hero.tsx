'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRightIcon, MoreHorizontalIcon, BookOpenIcon, TagIcon, LayoutTemplateIcon, ScrollTextIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ── Signed-out prompt input ───────────────────────────────────────────────────
// Captures the prompt then redirects to sign-up with it pre-filled
export function SignedOutPromptInput() {
  const [value, setValue] = useState('')
  const router = useRouter()

  const handleSubmit = () => {
    if (!value.trim()) return
    router.push(`/sign-up?prompt=${encodeURIComponent(value.trim())}`)
  }

  return (
    <div className="w-full max-w-2xl border border-border rounded-xl bg-background/80 backdrop-blur-sm overflow-hidden shadow-sm">
      <textarea
        className="w-full resize-none border-none outline-none bg-transparent text-sm px-4 pt-3 pb-2 min-h-[60px] placeholder:text-muted-foreground/50 font-sans"
        placeholder="Describe what you want to build..."
        value={value}
        rows={2}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit()
        }}
      />
      <div className="flex items-center justify-between px-3 pb-2.5 pt-1 border-t border-border/50">
        <p className="text-[11px] text-muted-foreground">Sign up to start building — free</p>
        <button
          onClick={handleSubmit}
          disabled={!value.trim()}
          className="size-7 rounded-lg bg-primary disabled:bg-muted disabled:cursor-not-allowed flex items-center justify-center transition-colors hover:bg-primary/90"
        >
          <ArrowRightIcon className="size-3.5 text-primary-foreground" />
        </button>
      </div>
    </div>
  )
}

// ── Three-dot menu for signed-out users ──────────────────────────────────────
export function SignedOutMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="lg" variant="outline" className="btn-lift px-3">
          <MoreHorizontalIcon className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem asChild>
          <Link href="/docs" className="flex items-center gap-2">
            <BookOpenIcon className="size-3.5" />Docs
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/pricing" className="flex items-center gap-2">
            <TagIcon className="size-3.5" />Pricing
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/templates" className="flex items-center gap-2">
            <LayoutTemplateIcon className="size-3.5" />Templates
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/changelog" className="flex items-center gap-2">
            <ScrollTextIcon className="size-3.5" />Changelog
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href="https://github.com/Conquer-ai-gif/Isotope"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2"
          >
            <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
            GitHub
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
