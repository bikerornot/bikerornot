import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/settings',
          '/onboarding',
          '/messages',
          '/notifications',
          '/api/',
        ],
      },
    ],
    sitemap: 'https://www.bikerornot.com/sitemap.xml',
  }
}
