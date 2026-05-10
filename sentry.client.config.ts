import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Capture 10% of transactions for performance monitoring
  // Increase this in production once you confirm it's working
  tracesSampleRate: 0.1,

  // Capture 100% of errors
  // Only run Sentry in production — skip in local dev
  enabled: process.env.NODE_ENV === 'production',

  // Hide source maps in Sentry UI to protect your code
  hideSourceMaps: true,

  // Ignore common noise
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'Non-Error promise rejection captured',
    /^Network request failed/,
    /^Load failed/,
  ],
})
