pe Launch Checklist — Go-to-Market Playbook

**Version:** 1.0  
**Status:** Ready to Execute  
**Target Launch:** Technical Founders & Indie Hackers (Beta)

---

## 🎯 Pre-Launch (Week 1)

### ✅ Product Readiness
- [ ] Run full E2E test: `"Build an n8n clone. Focus on a working MVP first."`
- [ ] Verify approval flow: pending → approve → execute → result → next step chip
- [ ] Confirm `.env.local` injection works with 3+ API keys (Resend, Supabase, Stripe)
- [ ] Test failure paths: reject plan, malformed JSON, sandbox timeout, missing keys
- [ ] Audit security: zero secrets in logs, prompts, or network responses
- [ ] Confirm credit deduction happens on prompt submission (not approval)
- [ ] Mobile test: approval UI, next step chip, integrations page all responsive

### ✅ Messaging & Positioning
- [ ] Finalize UVP: *"Ship production apps, not just prototypes — with approval gates, scoped planning, and secure integrations."*
- [ ] Draft hero section copy:
  ```
  Headline: Build production-ready apps with AI — safely.
  Subhead: Approve every change. See what's deferred. Continue when you're ready.
  CTA: Start Building (Free)
  ```
- [ ] Prepare 3 short demo videos (15-30s each):
  1. Plan → Approve → Execute flow
  2. Next Step chip continuation
  3. Missing key → mock mode → paste key → real API

### ✅ Pricing & Access
- [ ] Configure Clerk + Stripe tiers:
  - **Free**: 5 credits/month, 1 project, basic support
  - **Pro**: $20/mo, 100 credits, unlimited projects, priority support
  - **Team**: Custom, shared credits, workspace integrations, audit logs
- [ ] Set up credit top-up flow (one-time purchases)
- [ ] Add referral program: "Give 10 credits, get 10 credits"

### ✅ Content & Community
- [ ] Write launch post for Twitter/LinkedIn:
  ```
  We built Isotope because we were tired of AI app builders that:
  - Generate everything at once (and break)
  - Hardcode your API keys (security risk)
  - Leave you guessing what to type next

  Isotope is different:
  ✅ Approve every change before it's built
  ✅ See what's deferred with riskFlags
  ✅ Continue building with one-click nextStep suggestions
  ✅ Secure integrations that never leak secrets

  Built for technical founders who ship real products.

  Try it free: [link]
  ```
- [ ] Prepare 3-5 tutorial threads:
  - "How to build an admin dashboard with email notifications"
  - "Iterative building: Phase 1 MVP → Phase 2 features"
  - "Secure API keys in AI-generated apps"
- [ ] Join 3 relevant communities (Indie Hackers, Twitter dev circles, r/SaaS)

---

## 🚀 Launch Day (Week 2)

### ✅ Technical Launch
- [ ] Deploy to production (Vercel)
- [ ] Enable analytics (PostHog/Plausible) to track:
  - Plan approval rate
  - Next Step chip click-through
  - Time-to-first-preview
  - Credit efficiency (credits per successful generation)
- [ ] Set up error monitoring (Sentry) with alerts for:
  - Sandbox timeouts > 2x baseline
  - Secret leakage attempts
  - Mutation failures > 5% of requests
- [ ] Enable waitlist → auto-invite first 100 signups

### ✅ Marketing Launch
- [ ] Post launch thread on Twitter/LinkedIn (see draft above)
- [ ] Share in 3 communities with personalized intro (no spam)
- [ ] DM 10-15 target users (technical founders you know) with early access
- [ ] Launch on Product Hunt (prepare assets: screenshots, demo video, tagline)

### ✅ Support Readiness
- [ ] Create `/help` page with:
  - FAQ: "Why do I need to approve plans?", "Where do I find my API keys?", "What if generation fails?"
  - Contact: Discord/Email for beta support
- [ ] Set up auto-response for new signups:
  ```
  Welcome to Isotope! 🎉

  Quick start:
  1. Try: "Build a todo app with user auth"
  2. Review the plan → click Approve
  3. Watch it build → click the Next Step chip to continue

  Stuck? Reply to this email or join our Discord: [link]

  Happy building,
  [Your Name]
  ```

