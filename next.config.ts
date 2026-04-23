import { withSentryConfig } from '@sentry/nextjs'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // geolocation=(self) so the check-in picker can request the user's
  // location on bikerornot.com; camera/microphone stay disabled because
  // the app never uses them via the web APIs (camera capture in the
  // Android app goes through the native WebView file chooser, not
  // navigator.mediaDevices, so disabling the web APIs doesn't affect it).
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
]

const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
    // Restores Y-scroll on browser back for pages that don't have special
    // rehydration logic. Feed uses a custom anchor-based store instead.
    scrollRestoration: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  // Suppress source map upload logs during build
  silent: true,

  // Upload source maps for better stack traces
  widenClientFileUpload: true,

  // Hide source maps from users
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Disable Sentry telemetry
  disableLogger: true,
})
