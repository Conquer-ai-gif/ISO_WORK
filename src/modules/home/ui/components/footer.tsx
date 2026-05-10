'use client'

import Link from 'next/link'
import Image from 'next/image'
import { GithubIcon, TwitterIcon } from 'lucide-react'

const FOOTER_LINKS = {
  product: [
    { name: 'Docs',        href: '/docs' },
    { name: 'Find Work',   href: '/find-work' },
    { name: 'Marketplace', href: '/marketplace' },
    { name: 'Workspaces',  href: '/workspaces' },
    { name: 'Templates',   href: '/templates' },
    { name: 'Pricing',     href: '/pricing' },
    { name: 'Changelog',   href: '/changelog' },
  ],
  company: [
    { name: 'Feedback',   href: '/feedback' },
    { name: 'Blog',       href: '/blog' },
    { name: 'Careers',    href: '/careers' },
    { name: 'Status',     href: 'https://status.isotope.app', external: true },
    { name: 'Discord',    href: 'https://discord.gg/isotope', external: true },
  ],
  legal: [
    { name: 'Terms',    href: '/terms' },
    { name: 'Privacy',  href: '/privacy' },
  ],
}

const SOCIAL_LINKS = [
  { name: 'GitHub',   href: 'https://github.com/Conquer-ai-gif/Isotope', icon: GithubIcon },
  { name: 'Twitter',  href: 'https://twitter.com/isotope_app',            icon: TwitterIcon },
]

export const Footer = () => {
  return (
    <footer className="border-t border-border bg-background/50 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-4 py-12">

        {/* Top — logo + tagline + social */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-8 mb-10">
          <div className="flex flex-col gap-3 max-w-xs">
            <Link href="/" className="flex items-center gap-2.5">
              <Image src="/logo.svg" alt="Isotope" width={28} height={28} />
              <span className="font-bold text-lg">Isotope</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Build full-stack web apps with AI — just describe what you want.
            </p>
            <div className="flex gap-3 mt-1">
              {SOCIAL_LINKS.map((social) => (
                <Link
                  key={social.name}
                  href={social.href}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <social.icon className="size-4" />
                  <span className="sr-only">{social.name}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-3 gap-8">
            <div>
              <h3 className="font-semibold text-sm mb-3">Product</h3>
              <ul className="space-y-2">
                {FOOTER_LINKS.product.map((link) => (
                  <li key={link.name}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-sm mb-3">Company</h3>
              <ul className="space-y-2">
                {FOOTER_LINKS.company.map((link) => (
                  <li key={link.name}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      {...('external' in link && link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-sm mb-3">Legal</h3>
              <ul className="space-y-2">
                {FOOTER_LINKS.legal.map((link) => (
                  <li key={link.name}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border pt-6 flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <Image src="/logo.svg" alt="Isotope" width={16} height={16} className="opacity-60" />
            <p className="text-xs text-muted-foreground">© 2026 Isotope. All rights reserved.</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Built with Isotope ⚛
          </p>
        </div>

      </div>
    </footer>
  )
}
