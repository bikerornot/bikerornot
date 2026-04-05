import { withSentryConfig } from '@sentry/nextjs'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
    scrollRestoration: true,
    staleTimes: {
      dynamic: 180,  // Cache dynamic pages for 3 minutes during client-side nav
    },
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
