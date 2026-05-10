import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://isotope.app'

  return [
    // ── Core public pages ──────────────────────────────────────────────────
    { url: base,                         lastModified: new Date(), changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${base}/pricing`,            lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${base}/marketplace`,        lastModified: new Date(), changeFrequency: 'daily',   priority: 0.9 },
    { url: `${base}/templates`,          lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.8 },
    { url: `${base}/changelog`,          lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.8 },

    // ── Auth pages ─────────────────────────────────────────────────────────
    { url: `${base}/sign-in`,            lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.5 },
    { url: `${base}/sign-up`,            lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.6 },

    // ── App pages (signed-in) ──────────────────────────────────────────────
    { url: `${base}/feedback`,           lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/usage`,              lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/workspaces`,         lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/settings`,           lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.4 },

    // ── Documentation ──────────────────────────────────────────────────────
    { url: `${base}/docs`,                        lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/docs/ai-generation`,          lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/docs/billing`,                lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/docs/github-sync`,            lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/docs/vercel-deploy`,          lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/docs/supabase`,               lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/docs/figma`,                  lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/docs/workspaces`,             lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/docs/visual-edit`,            lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/docs/task-board`,             lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/docs/changelog`,              lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/docs/email-notifications`,    lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/docs/faq`,                    lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
  ]
}

