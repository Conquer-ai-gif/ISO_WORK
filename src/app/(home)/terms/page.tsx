import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service — Isotope',
  description: 'Terms of Service for Isotope.',
}

const LAST_UPDATED = 'April 30, 2026'

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 space-y-10">
      <div className="space-y-3">
        <h1 className="font-display text-4xl font-bold tracking-tight">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
      </div>

      <p className="text-muted-foreground leading-relaxed">
        By accessing or using Isotope ("the Service"), you agree to be bound by these Terms of Service.
        Please read them carefully. If you do not agree, do not use the Service.
      </p>

      {[
        {
          title: '1. Acceptance of Terms',
          content: `These Terms constitute a legally binding agreement between you and Isotope. By creating an account or using the Service, you confirm that you are at least 16 years old and have the legal capacity to enter into this agreement. If you are using the Service on behalf of an organisation, you represent that you have the authority to bind that organisation to these Terms.`,
        },
        {
          title: '2. Description of Service',
          content: `Isotope is an AI-powered code generation platform that allows users to build full-stack web applications by describing what they want in natural language. The Service includes AI code generation, live sandbox previews, GitHub integration, Vercel deployment, and related developer tools. We reserve the right to modify, suspend, or discontinue any aspect of the Service at any time with reasonable notice.`,
        },
        {
          title: '3. User Accounts',
          content: `You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You must notify us immediately of any unauthorised use of your account. We are not liable for any loss resulting from unauthorised use of your account. You may not share your account with others or create accounts for automated use without our prior written consent.`,
        },
        {
          title: '4. Credits and Payments',
          content: `Isotope operates on a credit system. Free accounts receive 5 credits per day. Paid plans provide additional monthly credits as described on our pricing page. Credits are non-transferable and expire as outlined in your plan. All payments are processed securely through Stripe. Subscription fees are billed in advance on a monthly basis. You may cancel your subscription at any time; cancellation takes effect at the end of the current billing period. We do not offer refunds for partial billing periods.`,
        },
        {
          title: '5. Acceptable Use',
          content: `You agree not to use the Service to: generate code intended to harm, exploit, or deceive others; create malware, spyware, or malicious software; violate any applicable laws or regulations; infringe the intellectual property rights of others; generate content that is abusive, harassing, or discriminatory; attempt to reverse-engineer, decompile, or extract the underlying AI models; or resell or redistribute the Service without our written consent.`,
        },
        {
          title: '6. Intellectual Property',
          content: `You retain ownership of all code and content you generate using the Service. By using the Service, you grant Isotope a limited, non-exclusive licence to process your inputs and outputs solely to provide and improve the Service. Isotope retains all rights to the platform, AI systems, and underlying technology. The Isotope name, logo, and brand are trademarks of Isotope and may not be used without prior written permission.`,
        },
        {
          title: '7. Privacy and Data',
          content: `Your use of the Service is also governed by our Privacy Policy, which is incorporated into these Terms by reference. We process your data in accordance with applicable data protection laws. By using the Service, you consent to the collection and use of your data as described in the Privacy Policy.`,
        },
        {
          title: '8. Third-Party Services',
          content: `The Service integrates with third-party services including GitHub, Vercel, Supabase, Stripe, Resend, and others. Your use of these integrations is subject to the terms and privacy policies of those third parties. We are not responsible for the availability, accuracy, or practices of third-party services.`,
        },
        {
          title: '9. Disclaimer of Warranties',
          content: `The Service is provided "as is" and "as available" without warranties of any kind, either express or implied. We do not warrant that the Service will be uninterrupted, error-free, or free of harmful components. AI-generated code is provided without guarantee of fitness for any particular purpose. You are responsible for reviewing, testing, and validating any generated code before use in production.`,
        },
        {
          title: '10. Limitation of Liability',
          content: `To the maximum extent permitted by law, Isotope shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service. Our total liability for any claim arising from these Terms or the Service shall not exceed the amount you paid us in the three months preceding the claim.`,
        },
        {
          title: '11. Changes to Terms',
          content: `We may update these Terms from time to time. We will notify you of material changes by email or through the Service. Continued use of the Service after changes take effect constitutes acceptance of the updated Terms.`,
        },
        {
          title: '12. Governing Law',
          content: `These Terms are governed by and construed in accordance with applicable law. Any disputes arising from these Terms shall be resolved through binding arbitration, except where prohibited by law.`,
        },
        {
          title: '13. Contact',
          content: `If you have questions about these Terms, please contact us at legal@isotope.app.`,
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
