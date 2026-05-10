'use client'

import Image from 'next/image'
import { useState, useEffect } from 'react'

// Realistic step-by-step progress messages that reflect what the agent actually does
const STEPS = [
  { label: 'Reading your prompt...',       duration: 2000 },
  { label: 'Planning the structure...',     duration: 3000 },
  { label: 'Creating sandbox...',           duration: 4000 },
  { label: 'Writing components...',         duration: 5000 },
  { label: 'Installing packages...',        duration: 4000 },
  { label: 'Wiring up the logic...',        duration: 4000 },
  { label: 'Styling the interface...',      duration: 3000 },
  { label: 'Compiling...',                  duration: 3000 },
  { label: 'Almost ready...',               duration: 99999 }, // stays here until done
]

const ProgressDots = () => (
  <span className="inline-flex gap-0.5 ml-0.5">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="inline-block size-1 rounded-full bg-current opacity-40 animate-bounce"
        style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.8s' }}
      />
    ))}
  </span>
)

export const MessageLoading = () => {
  const [stepIndex, setStepIndex] = useState(0)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (stepIndex >= STEPS.length - 1) return

    const step = STEPS[stepIndex]
    const timer = setTimeout(() => {
      setStepIndex((i) => Math.min(i + 1, STEPS.length - 1))
    }, step.duration)

    return () => clearTimeout(timer)
  }, [stepIndex])

  // Smooth progress bar — advances proportionally through steps
  useEffect(() => {
    const totalSteps = STEPS.length - 1
    const targetProgress = Math.round((stepIndex / totalSteps) * 90) // max 90% until done
    const timer = setTimeout(() => setProgress(targetProgress), 100)
    return () => clearTimeout(timer)
  }, [stepIndex])

  return (
    <div className="flex flex-col group px-2 pb-4">
      <div className="flex items-center gap-2 pl-2 mb-2">
        <Image src="/logo.svg" alt="Isotope" width={18} height={18} className="shrink-0" />
        <span className="text-sm font-medium">Isotope</span>
      </div>

      <div className="pl-8 flex flex-col gap-3">
        {/* Step label */}
        <p className="text-sm text-muted-foreground">
          {STEPS[stepIndex].label}
          <ProgressDots />
        </p>

        {/* Progress bar */}
        <div className="w-48 h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  )
}