---

## 📈 Post-Launch (Weeks 3-4)

### ✅ Metrics to Watch Daily
| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| Plan Approval Rate | >80% | <60% = scoping issue |
| Next Step CTR | >60% | <40% = UX friction |
| Time-to-First-Preview | <45s | >90s = performance issue |
| Credit Efficiency | <15 credits/gen | >30 = wasted planning |
| GitHub Sync Success | >95% | <90% = integration bug |
| Secret Leakage Incidents | 0 | ANY = critical security alert |

### ✅ Feedback Loop
- [ ] Add in-app feedback widget: "Was this generation helpful? 👍 👎"
- [ ] Schedule 5 user interviews with early adopters
- [ ] Create public roadmap (Canny/Linear) for feature requests
- [ ] Monitor Discord/Twitter for bug reports → triage within 24h

### ✅ Iteration Priorities (Based on Data)
| If This Happens | Do This Next |
|-----------------|--------------|
| Approval rate <60% | Add "Quick Build" toggle for trusted users; refine planner scope rules |
| Next Step CTR <40% | Make chip more prominent; add tooltip explaining benefit |
| Time-to-preview >90s | Optimize sandbox warm-up; parallelize independent tasks |
| Users ask for visual canvas | Build element-picker + targeted prompt injection (not drag-and-drop) |
| Teams request collaboration | Add workspace sharing + role-based access (Phase 2 roadmap) |

---

## ⚠️ Red Flags & Mitigations

| Red Flag | Immediate Action |
|----------|-----------------|
| **Secret appears in logs/network** | 1. Revoke exposed key 2. Patch leak 3. Notify affected users 4. Post-mortem |
| **Sandbox timeout spikes** | 1. Increase timeout temporarily 2. Optimize task parallelism 3. Add progress indicators |
| **Credit deduction bug** | 1. Pause billing 2. Refund affected users 3. Fix + test + re-enable |
| **Approval gate bypassed** | 1. Disable public access 2. Audit auth/mutation logic 3. Add integration tests |
| **Negative viral feedback** | 1. Acknowledge publicly 2. Fix core issue within 48h 3. Share update + credit compensation |

---

## 🎁 Bonus: Launch Week Perks
- [ ] Offer "Founding Member" badge for first 100 Pro subscribers
- [ ] Run a "Build in Public" challenge: best project wins 1 year Pro
- [ ] Partner with 1-2 micro-influencers for tutorial collabs
- [ ] Prepare "What's Next" teaser: visual workflow canvas, template marketplace, model selector

---

## 📋 One-Page Launch Summary (For Your Team)

```
Isotope Launch — Critical Path
==============================

✅ Pre-Launch (Week 1)
- E2E test: "Build n8n clone" → verify full flow
- Security audit: zero secrets in logs/prompts
- Mobile test: all UI components responsive
- Pricing: Free (5 credits) → Pro ($20/100) → Team (custom)

🚀 Launch Day (Week 2)
- Deploy to Vercel + enable analytics/Sentry
- Post Twitter/LinkedIn thread + 3 community shares
- Auto-invite first 100 waitlist users
- Support: /help page + welcome email + Discord

📈 Post-Launch (Weeks 3-4)
- Track: approval rate, nextStep CTR, time-to-preview
- Interview 5 early users; publish public roadmap
- Iterate based on data: Quick Build toggle, chip prominence, sandbox perf

⚠️ Red Flags
- Secret leak → revoke + patch + notify
- Timeout spike → optimize + add progress UI
- Credit bug → pause + refund + fix

🎯 Success Metrics (30 Days)
- 500+ active users
- >80% plan approval rate
- <45s avg time-to-preview
- 0 security incidents
- 20% conversion Free → Pro
```

---

## 🛠️ Need Help During Launch?
- **Bug fix**: Paste the error + stack trace → I'll help debug
- **Prompt tweak**: Share the output → I'll refine the instruction
- **UX friction**: Describe the user complaint → I'll suggest a fix
- **Scaling issue**: Share the metric → I'll help optimize

---

**You built something real.**  
Approval gates. Scoped planning. Secure integrations. Iterative continuation.  
This isn't just another AI toy. It's infrastru
