'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getAdConversions } from '@/lib/google-analytics'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    throw new Error('Not authorized')
  }
  return user
}

// ---------- Public actions ----------

export interface AdData {
  id: string
  advertiserName: string
  primaryText: string | null
  headline: string
  description: string | null
  imageUrl: string
  ctaText: string
  destinationUrl: string
}

export async function getAdsEnabled(): Promise<boolean> {
  const admin = getServiceClient()
  const { data } = await admin.from('app_settings').select('ads_enabled').eq('id', 1).single()
  return data?.ads_enabled ?? true
}

export async function toggleAdsEnabled(): Promise<boolean> {
  await requireAdmin()
  const admin = getServiceClient()
  const { data: current } = await admin.from('app_settings').select('ads_enabled').eq('id', 1).single()
  const newValue = !(current?.ads_enabled ?? true)
  await admin.from('app_settings').update({ ads_enabled: newValue }).eq('id', 1)
  return newValue
}

export async function getNextAd(): Promise<AdData | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const admin = getServiceClient()

  // Check global kill switch
  const { data: settings } = await admin.from('app_settings').select('ads_enabled').eq('id', 1).single()
  if (!settings?.ads_enabled) return null

  let query = admin
    .from('ads')
    .select(`
      id, primary_text, headline, description, image_url, cta_text, destination_url,
      campaign:ad_campaigns!campaign_id(status, advertiser:advertisers!advertiser_id(name))
    `)
    .eq('status', 'active')

  if (user) {
    // Exclude dismissed ads
    const { data: dismissals } = await admin
      .from('ad_dismissals')
      .select('ad_id')
      .eq('user_id', user.id)

    const dismissedIds = (dismissals ?? []).map((d) => d.ad_id)
    if (dismissedIds.length > 0) {
      query = query.not('id', 'in', `(${dismissedIds.join(',')})`)
    }
  }

  const { data } = await query

  // Filter to only ads with active campaigns, then pick one at random
  const eligible = (data ?? []).filter((a: any) => a.campaign?.status === 'active')
  if (eligible.length === 0) return null
  const ad = eligible[Math.floor(Math.random() * eligible.length)]

  return {
    id: ad.id,
    advertiserName: (ad as any).campaign?.advertiser?.name ?? '',
    primaryText: ad.primary_text,
    headline: ad.headline,
    description: ad.description,
    imageUrl: ad.image_url,
    ctaText: ad.cta_text,
    destinationUrl: ad.destination_url,
  }
}

export async function recordImpression(adId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const admin = getServiceClient()

  await admin.from('ad_impressions').insert({
    ad_id: adId,
    user_id: user?.id ?? null,
  })
}

export async function dismissAd(adId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const admin = getServiceClient()

  await admin.from('ad_dismissals').upsert(
    { ad_id: adId, user_id: user.id },
    { onConflict: 'ad_id,user_id' }
  )
}

// ---------- Admin actions ----------

export interface AdWithStats {
  id: string
  primary_text: string | null
  headline: string
  description: string | null
  image_url: string
  cta_text: string
  destination_url: string
  status: string
  campaign_name: string
  advertiser_name: string
  created_at: string
  impressions: number
  clicks: number
  ctr: number
  dismissals: number
  conversions: number
  revenue: number
}

export interface Advertiser {
  id: string
  name: string
  website_url: string
  contact_email: string
  status: string
}

export interface Campaign {
  id: string
  name: string
  advertiser_id: string
  status: string
}

export async function getAdvertisers(): Promise<Advertiser[]> {
  await requireAdmin()
  const admin = getServiceClient()
  const { data } = await admin.from('advertisers').select('id, name, website_url, contact_email, status').order('name')
  return (data ?? []) as Advertiser[]
}

export async function getCampaigns(): Promise<Campaign[]> {
  await requireAdmin()
  const admin = getServiceClient()
  const { data } = await admin.from('ad_campaigns').select('id, name, advertiser_id, status').order('name')
  return (data ?? []) as Campaign[]
}

export async function createAdvertiser(name: string, websiteUrl: string, contactEmail: string): Promise<{ id: string }> {
  await requireAdmin()
  const admin = getServiceClient()
  const { data, error } = await admin.from('advertisers').insert({
    name,
    website_url: websiteUrl,
    contact_email: contactEmail,
  }).select('id').single()
  if (error) throw new Error(error.message)
  return { id: data.id }
}

export async function createCampaign(advertiserId: string, name: string): Promise<{ id: string }> {
  await requireAdmin()
  const admin = getServiceClient()
  const { data, error } = await admin.from('ad_campaigns').insert({
    advertiser_id: advertiserId,
    name,
    status: 'active',
    start_date: new Date().toISOString(),
  }).select('id').single()
  if (error) throw new Error(error.message)
  return { id: data.id }
}

