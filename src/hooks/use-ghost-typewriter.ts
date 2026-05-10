import { useState, useEffect, useRef, useCallback } from 'react'

// ── Hero prompts that cycle through the ghost text ───────────────────────────
// Keep these specific and high-value — they should show what Isotope can build
export const HERO_PROMPTS = [
  'Build a full-stack SaaS dashboard with Stripe subscriptions and user management',
  'Create an n8n-style workflow automation tool with drag-and-drop nodes',
  'Build a real-time collaborative whiteboard with WebSockets and Supabase',
  'Create a Shopify-style storefront with cart, checkout, and Stripe payments',
  'Build a multi-tenant CRM with contacts, deals pipeline, and email integration',
  'Create a job board with listings, applications, and employer dashboard',
  'Build a social media scheduler with post queue and analytics dashboard',
  'Create an AI writing assistant with streaming responses and document editor',
  'Build a booking system with calendar, availability, and Stripe payments',
  'Create a finance tracker with Plaid integration, charts, and budget goals',
]

// ── Typing speed range (ms per character) ────────────────────────────────────
const MIN_TYPE_SPEED = 35
const MAX_TYPE_SPEED = 75
const ERASE_SPEED = 18        // faster erase feels snappy
const PAUSE_AFTER_TYPE = 2200 // how long to hold the fully-typed prompt
const PAUSE_BEFORE_ERASE = 400

type Phase = 'typing' | 'holding' | 'erasing' | 'pausing'

export interface GhostTypewriterState {
  /** Current ghost text to display */
  ghostText: string
  /** Whether the blinking cursor should show */
  showCursor: boolean
  /** Call this when input is focused — kills animation immediately */
  interrupt: () => void
  /** Call this when input is blurred and empty — restarts animation */
  resume: () => void
}

export function useGhostTypewriter(active: boolean): GhostTypewriterState {
  const [ghostText, setGhostText] = useState('')
  const [showCursor, setShowCursor] = useState(true)

  const promptIndexRef = useRef(0)
  const charIndexRef   = useRef(0)
  const phaseRef       = useRef<Phase>('typing')
  const timerRef       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef      = useRef(active)

  // Keep activeRef in sync without restarting the animation on every render
  useEffect(() => { activeRef.current = active }, [active])

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const tick = useCallback(() => {
    if (!activeRef.current) return

    const prompt = HERO_PROMPTS[promptIndexRef.current]
    const phase  = phaseRef.current

    if (phase === 'typing') {
      const nextChar = charIndexRef.current + 1
      setGhostText(prompt.slice(0, nextChar))
      charIndexRef.current = nextChar

      if (nextChar >= prompt.length) {
        phaseRef.current = 'holding'
        timerRef.current = setTimeout(tick, PAUSE_AFTER_TYPE)
      } else {
        // Variable speed — slightly randomised per character
        const speed = MIN_TYPE_SPEED + Math.random() * (MAX_TYPE_SPEED - MIN_TYPE_SPEED)
        timerRef.current = setTimeout(tick, speed)
      }
      return
    }

    if (phase === 'holding') {
      phaseRef.current = 'erasing'
      timerRef.current = setTimeout(tick, PAUSE_BEFORE_ERASE)
      return
    }

    if (phase === 'erasing') {
      const nextChar = charIndexRef.current - 1
      setGhostText(prompt.slice(0, nextChar))
      charIndexRef.current = nextChar

      if (nextChar <= 0) {
        phaseRef.current = 'pausing'
        promptIndexRef.current = (promptIndexRef.current + 1) % HERO_PROMPTS.length
        timerRef.current = setTimeout(tick, 500)
      } else {
        timerRef.current = setTimeout(tick, ERASE_SPEED)
      }
      return
    }

    if (phase === 'pausing') {
      charIndexRef.current = 0
      phaseRef.current = 'typing'
      timerRef.current = setTimeout(tick, 300)
    }
  }, [])

  // Start / stop based on `active` prop
  useEffect(() => {
    if (active) {
      // Reset and start
      charIndexRef.current = 0
      phaseRef.current = 'typing'
      setGhostText('')
      timerRef.current = setTimeout(tick, 600) // short delay before first char
    } else {
      clearTimer()
      setGhostText('')
    }

    return clearTimer
  }, [active, tick, clearTimer])

  // Blinking cursor — pure CSS interval, separate from typing loop
  useEffect(() => {
    if (!active) { setShowCursor(false); return }
    const id = setInterval(() => setShowCursor((v) => !v), 530)
    return () => clearInterval(id)
  }, [active])

  const interrupt = useCallback(() => {
    clearTimer()
    setGhostText('')
    setShowCursor(false)
  }, [clearTimer])

  const resume = useCallback(() => {
    charIndexRef.current = 0
    phaseRef.current = 'typing'
    setGhostText('')
    setShowCursor(true)
    timerRef.current = setTimeout(tick, 400)
  }, [tick])

  return { ghostText, showCursor, interrupt, resume }
}
