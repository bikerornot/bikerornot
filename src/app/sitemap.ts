import type { MetadataRoute } from 'next'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://www.bikerornot.com'

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch all active, onboarded, non-deactivated profiles
  const profiles: { username: string; updated_at: string }[] = []
  let offset = 0
  const PAGE_SIZE = 1000
  while (true) {
    const { data } = await admin
      .from('profiles')
      .select('username, updated_at')
      .eq('status', 'active')
      .eq('onboarding_complete', true)
      .is('deactivated_at', null)
      .not('username', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1)
    if (!data || data.length === 0) break
    profiles.push(...data)
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  // Fetch all active groups
  const { data: groups } = await admin
    .from('groups')
    .select('slug, updated_at')
    .eq('status', 'active')

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/people`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${baseUrl}/groups`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${baseUrl}/bikes`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${baseUrl}/terms`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${baseUrl}/privacy`, changeFrequency: 'monthly', priority: 0.3 },
  ]

  const profilePages: MetadataRoute.Sitemap = profiles.map((p) => ({
    url: `${baseUrl}/profile/${p.username}`,
    lastModified: p.updated_at,
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  const groupPages: MetadataRoute.Sitemap = (groups ?? []).map((g) => ({
    url: `${baseUrl}/groups/${g.slug}`,
    lastModified: g.updated_at,
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  return [...staticPages, ...profilePages, ...groupPages]
}
