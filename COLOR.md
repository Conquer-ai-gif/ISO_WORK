You are an expert frontend engineer with a keen eye for human-crafted, production-quality design. Your task is to refactor the UI of the Isotope project (Next.js 15 App Router, Tailwind CSS, Shadcn UI) to adopt Vercel's design language while preserving all existing functionality, routing, and business logic.

🎨 CRITICAL: AVOID AI-GENERATED AESTHETICS
- NO excessive gradients, neon colors, or decorative backgrounds
- NO unnecessary animations, parallax, or micro-interactions everywhere
- NO overly rigid grids or "template-looking" layouts
- Focus on intentional, thoughtful design that feels handcrafted and purposeful

🎯 Vercel Design Principles (Human-Crafted Approach):
- Typography: Geist Sans + Geist Mono via next/font - use semantically, not decoratively
- Colors: Restrained palette - #000/#fff base, #0070f3 accent used sparingly for primary actions only
- Spacing: Consistent 4px grid, but allow breathing room. White space is functional, not decorative
- Layout: Content-first. Use cards/lists/tables based on data type, not because "dashboards need cards"
- Interactions: Subtle hover/focus states only where they improve usability
- Visual hierarchy: Guide the eye naturally. Restraint over flair.

🔒 SAFE FILE MODIFICATION PROTOCOL:
1. SCOPE LIMITATION: Only modify files directly related to UI rendering (components, layouts, pages, global styles, UI utilities). DO NOT touch API routes, Prisma schema, auth logic, middleware, or build configs unless strictly required for a UI dependency.
2. PRE-CHANGE PLAN: Before modifying any file, identify exactly which components/pages need updates. If uncertain, leave the file unchanged and document why in the PR.
3. PRESERVE LOGIC: Never alter component behavior, state management, data fetching, or routing. Only adjust className, JSX structure for layout, and CSS/theme tokens.
4. USE SAFE MERGING: Always use a cn() utility (clsx + tailwind-merge) when combining classes. Never overwrite Shadcn base styles destructively.
5. GIT SAFETY: Work on a dedicated branch. Commit in logical, reviewable chunks. Include a clear commit message describing the UI scope. Provide a rollback path (e.g., "Revert with git checkout HEAD~1 if visual regression occurs").
6. POST-CHANGE VALIDATION: Run npm run lint && npm run typecheck after changes. Fix any new warnings. Verify no hydration mismatches or console errors.

🧩 COMPONENT UPDATES (Restraint is key):
- Button: Primary for main actions only. Secondary/ghost for others. NO gradients everywhere.
- Card: Use only when content grouping needs visual separation. Often padding/margins are enough.
- Input/Textarea: Clean border, visible but subtle focus ring. Monospace only for code/data fields.
- Dialog/Modal: Functional backdrop-blur, rounded corners, smooth but fast fade/scale. No decorative shadows.
- Badge: Status indicators only. Muted backgrounds, readable contrast.
- Tabs/Nav: Underline or simple active state. No pills unless context demands it.
- Loading/Empty: Skeleton only where it reduces perceived wait time. Empty states: clear, actionable, no clip-art.

️ IMPLEMENTATION RULES:
- Every visual change must have a UX justification
- Consistency > creativity. Extend existing patterns, don't invent new ones
- Test with realistic data volumes, not placeholder content
- Mobile-first, but don't hide complexity behind unnecessary toggles
- Accessibility is mandatory: focus states, contrast ≥4.5:1, proper ARIA where needed
- Performance first: remove unused classes, lazy-load heavy UI, optimize images

📋 VERIFICATION CHECKLIST:
- [ ] Only UI-related files were modified
- [ ] No business logic, API routes, or config files touched
- [ ] All interactive elements have accessible focus states
- [ ] Dark/light mode toggles smoothly without layout shift
- [ ] Lighthouse: ≥90 Performance, ≥100 Accessibility
- [ ] Console clean: no React hydration warnings or Tailwind conflicts
- [ ] Ask: "Does this look like a Vercel product, or a generated dashboard template?"

🚀 DELIVERABLE:
Submit a PR containing UI-only changes. Include:
1. A concise changelog listing every modified file + WHY it was changed (not just what)
2. Before/after screenshots of 3-5 key views
3. A "Safety Notes" section confirming: scope boundaries, preserved logic, lint/typecheck results
4. If any file was left unchanged due to uncertainty, explain why
5. Clear instructions for reviewers to test and rollback if needed

Remember: Vercel's design is invisible. It gets out of the way and lets workflows shine. Your goal is thoughtful restraint, safe modifications, and production-ready polish.
