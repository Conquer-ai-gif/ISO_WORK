import { FigmaImportButton } from '@/components/figma-import'
import { ImportRepoButton } from '@/components/import-repo-button'
import { ProjectForm } from '@/modules/home/ui/components/project-form'
import { ProjectsList } from '@/modules/home/ui/components/project-list'
import { StackMarquee } from '@/components/stack-marquee'
import Image from 'next/image'
import Link from 'next/link'
import { SignedIn, SignedOut } from '@clerk/nextjs'
import {
  SparklesIcon, GithubIcon, RocketIcon, DatabaseIcon,
  FigmaIcon, GitBranchIcon, CheckIcon, ArrowRightIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SignedOutPromptInput, SignedOutMenu } from '@/components/signed-out-hero'

const FEATURES = [
  { icon: SparklesIcon,  title: 'AI generation',     desc: 'Describe anything — get a working Next.js app in seconds' },
  { icon: CheckIcon,     title: 'Plan-First mode',   desc: 'Approve a structured plan before any code is written' },
  { icon: GithubIcon,   title: 'GitHub sync',        desc: 'Push manually, platform auto-merges and syncs back' },
  { icon: RocketIcon,   title: 'Vercel deploy',      desc: 'Live URL updated automatically after every merge' },
  { icon: DatabaseIcon, title: 'Supabase database',  desc: 'Real database auto-provisioned per project (Pro)' },
  { icon: FigmaIcon,    title: 'Figma import',       desc: 'Paste a Figma URL and get matching code instantly (Pro)' },
  { icon: GitBranchIcon, title: 'Branch per build',  desc: 'Every push creates its own Git branch and PR' },
]

const STATS = [
  { value: '< 60s',  label: 'Average generation time' },
  { value: '5',      label: 'Free credits every day' },
  { value: '100%',   label: 'Code you own' },
]

