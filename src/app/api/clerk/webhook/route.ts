import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { saveGitHubToken } from '@/lib/github-token'
import { Octokit } from '@octokit/rest'
import { applyReferralCode, getOrCreateReferralCode, initCredits } from '@/lib/usage'
import type { WebhookEvent } from '@clerk/nextjs/server'

export async function POST(req: Request) {
  const body = await req.text()
  const headersList = await headers()

  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!)
  let event: WebhookEvent

  try {
    event = wh.verify(body, {
      'svix-id':        headersList.get('svix-id')!,
      'svix-timestamp': headersList.get('svix-timestamp')!,
      'svix-signature': headersList.get('svix-signature')!,
    })
  } catch {
    return new Response('Invalid webhook', { status: 400 })
  }

  // ── New user signed up ──────────────────────────────────────────────────────
  if (event.type === 'user.created') {
    const userId = event.data.id as string

    // Seed their credits row (5 free credits, 30-day reset cycle from today)
    await initCredits(userId).catch((e) => {
      console.error(`Failed to initialize credits for user ${userId}:`, e);
    });

    // Generate their referral code immediately so it's ready to share
    await getOrCreateReferralCode(userId).catch((e) => {
      console.error(`Failed to create referral code for user ${userId}:`, e);
    });

    // Apply referral code if they signed up via a referral link
    const referralCode = event.data.unsafe_metadata?.referralCode as string | undefined;
    if (referralCode) {
      await applyReferralCode(userId, referralCode).catch((e) => {
        console.error(`Failed to apply referral code ${referralCode} for user ${userId}:`, e);
      });
    }
  }

  // ── User updated — capture GitHub OAuth token ───────────────────────────────
  if (event.type === 'user.updated') {
    const userId = event.data.id as string
    const githubAccount = event.data.external_accounts?.find(
      (a) => a.provider === 'github',
    )

    if (githubAccount?.token) {
      try {
        const octokit = new Octokit({ auth: githubAccount.token })
        const { data: ghUser } = await octokit.users.getAuthenticated()
        await saveGitHubToken({ userId, accessToken: githubAccount.token, login: ghUser.login })
      } catch (e) {
        console.error('Failed to save GitHub token:', e)
      }
    }
  }

  return new Response('OK', { status: 200 })
}
