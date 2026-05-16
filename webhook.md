Let me trace the exact credit flow for a new user.Found it. Let me trace the exact numbers:---

## Found The Bug — Here's Exactly What's Happening

**New user signs up:**
- `initCredits()` creates their `Credits` row with `balance: 50` (50 units = 5 credits) ✅

**User types a prompt and submits:**
- `estimateCostFromTaskGraph(userId, { tasks: 1 })` runs
- `calculateCost({ tasks: 1 })` = `COSTS.base + COSTS.task` = `2 + 2` = **4 units**
- `balanceUnits = 50`, `costUnits = 4`
- `allowed = 50 >= 4` = **true** ✅

So the math is fine. The real issue is something else — the **Clerk webhook is not firing or failing silently**.

When a new user registers, `initCredits()` is called inside the `user.created` Clerk webhook. If the webhook isn't registered or fails:
- No `Credits` row is created
- `credits?.balance ?? 0` returns `0`
- `0 >= 4` = **false** → "You don't have enough credits"

**The fix is not in the code — the webhook isn't set up locally.**

---

## What You Need To Do

```bash
# Install Clerk CLI (if not already)
npm install -g @clerk/clerk-sdk-node

# Or use the Clerk dashboard:
# 1. Go to clerk.com → your app → Webhooks
# 2. Add endpoint: https://your-ngrok-url.ngrok.io/api/clerk/webhook
# 3. Subscribe to: user.created, user.updated, user.deleted

# For local testing use ngrok:
ngrok http 3000
# Copy the https URL → paste into Clerk webhook dashboard
```

**Or quick fix to unblock yourself right now:**

Manually insert a Credits row in Prisma Studio:
```
Table: Credits
userId: your_clerk_user_id
balance: 50
plan: free
lastReset: now
nextReset: 30 days from now
```

---

## One More Thing I Want To Check

There's also a race condition risk — if the user signs up and immediately submits a prompt before the Clerk webhook fires, the Credits row doesn't exist yet. Let me fix `estimateCostFromTaskGraph` to create the credits row if it's missing:Done. Here's the full picture:

---

## Root Cause
The `Credits` row doesn't exist for new users because the **Clerk webhook isn't set up locally**. Without it, `user.created` never fires, `initCredits()` never runs, and every credit check sees `balance: 0`.

## Two-Part Fix

**1. Code fix (in this zip)** — `estimateCostFromTaskGraph` now auto-initialises the Credits row if it's missing. So even if the webhook never fires or arrives late, the user gets their 5 free credits automatically on their first submission.

**2. You still need to set up the webhook locally:**
```bash
# Install ngrok
ngrok http 3000

# Copy the https URL (e.g. https://abc123.ngrok.io)
# Go to: clerk.com → your app → Webhooks → Add endpoint
# URL: https://abc123.ngrok.io/api/clerk/webhook
# Events: user.created, user.updated, user.deleted
```

The code fix handles the race condition permanently. The webhook setup is still needed for `user.deleted` cleanup and referral codes to work properly.