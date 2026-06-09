'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { SignedOut, SignInButton, SignUpButton, SignedIn } from '@clerk/nextjs'
import { MenuIcon, XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { UserControl } from '@/components/user-control'
import { useScroll } from '@/hooks/use-scroll'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { label: 'Docs',        href: '/docs' },
  { label: 'Marketplace', href: '/marketplace' },
  { label: 'Workspaces',  href: '/workspaces' },
  { label: 'Templates',   href: '/templates' },
  { label: 'Usage',       href: '/usage' },
  { label: 'Feedback',    href: '/feedback' },
  { label: 'Changelog',   href: '/changelog' },
  { label: 'Settings',    href: '/settings' },
]

export const Navbar = () => {
  const isScrolled = useScroll()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <>
      <nav className={cn(
        'p-4 bg-background/95 backdrop-blur-md fixed top-0 left-0 right-0 z-50 transition-all duration-200 border-b border-transparent',
        isScrolled && 'bg-background/95 border-border',
      )}>
        <div className="max-w-5xl mx-auto w-full flex justify-between items-center">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.svg" alt="Isotope" width={24} height={24} />
            <span className="font-semibold text-lg">Isotope</span>
          </Link>

          {/* Signed out */}
          <SignedOut>
            <div className="flex gap-2">
              <SignUpButton>
                <Button variant="outline" size="sm">Sign up</Button>
              </SignUpButton>
              <SignInButton>
                <Button size="sm">Sign in</Button>
              </SignInButton>
            </div>
          </SignedOut>

          {/* Signed in — desktop links */}
          <SignedIn>
            <div className="flex items-center gap-3">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block"
                >
                  {link.label}
                </Link>
              ))}

              {/* Mobile hamburger */}
              <button
                className="sm:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
              >
                <MenuIcon className="size-5" />
              </button>

              <UserControl showName />
            </div>
          </SignedIn>
        </div>
      </nav>

      {/* Mobile drawer overlay */}
      <SignedIn>
        {drawerOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm sm:hidden"
              onClick={() => setDrawerOpen(false)}
            />

            {/* Bottom sheet */}
            <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-background border-t border-border rounded-t-2xl shadow-xl">
              {/* Handle bar */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b">
                <div className="flex items-center gap-2">
                  <Image src="/logo.svg" alt="Isotope" width={20} height={20} />
                  <span className="font-semibold text-sm">Isotope</span>
                </div>
                <button
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  onClick={() => setDrawerOpen(false)}
                >
                  <XIcon className="size-4" />
                </button>
              </div>

              {/* Nav links */}
              <nav className="px-3 py-3 grid grid-cols-2 gap-1">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    onClick={() => setDrawerOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>

              {/* Safe area spacer */}
              <div className="h-6" />
            </div>
          </>
        )}
      </SignedIn>
    </>
  )
}
