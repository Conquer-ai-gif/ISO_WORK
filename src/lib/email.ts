// ── Email via Resend ──────────────────────────────────────────────────────────
// Docs: https://resend.com/docs/api-reference/emails/send-email
// Free tier: 3,000 emails/month — more than enough for feedback notifications

const RESEND_API_URL = 'https://api.resend.com/emails'

interface SendEmailOptions {
  to:      string
  subject: string
  html:    string
}

export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping email')
    return
  }

  const res = await fetch(RESEND_API_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from:    process.env.RESEND_FROM_EMAIL ?? (() => {
        console.warn('[email] RESEND_FROM_EMAIL is not set — emails may be rejected by Resend. Add it to your .env.local')
        return 'Isotope <onboarding@resend.dev>'  // Resend's test domain — works without verification
      })(),
      to:      [to],
      subject,
      html,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('Resend email failed:', err)
  }
}

// ── Feedback notification email template ─────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  general: '💬 General Feedback',
  bug:     '🐛 Bug Report',
  feature: '✨ Feature Request',
}

const STAR_DISPLAY = (rating: number | null | undefined) =>
  rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : 'Not rated'

export function buildFeedbackEmail(data: {
  type:      string
  rating:    number | null
  message:   string
  userId:    string | null
  createdAt: Date
}): { subject: string; html: string } {
  const subject = `[Isotope Feedback] ${TYPE_LABEL[data.type] ?? data.type}`

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px; color: #7C3AED;">New Feedback Received</h2>

      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="padding: 8px 12px; background: #f4f4f5; font-weight: 600; width: 120px; border-radius: 4px;">Type</td>
          <td style="padding: 8px 12px;">${TYPE_LABEL[data.type] ?? data.type}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; background: #f4f4f5; font-weight: 600; border-radius: 4px;">Rating</td>
          <td style="padding: 8px 12px; color: #f59e0b;">${STAR_DISPLAY(data.rating)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; background: #f4f4f5; font-weight: 600; border-radius: 4px;">User ID</td>
          <td style="padding: 8px 12px; color: #71717a;">${data.userId ?? 'Anonymous'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; background: #f4f4f5; font-weight: 600; border-radius: 4px;">Submitted</td>
          <td style="padding: 8px 12px; color: #71717a;">${data.createdAt.toUTCString()}</td>
        </tr>
      </table>

      <div style="margin-top: 20px; padding: 16px; background: #fafafa; border-left: 4px solid #7C3AED; border-radius: 4px;">
        <p style="margin: 0; font-size: 14px; color: #18181b; white-space: pre-wrap;">${data.message}</p>
      </div>

      <p style="margin-top: 24px; font-size: 12px; color: #a1a1aa;">
        View all feedback in your <a href="${process.env.NEXT_PUBLIC_APP_URL}/admin" style="color: #7C3AED;">admin dashboard</a>.
      </p>
    </div>
  `

  return { subject, html }
}
