import type { Metadata } from 'next'
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { TRPCReactProvider } from '@/trpc/client'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from 'next-themes'
import { FeedbackWidget } from '@/components/feedback-widget'
import { Onboarding } from '@/components/onboarding'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const jakartaSans = Plus_Jakarta_Sans({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['600', '700', '800'],
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://isotope.app'),
  title: {
    default: 'Isotope — Build Apps with AI',
    template: '%s | Isotope',
  },
  description: 'Describe what you want and get a working Next.js app in seconds. Live preview, GitHub sync, Vercel deploy, Supabase database, and Figma import — all in one AI-powered builder.',
  keywords: ['AI app builder', 'vibe coding', 'AI code generator', 'Next.js app generator', 'no-code', 'Bolt alternative', 'Lovable alternative'],
  authors: [{ name: 'Isotope' }],
  creator: 'Isotope',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: process.env.NEXT_PUBLIC_APP_URL || 'https://isotope.app',
    siteName: 'Isotope',
    title: 'Isotope — Build Apps with AI',
    description: 'Describe what you want and get a working Next.js app in seconds. Live preview, GitHub sync, Vercel deploy, and more.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Isotope — Build Apps with AI' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Isotope — Build Apps with AI',
    description: 'Describe what you want and get a working Next.js app in seconds.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          // Brand primary — matches --primary in globals.css
          // This is the safe server-side default; client pages override with full theme
          colorPrimary: '#7C3AED',
          borderRadius: '0.5rem',
          fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
          fontFamilyButtons: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
          fontSize: '0.875rem',
          colorDanger: '#F43F5E',
          colorSuccess: '#3FB950',
        },
        elements: {
          cardBox: 'border! shadow-none! rounded-xl!',
          card: 'shadow-none! rounded-xl!',
        },
      }}
    >
      <TRPCReactProvider>
        <html lang="en" suppressHydrationWarning>
          <body className={`${geistSans.variable} ${geistMono.variable} ${jakartaSans.variable} antialiased`}>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              <Toaster />
              <FeedbackWidget />
              <Onboarding />
              {children}
            </ThemeProvider>
          </body>
        </html>
      </TRPCReactProvider>
    </ClerkProvider>
  )
}
