import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — Isotope',
  description: 'Privacy Policy for Isotope.',
}

const LAST_UPDATED = 'April 30, 2026'

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 space-y-10">
      <div className="space-y-3">
        <h1 className="font-display text-4xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
      </div>

      <p className="text-muted-foreground leading-relaxed">
        This Privacy Policy explains how Isotope collects, uses, and protects your information
        when you use our Service. We are committed to protecting your privacy.
      </p>

      {[
        {
          title: '1. Information We Collect',
          content: `We collect information you provide directly: account information (name, email, profile photo) via Clerk authentication; prompts and messages you send to the AI; code and files generated during your sessions; payment information processed securely by Stripe (we never store card details); and feedback or support communications. We also collect usage data automatically: pages visited, features used, generation events, error logs, and performance metrics. We use cookies and similar technologies for authentication and analytics.`,
        },
        {
          title: '2. How We Use Your Information',
          content: `We use your information to: provide and operate the Service; process your AI generation requests; manage your account and billing; send transactional emails (generation complete, billing receipts); improve the AI models and Service quality (using anonymised, aggregated data only); detect and prevent abuse or fraud; respond to support requests; and comply with legal obligations. We do not use your prompts or generated code to train our AI models without your explicit consent.`,
        },
        {
          title: '3. Data Storage and Security',
          content: `Your data is stored in secure, encrypted databases hosted on Neon (Postgres). API keys you provide for integrations (Stripe, Resend, Supabase, etc.) are encrypted at rest using AES-256-GCM before storage — they are decrypted only inside isolated E2B sandboxes at generation time and are never logged or exposed in API responses. We implement industry-standard security measures including HTTPS, encrypted connections, and access controls.`,
        },
        {
          title: '4. Data Sharing',
          content: `We do not sell your personal data. We share data only with: service providers necessary to operate the platform (Clerk for auth, Stripe for payments, Neon for database, E2B for sandboxes, Inngest for background jobs, Sentry for error monitoring, Vercel for hosting); when required by law or legal process; and with your consent. All third-party providers are bound by data processing agreements.`,
        },
        {
          title: '5. AI and Your Prompts',
          content: `Your prompts are sent to AI model providers via OpenRouter to generate code. OpenRouter and the underlying model providers process your prompts according to their own privacy policies. We recommend not including sensitive personal information, passwords, or confidential business data in your prompts. Generated code and sandbox environments are isolated per-user and per-project.`,
        },
        {
          title: '6. Vector Embeddings',
          content: `If you have Supabase configured on your project, Isotope stores vector embeddings of your generated code files and conversation summaries to improve AI context within that project. These embeddings are scoped to your project and are deleted when you delete the project. They are used solely to help the AI reuse your existing components and remember past decisions within your project.`,
        },
        {
          title: '7. Data Retention',
          content: `We retain your account data and projects for as long as your account is active. If you delete your account, we delete your personal data within 30 days, except where we are required to retain it for legal or compliance reasons. Generated code stored in Fragment records is retained until you delete the project or your account.`,
        },
        {
          title: '8. Your Rights',
          content: `Depending on your location, you may have rights to: access the personal data we hold about you; correct inaccurate data; request deletion of your data; object to or restrict processing of your data; data portability; and withdraw consent. To exercise these rights, contact us at privacy@isotope.app. We will respond within 30 days.`,
        },
        {
          title: '9. Cookies',
          content: `We use essential cookies for authentication and session management. We use analytics cookies to understand how the Service is used and improve it. You can control cookies through your browser settings, but disabling essential cookies will affect your ability to use the Service.`,
        },
        {
          title: '10. Children',
          content: `The Service is not directed to children under 16. We do not knowingly collect personal data from children under 16. If you believe a child has provided us with personal data, please contact us and we will delete it promptly.`,
        },
        {
          title: '11. Changes to This Policy',
          content: `We may update this Privacy Policy from time to time. We will notify you of material changes by email or through the Service. The "Last updated" date at the top reflects the most recent revision.`,
        },
        {
          title: '12. Contact Us',
          content: `If you have questions about this Privacy Policy or our data practices, contact us at privacy@isotope.app.`,
        },
      ].map((section) => (
        <div key={section.title} className="space-y-2">
          <h2 className="text-lg font-semibold">{section.title}</h2>
          <p className="text-muted-foreground leading-relaxed text-sm">{section.content}</p>
        </div>
      ))}
    </div>
  )
}
