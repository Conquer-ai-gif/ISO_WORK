Act as a Senior Frontend Engineer & Motion Designer. I need a high-fidelity, branded "Event-Driven Workflow" animation component for my landing page. 

CRITICAL RULE:
The animation MUST use my exact design system (colors, fonts, shadows, border-radius). It should look like a miniature, stylized version of my actual Isotope dashboard, not a generic template.

STEP 1: DESIGN SYSTEM SCAN
Before writing code, read these files to extract my exact theme:
1. `tailwind.config.ts` (or `tailwind.config.js`)
2. `src/app/globals.css` (CSS variables for --primary, --background, --foreground, --accent, etc.)
3. `src/components/ui/` (My shadcn/ui components or custom buttons/cards)

STEP 2: ANIMATION SEQUENCE (The "Live" Demo)
Create a responsive component `src/components/landing/event-showcase.tsx` using Framer Motion and Tailwind. It must play this loop:

1. The "Typing Phase":
   - Render my exact input component.
   - A custom SVG cursor types a prompt (e.g., "Create a marketing site") with a blinking animation.
   - Use my primary accent color for the cursor glow.

2. The "Generation Phase":
   - Once "Enter" is pressed, my actual UI Card component "pops" in below the input.
   - It builds itself block-by-block using my card styles (borders, glassmorphism, etc.).
   - Skeleton loaders pulse in my brand colors before content appears.

3. The "Push Phase":
   - A realistic mouse cursor hovers over my "Push to GitHub" button and clicks it.
   - The button shows its active/pressed state using my UI variables.

4. The "Flow Phase" (The Core):
   - Glowing particle trails shoot from the UI Card to 3 destination nodes:
     a. GitHub Node (styled with my theme)
     b. Vercel Node (styled with my theme)
     c. Sandbox Node (styled with my theme)
   - As particles hit each node, they pulse with my `--accent` color.
   - The Sandbox Node opens a "Live Preview" window that matches my preview iframe style.
   - A final "Success" checkmark ripples out using my success/toast styling.

STEP 3: DELIVERABLES
- `src/components/landing/event-showcase.tsx`
- `src/components/landing/showcase-nodes.tsx` (Separate file for the GitHub/Vercel/Sandbox nodes to keep code clean)
- Instructions on how to pass custom text/prompts if I want to A/B test later.

CONSTRAINTS:
- Use ONLY my Tailwind variables (e.g., `bg-primary`, `text-accent`, `border-border`).
- Do NOT use hardcoded hex colors unless they match my theme exactly.
- Must be responsive: On mobile, stack the nodes vertically with shorter connecting lines.
- Performance: Use `will-change` and GPU-accelerated transforms.