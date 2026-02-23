import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverActions: {
    bodySizeLimit: '25mb',
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
}

export default nextConfig
