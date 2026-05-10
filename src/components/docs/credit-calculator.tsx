'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

// V2 billing cost constants — must match src/lib/usage.ts COSTS
const COSTS = {
  base:   0.2,  // always charged
  task:   0.2,  // per task executed
  search: 0.3,  // per doc search
  fix:    0.2,  // per fix loop
}

const PLANS = [
  { name: 'Free',  credits: 5,   color: 'border-border',       maxTasks: 3  },
  { name: 'Pro',   credits: 100, color: 'border-primary',      maxTasks: 10 },
  { name: 'Team',  credits: 300, color: 'border-violet-400',   maxTasks: 30 },
]

const GENERATION_TYPES = [
  { label: 'Simple',   tasks: 1, searches: 0, fixes: 0 },
  { label: 'Standard', tasks: 3, searches: 1, fixes: 1 },
  { label: 'Complex',  tasks: 8, searches: 2, fixes: 2 },
]

function calculateCost(tasks: number, searches: number, fixes: number): number {
  return COSTS.base + tasks * COSTS.task + searches * COSTS.search + fixes * COSTS.fix
}

export function CreditCalculator() {
  const [planIdx,  setPlanIdx]  = useState(0)
  const [genType,  setGenType]  = useState(1)  // Standard by default
  const [perDay,   setPerDay]   = useState(2)

  const plan   = PLANS[planIdx]
  const gen    = GENERATION_TYPES[genType]
  const cost   = calculateCost(
    Math.min(gen.tasks, plan.maxTasks),
    gen.searches,
    gen.fixes,
  )
  const costRounded  = Math.round(cost * 10) / 10
  const dailyCost    = costRounded * perDay
  const daysLeft     = dailyCost > 0 ? Math.floor(plan.credits / dailyCost) : 999
  const pct          = Math.min(100, Math.round((daysLeft / 30) * 100))

  return (
    <div className="rounded-xl border border-border bg-card p-6 my-6 space-y-6">
      <p className="text-sm font-semibold text-foreground">Credit Calculator</p>

      {/* Plan selector */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Your plan</p>
        <div className="flex gap-2">
          {PLANS.map((p, i) => (
            <button
              key={p.name}
              onClick={() => setPlanIdx(i)}
              className={cn(
                'flex-1 py-2 rounded-lg border text-sm font-medium transition-colors',
                planIdx === i
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40',
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Generation type */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Typical generation size</p>
        <div className="flex gap-2">
          {GENERATION_TYPES.map((g, i) => (
            <button
              key={g.label}
              onClick={() => setGenType(i)}
              className={cn(
                'flex-1 py-2 rounded-lg border text-sm font-medium transition-colors',
                genType === i
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40',
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center">
          {gen.tasks} task{gen.tasks !== 1 ? 's' : ''}
          {gen.searches > 0 ? ` · ${gen.searches} doc search` : ''}
          {gen.fixes > 0 ? ` · ${gen.fixes} fix loop` : ''}
          {' '}≈ <strong className="text-foreground">{costRounded} credits</strong>
        </p>
      </div>

      {/* Generations per day slider */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Generations per day</span>
          <span className="font-semibold text-foreground">{perDay}</span>
        </div>
        <input
          type="range" min={1} max={20} value={perDay}
          onChange={(e) => setPerDay(Number(e.target.value))}
          className="w-full accent-primary"
        />
      </div>

      {/* Result */}
      <div className="rounded-lg bg-muted/40 p-4 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Monthly credits</span>
          <span className="font-semibold text-foreground">{plan.credits}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Cost per generation</span>
          <span className="font-semibold text-foreground">~{costRounded} credits</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Daily spend</span>
          <span className="font-semibold text-foreground">~{Math.round(dailyCost * 10) / 10} credits</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Credits last</span>
          <span className={cn('font-semibold', daysLeft >= 30 ? 'text-green-400' : daysLeft >= 14 ? 'text-amber-400' : 'text-red-400')}>
            {daysLeft >= 30 ? 'Full month ✓' : `${daysLeft} days`}
          </span>
        </div>
        {/* Progress bar */}
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className={cn('h-2 rounded-full transition-all', pct >= 80 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500')}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground text-center">
          {daysLeft >= 30
            ? 'Your credits will last the entire month 🎉'
            : daysLeft <= 7
              ? `Running low — consider buying extra credits or upgrading`
              : `You'll run out after ${daysLeft} days at this rate`}
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        Costs: base 0.2 · task 0.2 · doc search 0.3 · fix loop 0.2 credits each
      </p>
    </div>
  )
}
