import type { Metadata } from 'next'
import { MapPinIcon, ClockIcon, ArrowRightIcon } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'

export const metadata: Metadata = {
  title: 'Careers — Isotope',
  description: 'Join the team building the future of AI-native development. We are a small, remote-first team that moves fast and ships often.',
}

const OPEN_ROLES = [
  {
    title: 'Senior Full-Stack Engineer',
    team: 'Engineering',
    location: 'Remote',
    type: 'Full-time',
    description: 'Build the core AI generation pipeline, sandbox infrastructure, and real-time streaming systems that power Isotope.',
    requirements: ['4+ years with TypeScript, Next.js, and Postgres', 'Experience with AI/LLM APIs and streaming', 'Comfortable with sandboxed execution environments'],
  },
  {
    title: 'AI/ML Engineer',
    team: 'AI',
    location: 'Remote',
    type: 'Full-time',
    description: 'Work on prompt engineering, agent orchestration, vector embeddings, and making the AI smarter at generating production-quality code.',
    requirements: ['Experience with LLM APIs (OpenAI, Anthropic, OpenRouter)', 'Knowledge of RAG, vector stores, and embeddings', 'Background in code generation or developer tooling a plus'],
  },
  {
    title: 'Product Designer',
    team: 'Design',
    location: 'Remote',
    type: 'Full-time',
    description: 'Own the end-to-end design of Isotope — from the homepage to the AI chat interface. Make the most powerful developer tool also the most beautiful.',
    requirements: ['Strong portfolio in SaaS product design', 'Proficient in Figma', 'Experience designing for developer tools or code editors a plus'],
  },
  {
    title: 'Developer Advocate',
    team: 'Growth',
    location: 'Remote',
    type: 'Full-time',
    description: 'Help developers discover Isotope through tutorials, demos, talks, and community building. Be the bridge between the product and the world.',
    requirements: ['Active presence in the developer community', 'Strong written and video communication skills', 'Experience building apps with modern web frameworks'],
  },
]

const PERKS = [
  { emoji: '🌍', title: 'Fully remote', desc: 'Work from anywhere. We care about output, not hours.' },
  { emoji: '⚡', title: 'Move fast', desc: 'Small team, big impact. Ship features that millions will use.' },
  { emoji: '🧠', title: 'AI-native', desc: 'Work at the frontier of AI-assisted development every day.' },
  { emoji: '💰', title: 'Competitive comp', desc: 'Salary + equity. We share the upside with the team.' },
  { emoji: '🏖️', title: 'Unlimited PTO', desc: 'Take time when you need it — we trust you.' },
  { emoji: '🛠️', title: 'Best tools', desc: 'Use what you need. We cover your dev setup and subscriptions.' },
]

export default function CareersPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 space-y-20">

      {/* Hero */}
      <div className="space-y-6 text-center">
        <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary">
          <span className="size-1.5 rounded-full bg-primary animate-pulse inline-block" />
          We&apos;re hiring
        </div>
        <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight">
          Build the future of <br className="hidden md:block" />
          <span className="text-primary">AI development</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
          We&apos;re a small, remote-first team on a mission to make every developer 10x more productive.
          If you love shipping great software and working at the frontier of AI, we want to hear from you.
        </p>
        <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><MapPinIcon className="size-3.5" />Remote-first</span>
          <span>·</span>
          <span>{OPEN_ROLES.length} open roles</span>
        </div>
      </div>

      {/* Perks */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-center">Why Isotope</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PERKS.map((perk) => (
            <div key={perk.title} className="card-lift rounded-xl border bg-card p-5 space-y-2">
              <span className="text-2xl">{perk.emoji}</span>
              <p className="font-semibold text-sm">{perk.title}</p>
              <p className="text-sm text-muted-foreground">{perk.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Open roles */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Open roles</h2>
        <div className="space-y-4">
          {OPEN_ROLES.map((role) => (
            <div key={role.title} className="card-lift rounded-xl border bg-card p-6 space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-1">
                  <h3 className="font-semibold text-lg">{role.title}</h3>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span className="px-2 py-0.5 rounded-full border bg-muted">{role.team}</span>
                    <span className="flex items-center gap-1"><MapPinIcon className="size-3" />{role.location}</span>
                    <span className="flex items-center gap-1"><ClockIcon className="size-3" />{role.type}</span>
                  </div>
                </div>
                <a
                  href={`mailto:careers@isotope.app?subject=Application: ${role.title}`}
                  className="btn-lift inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex-shrink-0"
                >
                  Apply <ArrowRightIcon className="size-3.5" />
                </a>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{role.description}</p>
              <ul className="space-y-1.5">
                {role.requirements.map((req) => (
                  <li key={req} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                    {req}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* No role fits? */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center space-y-3">
        <h3 className="text-xl font-bold">Don&apos;t see the right role?</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          We&apos;re always looking for exceptional people. Send us a note about who you are and what you&apos;d love to work on.
        </p>
        <a
          href="mailto:careers@isotope.app"
          className="btn-lift inline-flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Get in touch <ArrowRightIcon className="size-4" />
        </a>
      </div>

    </div>
  )
}