export default function Page() {
  return (
    <div className="flex flex-col max-w-5xl mx-auto w-full">

      {/* ── Layer 1: Dot grid base — home page only ── */}
      <div className="absolute inset-0 -z-10 h-full w-full bg-background dark:bg-[radial-gradient(#393e4a_1px,transparent_1px)] bg-[radial-gradient(#dadde2_1px,transparent_1px)] [background-size:16px_16px]" />

      {/* ── Layer 2: Animated flowing wave mesh — home page only ── */}
      <div className="absolute inset-x-0 top-0 -z-10 h-[680px] overflow-hidden pointer-events-none">
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.18] dark:opacity-[0.22]"
          viewBox="0 0 1440 680"
          preserveAspectRatio="xMidYMid slice"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <style>{`
              @keyframes wave-drift-1 {
                0%   { transform: translateX(0px); }
                50%  { transform: translateX(-60px); }
                100% { transform: translateX(0px); }
              }
              @keyframes wave-drift-2 {
                0%   { transform: translateX(0px); }
                50%  { transform: translateX(50px); }
                100% { transform: translateX(0px); }
              }
              @keyframes wave-drift-3 {
                0%   { transform: translateX(0px); }
                50%  { transform: translateX(-35px); }
                100% { transform: translateX(0px); }
              }
              @media (prefers-reduced-motion: reduce) {
                .wave { animation: none !important; }
              }
            `}</style>
          </defs>

          {/* Wave 1 — wide slow drift, indigo */}
          <path
            className="wave"
            d="M-200,280 C100,180 300,380 600,280 S900,120 1200,260 S1500,380 1700,260"
            stroke="rgba(99,102,241,0.6)"
            strokeWidth="1.5"
            fill="transparent"
            style={{ animation: 'wave-drift-1 18s ease-in-out infinite' }}
          />
          <path
            className="wave"
            d="M-200,320 C100,220 300,420 600,320 S900,160 1200,300 S1500,420 1700,300"
            stroke="rgba(99,102,241,0.35)"
            strokeWidth="1"
            fill="transparent"
            style={{ animation: 'wave-drift-1 18s ease-in-out infinite' }}
          />

          {/* Wave 2 — medium, purple, opposite drift */}
          <path
            className="wave"
            d="M-200,380 C150,260 350,480 700,360 S1000,200 1300,340 S1600,460 1800,340"
            stroke="rgba(139,92,246,0.55)"
            strokeWidth="1.5"
            fill="transparent"
            style={{ animation: 'wave-drift-2 22s ease-in-out infinite' }}
          />
          <path
            className="wave"
            d="M-200,420 C150,300 350,520 700,400 S1000,240 1300,380 S1600,500 1800,380"
            stroke="rgba(139,92,246,0.25)"
            strokeWidth="1"
            fill="transparent"
            style={{ animation: 'wave-drift-2 22s ease-in-out infinite' }}
          />

          {/* Wave 3 — tight, blue accent */}
          <path
            className="wave"
            d="M-200,200 C200,120 400,300 750,200 S1100,80 1400,180 S1700,300 1900,200"
            stroke="rgba(59,130,246,0.4)"
            strokeWidth="1"
            fill="transparent"
            style={{ animation: 'wave-drift-3 26s ease-in-out infinite' }}
          />

          {/* Wave 4 — deep low wave, wide */}
          <path
            className="wave"
            d="M-200,480 C200,360 500,560 900,440 S1200,300 1500,420 S1800,540 2000,420"
            stroke="rgba(99,102,241,0.3)"
            strokeWidth="1"
            fill="transparent"
            style={{ animation: 'wave-drift-1 30s ease-in-out infinite' }}
          />
        </svg>

        {/* Layer 3: Radial glow at center-top */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(99,102,241,0.08)_0%,transparent_70%)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(99,102,241,0.15)_0%,transparent_70%)]" />

        {/* Layer 4: Fade-out gradient at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background to-transparent" />
      </div>

      {/* ── Hero ── */}
      <section className="space-y-6 py-[12vh] 2xl:py-40">
        <div className="flex flex-col items-center gap-4">

          <Image
            src="/6.png"
            alt="Isotope"
            width={72}
            height={72}
            className="object-contain w-12 h-12 md:w-[72px] md:h-[72px]"
          />

          <div className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary">
            <SparklesIcon className="size-3" />
            AI-powered app builder
          </div>

          <h1 className="font-display text-3xl md:text-6xl font-bold text-center leading-tight tracking-tight">
            Build something with <span className="text-primary">Isotope</span>
          </h1>
          <p className="text-base md:text-xl text-muted-foreground text-center max-w-xl">
            Describe what you want — get a working Next.js app in seconds.
            Live preview, GitHub sync, Vercel deploy, and more.
          </p>

          <SignedOut>
            <SignedOutPromptInput />
            <div className="flex gap-3 pt-2">
              <Button asChild size="lg" className="btn-lift gap-2">
                <Link href="/sign-up">
                  Start building free
                  <ArrowRightIcon className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="btn-lift">
                <Link href="/pricing">View pricing</Link>
              </Button>
              <SignedOutMenu />
            </div>
            <p className="text-xs text-muted-foreground">
              5 free credits every day — no credit card required
            </p>
          </SignedOut>
        </div>

        <SignedIn>
          <div className="max-w-3xl mx-auto w-full space-y-3">
            <ProjectForm />
            <div className="flex justify-center gap-2">
              <FigmaImportButton />
              <ImportRepoButton />
            </div>
          </div>
        </SignedIn>

        <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto pt-2">
          {STATS.map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-1 text-center">
              <p className="text-2xl font-bold text-primary">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Signed in: projects list ── */}
      <SignedIn>
        <ProjectsList />
      </SignedIn>

      {/* ── Signed out: features + CTA ── */}
      <SignedOut>
        <section className="py-16 space-y-10">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">Everything you need to ship</h2>
            <p className="text-muted-foreground text-sm">From idea to deployed app — no setup, no configuration</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="card-lift rounded-xl border border-border bg-card p-5 space-y-3">
                <div className="size-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Icon className="size-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <StackMarquee />

        <section className="py-16">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-10 text-center space-y-4">
            <h2 className="text-2xl font-bold">Ready to build?</h2>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Join thousands of builders who ship apps in seconds.
              Free forever — upgrade when you need more.
            </p>
            <Button asChild size="lg" className="gap-2">
              <Link href="/sign-up">
                Start building free
                <ArrowRightIcon className="size-4" />
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              5 free credits/day · No credit card · Cancel anytime
            </p>
          </div>
        </section>
      </SignedOut>

    </div>
  )
}





// import { FigmaImportButton } from '@/components/figma-import'
// import { ImportRepoButton } from '@/components/import-repo-button'
// import { ProjectForm } from '@/modules/home/ui/components/project-form'
// import { ProjectsList } from '@/modules/home/ui/components/project-list'
// import { StackMarquee } from '@/components/stack-marquee'
// import Image from 'next/image'
// import Link from 'next/link'
// import { SignedIn, SignedOut } from '@clerk/nextjs'
// import {
//   SparklesIcon, GithubIcon, RocketIcon, DatabaseIcon,
//   FigmaIcon, GitBranchIcon, CheckIcon, ArrowRightIcon,
// } from 'lucide-react'
// import { Button } from '@/components/ui/button'
// import { SignedOutPromptInput, SignedOutMenu } from '@/components/signed-out-hero'

// const FEATURES = [
//   { icon: SparklesIcon,  title: 'AI generation',     desc: 'Describe anything — get a working Next.js app in seconds' },
//   { icon: CheckIcon,     title: 'Plan-First mode',   desc: 'Approve a structured plan before any code is written' },
//   { icon: GithubIcon,   title: 'GitHub sync',        desc: 'Push manually, platform auto-merges and syncs back' },
//   { icon: RocketIcon,   title: 'Vercel deploy',      desc: 'Live URL updated automatically after every merge' },
//   { icon: DatabaseIcon, title: 'Supabase database',  desc: 'Real database auto-provisioned per project (Pro)' },
//   { icon: FigmaIcon,    title: 'Figma import',       desc: 'Paste a Figma URL and get matching code instantly (Pro)' },
//   { icon: GitBranchIcon, title: 'Branch per build',  desc: 'Every push creates its own Git branch and PR' },
// ]