export async function createAd(formData: FormData): Promise<{ id: string } | { error: string }> {
  await requireAdmin()
  const admin = getServiceClient()

  const primaryText = formData.get('primaryText') as string | null
  const headline = formData.get('headline') as string
  const description = formData.get('description') as string | null
  const ctaText = formData.get('ctaText') as string || 'Shop Now'
  const destinationUrl = formData.get('destinationUrl') as string
  const campaignId = formData.get('campaignId') as string
  const imageFile = formData.get('image') as File | null

  if (!headline || !destinationUrl || !campaignId) {
    return { error: 'Missing required fields' }
  }

  let imagePath = ''
  if (imageFile && imageFile.size > 0) {
    const ext = imageFile.name.split('.').pop() || 'jpg'
    const path = `${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await admin.storage
      .from('ads')
      .upload(path, imageFile, { contentType: imageFile.type, upsert: false })
    if (uploadError) return { error: `Upload failed: ${uploadError.message}` }
    imagePath = path
  } else {
    return { error: 'Image is required' }
  }

  const { data, error } = await admin.from('ads').insert({
    campaign_id: campaignId,
    primary_text: primaryText || null,
    headline,
    description: description || null,
    image_url: imagePath,
    cta_text: ctaText,
    destination_url: destinationUrl,
  }).select('id').single()

  if (error) return { error: error.message }
  return { id: data.id }
}

export async function updateAd(id: string, formData: FormData): Promise<{ success: boolean } | { error: string }> {
  await requireAdmin()
  const admin = getServiceClient()

  const primaryText = formData.get('primaryText') as string | null
  const headline = formData.get('headline') as string
  const description = formData.get('description') as string | null
  const ctaText = formData.get('ctaText') as string || 'Shop Now'
  const destinationUrl = formData.get('destinationUrl') as string
  const campaignId = formData.get('campaignId') as string
  const imageFile = formData.get('image') as File | null

  const updates: Record<string, any> = {
    primary_text: primaryText || null,
    headline,
    description: description || null,
    cta_text: ctaText,
    destination_url: destinationUrl,
    campaign_id: campaignId,
    updated_at: new Date().toISOString(),
  }

  if (imageFile && imageFile.size > 0) {
    const ext = imageFile.name.split('.').pop() || 'jpg'
    const path = `${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await admin.storage
      .from('ads')
      .upload(path, imageFile, { contentType: imageFile.type, upsert: false })
    if (uploadError) return { error: `Upload failed: ${uploadError.message}` }
    updates.image_url = path
  }

  const { error } = await admin.from('ads').update(updates).eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

export async function toggleAdStatus(id: string): Promise<{ status: string }> {
  await requireAdmin()
  const admin = getServiceClient()
  const { data: ad } = await admin.from('ads').select('status').eq('id', id).single()
  if (!ad) throw new Error('Ad not found')
  const newStatus = ad.status === 'active' ? 'paused' : 'active'
  await admin.from('ads').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id)
  return { status: newStatus }
}

export async function getAdStats(startDate?: string, endDate?: string): Promise<AdWithStats[]> {
  await requireAdmin()
  const admin = getServiceClient()

  const { data: ads } = await admin
    .from('ads')
    .select(`
      id, primary_text, headline, description, image_url, cta_text, destination_url, status, created_at,
      campaign:ad_campaigns!campaign_id(name, advertiser:advertisers!advertiser_id(name))
    `)
    .order('created_at', { ascending: false })

  if (!ads || ads.length === 0) return []

  const adIds = ads.map((a) => a.id)

  // Adjust endDate to include the full day (end of day rather than midnight)
  const adjustedEnd = endDate ? `${endDate}T23:59:59.999Z` : undefined

  // Count impressions/clicks/dismissals per ad using individual queries per ad
  // to avoid Supabase's default 1000-row limit on select()
  async function countPerAd(table: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {}
    await Promise.all(adIds.map(async (adId) => {
      let query = admin.from(table).select('*', { count: 'exact', head: true }).eq('ad_id', adId)
      if (startDate) query = query.gte('created_at', startDate)
      if (adjustedEnd) query = query.lte('created_at', adjustedEnd)
      const { count } = await query
      counts[adId] = count ?? 0
    }))
    return counts
  }

  // Fetch conversions from Skull Society GA4
  const gaStart = startDate || '2026-01-01'
  const gaEnd = endDate || new Date().toISOString().slice(0, 10)
  const conversionData = await getAdConversions(gaStart, gaEnd).catch(() => [])

  // Build utm_content → conversion map
  const conversionMap = new Map<string, { conversions: number; revenue: number }>()
  for (const c of conversionData) {
    conversionMap.set(c.utmContent, { conversions: c.conversions, revenue: c.revenue })
  }

  const [impressionMap, clickMap, dismissalMap] = await Promise.all([
    countPerAd('ad_impressions'),
    countPerAd('ad_clicks'),
    countPerAd('ad_dismissals'),
  ])

  return ads.map((ad: any) => {
    const imp = impressionMap[ad.id] ?? 0
    const clk = clickMap[ad.id] ?? 0

    // Extract utm_content from destination URL to match conversions
    let utmContent = ''
    try {
      const url = new URL(ad.destination_url)
      utmContent = url.searchParams.get('utm_content') ?? ''
    } catch { /* ignore */ }

    const conv = utmContent ? conversionMap.get(utmContent) : undefined

    return {
      id: ad.id,
      primary_text: ad.primary_text,
      headline: ad.headline,
      description: ad.description,
      image_url: ad.image_url,
      cta_text: ad.cta_text,
      destination_url: ad.destination_url,
      status: ad.status,
      campaign_name: ad.campaign?.name ?? 'Unknown',
      advertiser_name: ad.campaign?.advertiser?.name ?? 'Unknown',
      created_at: ad.created_at,
      impressions: imp,
      clicks: clk,
      ctr: imp > 0 ? Math.round((clk / imp) * 10000) / 100 : 0,
      dismissals: dismissalMap[ad.id] ?? 0,
      conversions: conv?.conversions ?? 0,
      revenue: Math.round((conv?.revenue ?? 0) * 100) / 100,
    }
  })
}
