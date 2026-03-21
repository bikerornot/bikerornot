import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only enable in production
  enabled: process.env.NODE_ENV === 'production',

  // Sample 100% of errors, 10% of performance transactions
  tracesSampleRate: 0.1,

  // Don't send PII by default
  sendDefaultPii: false,

  // Filter out noisy browser extension errors
  ignoreErrors: [
    'ResizeObserver loop',
    'Non-Error promise rejection',
    /^Loading chunk \d+ failed/,
    /^Loading CSS chunk \d+ failed/,
    'setContactAutofillValuesFromBridge',
    'AutofillValuesFromBridge',
  ],
})
