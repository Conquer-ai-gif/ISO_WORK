import { Navbar } from "@/modules/home/ui/components/navbar";
import { Footer } from "@/modules/home/ui/components/footer";

interface Props {
    children: React.ReactNode;
}

const Layout = ({ children }: Props) => {
    return (
        <main className="flex flex-col min-h-screen max-h-screen">
            <Navbar />
            <div className="flex-1 flex flex-col px-4 pb-4 pt-20 md:px-8 lg:px-16">
                {children}
            </div>
            <Footer />
        </main>
    )
}

export default Layout;




// import { Navbar } from "@/modules/home/ui/components/navbar";
// import { Footer } from "@/modules/home/ui/components/footer";

// interface Props {
//     children: React.ReactNode;
// }

// const Layout = ({ children }: Props) => {
//     return (
//         <main className="flex flex-col min-h-screen max-h-screen">
//             <Navbar />

//             {/* ── Layer 1: Dot grid base ───────────────────────────────────── */}
//             <div className="absolute inset-0 -z-10 h-full w-full bg-background dark:bg-[radial-gradient(#393e4a_1px,transparent_1px)] bg-[radial-gradient(#dadde2_1px,transparent_1px)] [background-size:16px_16px]" />

//             {/* ── Layer 2: Animated flowing wave mesh (hero only) ──────────── */}
//             <div className="absolute inset-x-0 top-0 -z-10 h-[680px] overflow-hidden pointer-events-none">
//                 <svg
//                     className="absolute inset-0 w-full h-full opacity-[0.18] dark:opacity-[0.22]"
//                     viewBox="0 0 1440 680"
//                     preserveAspectRatio="xMidYMid slice"
//                     xmlns="http://www.w3.org/2000/svg"
//                 >
//                     <defs>
//                         <style>{`
//                             @keyframes wave-drift-1 {
//                                 0%   { transform: translateX(0px); }
//                                 50%  { transform: translateX(-60px); }
//                                 100% { transform: translateX(0px); }
//                             }
//                             @keyframes wave-drift-2 {
//                                 0%   { transform: translateX(0px); }
//                                 50%  { transform: translateX(50px); }
//                                 100% { transform: translateX(0px); }
//                             }
//                             @keyframes wave-drift-3 {
//                                 0%   { transform: translateX(0px); }
//                                 50%  { transform: translateX(-35px); }
//                                 100% { transform: translateX(0px); }
//                             }
//                             @media (prefers-reduced-motion: reduce) {
//                                 .wave { animation: none !important; }
//                             }
//                         `}</style>
//                     </defs>

//                     {/* Wave 1 — wide slow drift, indigo */}
//                     <path
//                         className="wave"
//                         d="M-200,280 C100,180 300,380 600,280 S900,120 1200,260 S1500,380 1700,260"
//                         stroke="rgba(99,102,241,0.6)"
//                         strokeWidth="1.5"
//                         fill="transparent"
//                         style={{ animation: 'wave-drift-1 18s ease-in-out infinite' }}
//                     />
//                     <path
//                         className="wave"
//                         d="M-200,320 C100,220 300,420 600,320 S900,160 1200,300 S1500,420 1700,300"
//                         stroke="rgba(99,102,241,0.35)"
//                         strokeWidth="1"
//                         fill="transparent"
//                         style={{ animation: 'wave-drift-1 18s ease-in-out infinite' }}
//                     />

//                     {/* Wave 2 — medium, purple, opposite drift */}
//                     <path
//                         className="wave"
//                         d="M-200,380 C150,260 350,480 700,360 S1000,200 1300,340 S1600,460 1800,340"
//                         stroke="rgba(139,92,246,0.55)"
//                         strokeWidth="1.5"
//                         fill="transparent"
//                         style={{ animation: 'wave-drift-2 22s ease-in-out infinite' }}
//                     />
//                     <path
//                         className="wave"
//                         d="M-200,420 C150,300 350,520 700,400 S1000,240 1300,380 S1600,500 1800,380"
//                         stroke="rgba(139,92,246,0.25)"
//                         strokeWidth="1"
//                         fill="transparent"
//                         style={{ animation: 'wave-drift-2 22s ease-in-out infinite' }}
//                     />

//                     {/* Wave 3 — tight, blue accent */}
//                     <path
//                         className="wave"
//                         d="M-200,200 C200,120 400,300 750,200 S1100,80 1400,180 S1700,300 1900,200"
//                         stroke="rgba(59,130,246,0.4)"
//                         strokeWidth="1"
//                         fill="transparent"
//                         style={{ animation: 'wave-drift-3 26s ease-in-out infinite' }}
//                     />

//                     {/* Wave 4 — deep low wave, wide */}
//                     <path
//                         className="wave"
//                         d="M-200,480 C200,360 500,560 900,440 S1200,300 1500,420 S1800,540 2000,420"
//                         stroke="rgba(99,102,241,0.3)"
//                         strokeWidth="1"
//                         fill="transparent"
//                         style={{ animation: 'wave-drift-1 30s ease-in-out infinite' }}
//                     />
//                 </svg>

//                 {/* Layer 3: Radial glow at center-top */}
//                 <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(99,102,241,0.08)_0%,transparent_70%)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(99,102,241,0.15)_0%,transparent_70%)]" />

//                 {/* Layer 4: Fade-out gradient at bottom — dissolves into page content */}
//                 <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background to-transparent" />
//             </div>

//             <div className="flex-1 flex flex-col px-4 pb-4 pt-20 md:px-8 lg:px-16">
//                 {children}
//             </div>
//             <Footer />
//         </main>
//     )
// }

// export default Layout;
