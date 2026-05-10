import { dark } from '@clerk/themes'
import type { Appearance } from '@clerk/nextjs/server'

// ── Brand colors — match globals.css exactly ──────────────────────────────────
// Primary violet
const PRIMARY_LIGHT = '#7C3AED'   // oklch(0.4912 0.2661 293.06) — violet-600
const PRIMARY_DARK  = '#A78BFA'   // oklch(0.7029 0.1872 293.06) — violet-400

// Destructive rose
const DESTRUCTIVE = '#F43F5E'     // rose-500

// Light mode surfaces
const LIGHT = {
  background:   '#FAFAFA',   // --background
  surface:      '#FFFFFF',   // --popover
  inputBg:      '#FAFAFA',   // --background
  inputBorder:  '#E4E4E7',   // --border
  text:         '#18181B',   // --foreground
  textSecondary:'#71717A',   // --muted-foreground
}

// Dark mode surfaces — true black (Vercel/Linear style)
const DARK = {
  background:   '#09090B',   // --background
  surface:      '#18181B',   // --popover / --card
  inputBg:      '#242427',   // --muted / --secondary
  inputBorder:  '#27272A',   // --border
  text:         '#FAFAFA',   // --foreground
  textSecondary:'#71717A',   // --muted-foreground
}

const sharedElements = {
  cardBox:              'border! shadow-none! rounded-xl!',
  card:                 'shadow-none! rounded-xl!',
  navbar:               'border-r!',
  navbarMobileMenuRow:  'border-b!',
  pageScrollBox:        'p-6!',
  modalContent:         'rounded-xl!',
}

export function getClerkAppearance(theme: string | undefined): Appearance {
  const isDark = theme === 'dark'
  const colors = isDark ? DARK : LIGHT
  const primary = isDark ? PRIMARY_DARK : PRIMARY_LIGHT

  return {
    baseTheme: isDark ? dark : undefined,
    variables: {
      colorPrimary:         primary,
      colorBackground:      colors.background,
      colorInputBackground: colors.inputBg,
      colorInputText:       colors.text,
      colorText:            colors.text,
      colorTextSecondary:   colors.textSecondary,
      colorNeutral:         colors.text,
      colorDanger:          DESTRUCTIVE,
      colorSuccess:         '#22C55E',   // green-500
      borderRadius:         '0.5rem',
      fontFamily:           'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
      fontFamilyButtons:    'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
      fontSize:             '0.875rem',
    },
    elements: sharedElements,
  }
}