// const STATS = [
//   { value: '< 60s',  label: 'Average generation time' },
//   { value: '5',      label: 'Free credits every day' },
//   { value: '100%',   label: 'Code you own' },
// ]

// export default function Page() {
//   return (
//     <div className="flex flex-col max-w-5xl mx-auto w-full">

//       {/* ── Hero ── */}
//       <section className="space-y-6 py-[12vh] 2xl:py-40">
//         <div className="flex flex-col items-center gap-4">

//           {/* Logo — visible on all screens, larger on desktop */}
//           <Image
//             src="/6.png"
//             alt="Isotope"
//             width={72}
//             height={72}
//             className="object-contain w-12 h-12 md:w-[72px] md:h-[72px]"
//           />

//           {/* Badge */}
//           <div className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary">
//             <SparklesIcon className="size-3" />
//             AI-powered app builder
//           </div>

//           <h1 className="font-display text-3xl md:text-6xl font-bold text-center leading-tight tracking-tight">
//             Build something with <span className="text-primary">Isotope</span>
//           </h1>
//           <p className="text-base md:text-xl text-muted-foreground text-center max-w-xl">
//             Describe what you want — get a working Next.js app in seconds.
//             Live preview, GitHub sync, Vercel deploy, and more.
//           </p>

//           <SignedOut>
//             {/* Input box for signed-out users — submitting redirects to sign up */}
//             <SignedOutPromptInput />

//             <div className="flex gap-3 pt-2">
//               <Button asChild size="lg" className="btn-lift gap-2">
//                 <Link href="/sign-up">
//                   Start building free
//                   <ArrowRightIcon className="size-4" />
//                 </Link>
//               </Button>
//               <Button asChild size="lg" variant="outline" className="btn-lift">
//                 <Link href="/pricing">View pricing</Link>
//               </Button>
//               {/* Three-dot menu */}
//               <SignedOutMenu />
//             </div>
//             <p className="text-xs text-muted-foreground">
//               5 free credits every day — no credit card required
//             </p>
//           </SignedOut>
//         </div>

//         {/* Prompt form — signed in users */}
//         <SignedIn>
//           <div className="max-w-3xl mx-auto w-full space-y-3">
//             <ProjectForm />
//             <div className="flex justify-center gap-2">
//               <FigmaImportButton />
//               <ImportRepoButton />
//             </div>
//           </div>
//         </SignedIn>

//         {/* Stats */}
//         <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto pt-2">
//           {STATS.map((s) => (
//             <div key={s.label} className="flex flex-col items-center gap-1 text-center">
//               <p className="text-2xl font-bold text-primary">{s.value}</p>
//               <p className="text-xs text-muted-foreground">{s.label}</p>
//             </div>
//           ))}
//         </div>
//       </section>

//       {/* ── Signed in: projects list ── */}
//       <SignedIn>
//         <ProjectsList />
//       </SignedIn>

//       {/* ── Signed out: features + CTA ── */}
//       <SignedOut>
//         {/* Features grid */}
//         <section className="py-16 space-y-10">
//           <div className="text-center space-y-2">
//             <h2 className="text-2xl font-bold">Everything you need to ship</h2>
//             <p className="text-muted-foreground text-sm">From idea to deployed app — no setup, no configuration</p>
//           </div>
//           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
//             {FEATURES.map(({ icon: Icon, title, desc }) => (
//               <div key={title} className="card-lift rounded-xl border border-border bg-card p-5 space-y-3">
//                 <div className="size-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
//                   <Icon className="size-4 text-primary" />
//                 </div>
//                 <div>
//                   <p className="text-sm font-semibold text-foreground">{title}</p>
//                   <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
//                 </div>
//               </div>
//             ))}
//           </div>
//         </section>

//         {/* Stack marquee */}
//         <StackMarquee />

//         {/* CTA */}
//         <section className="py-16">
//           <div className="rounded-2xl border border-primary/20 bg-primary/5 p-10 text-center space-y-4">
//             <h2 className="text-2xl font-bold">Ready to build?</h2>
//             <p className="text-muted-foreground text-sm max-w-md mx-auto">
//               Join thousands of builders who ship apps in seconds.
//               Free forever — upgrade when you need more.
//             </p>
//             <Button asChild size="lg" className="gap-2">
//               <Link href="/sign-up">
//                 Start building free
//                 <ArrowRightIcon className="size-4" />
//               </Link>
//             </Button>
//             <p className="text-xs text-muted-foreground">
//               5 free credits/day · No credit card · Cancel anytime
//             </p>
//           </div>
//         </section>
//       </SignedOut>

//     </div>
//   )
// }
