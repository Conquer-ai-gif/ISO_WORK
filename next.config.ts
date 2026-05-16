// import type { NextConfig } from 'next'
// import { withSentryConfig } from '@sentry/nextjs'

// const nextConfig: NextConfig = {
//   /* config options here */
//   eslint: {
//     ignoreDuringBuilds: true,
//   },
//   experimental: {
//     serverActions: {
//       allowedOrigins: [
//         'localhost:3000',
//         '*.app.github.dev',
//         // Production domain — read from env so it works on any deployment
//         ...(process.env.NEXT_PUBLIC_APP_URL
//           ? [process.env.NEXT_PUBLIC_APP_URL.replace(/^https?:\/\//, '')]
//           : []),
//       ],
//     },
//   },
// }

// export default withSentryConfig(nextConfig, {
//   org: process.env.SENTRY_ORG,
//   project: process.env.SENTRY_PROJECT,
//   authToken: process.env.SENTRY_AUTH_TOKEN,
//   silent: true,           // suppress build output noise
//   hideSourceMaps: true,   // don't upload source maps publicly
//   disableLogger: true,
// })
import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: [
    'inngest',
    '@inngest/agent-kit',
  ],
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        '*.app.github.dev',
        ...(process.env.NEXT_PUBLIC_APP_URL
          ? [process.env.NEXT_PUBLIC_APP_URL.replace(/^https?:\/\//, '')]
          : []),
      ],
    },
  },
}

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  hideSourceMaps: true,
  disableLogger: true,
})