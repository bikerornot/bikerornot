'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { SiteBanner, BannerAudience } from '@/lib/supabase/types'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// -----------------------------------------------------------------
// PUBLIC: get active banners for the current user
// -----------------------------------------------------------------
export async function getActiveBanners(): Promise<SiteBanner[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = getServiceClient()
  const now = new Date().toISOString()

  // Fetch active banners that haven't expired and have started
  let query = admin
    .from('site_banners')
    .select('*')
    .eq('active', true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`expires_at.is.null,expires_at.gte.${now}`)
    .order('priority', { ascending: false })

  const { data: banners } = await query
  if (!banners || banners.length === 0) return []

  // Fetch user's dismissals
  const { data: dismissals } = await admin
    .from('banner_dismissals')
    .select('banner_id')
    .eq('user_id', user.id)

  const dismissedIds = new Set((dismissals ?? []).map((d: any) => d.banner_id))

  // Fetch user verification status for audience filtering
  const { data: profile } = await admin
    .from('profiles')
    .select('phone_verified_at')
    .eq('id', user.id)
    .single()

  const isVerified = !!profile?.phone_verified_at

  return (banners as SiteBanner[]).filter(b => {
    // Filter out dismissed banners
    if (b.dismissible && dismissedIds.has(b.id)) return false
    // Filter by audience
    if (b.audience === 'unverified' && isVerified) return false
    if (b.audience === 'verified' && !isVerified) return false
    return true
  })
}

// -----------------------------------------------------------------
// PUBLIC: dismiss a banner
// -----------------------------------------------------------------
export async function dismissBanner(bannerId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  await admin.from('banner_dismissals').upsert({
    user_id: user.id,
    banner_id: bannerId,
  })
}

// -----------------------------------------------------------------
// ADMIN: list all banners
// -----------------------------------------------------------------
export async function getAllBanners(): Promise<SiteBanner[]> {
  const admin = getServiceClient()
  const { data } = await admin
    .from('site_banners')
    .select('*')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })

  return (data ?? []) as SiteBanner[]
}

// -----------------------------------------------------------------
// ADMIN: create banner
// -----------------------------------------------------------------
export async function createBanner(input: {
  text: string
  link_url?: string
  link_text?: string
  bg_color: string
  active: boolean
  priority: number
  dismissible: boolean
  audience: BannerAudience
  starts_at?: string
  expires_at?: string
}): Promise<SiteBanner> {
  const admin = getServiceClient()
  const { data, error } = await admin
    .from('site_banners')
    .insert({
      text: input.text,
      link_url: input.link_url || null,
      link_text: input.link_text || null,
      bg_color: input.bg_color,
      active: input.active,
      priority: input.priority,
      dismissible: input.dismissible,
      audience: input.audience,
      starts_at: input.starts_at || null,
      expires_at: input.expires_at || null,
    })
    .select()
    .single()

  if (error) throw new Error('Failed to create banner')
  return data as SiteBanner
}

// -----------------------------------------------------------------
// ADMIN: update banner
// -----------------------------------------------------------------
export async function updateBanner(bannerId: string, input: {
  text?: string
  link_url?: string | null
  link_text?: string | null
  bg_color?: string
  active?: boolean
  priority?: number
  dismissible?: boolean
  audience?: BannerAudience
  starts_at?: string | null
  expires_at?: string | null
}): Promise<void> {
  const admin = getServiceClient()
  const { error } = await admin
    .from('site_banners')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', bannerId)

  if (error) throw new Error('Failed to update banner')
}

// -----------------------------------------------------------------
// ADMIN: toggle banner active status
// -----------------------------------------------------------------
export async function toggleBannerActive(bannerId: string): Promise<boolean> {
  const admin = getServiceClient()
  const { data: existing } = await admin
    .from('site_banners')
    .select('active')
    .eq('id', bannerId)
    .single()

  if (!existing) throw new Error('Banner not found')

  const newActive = !existing.active
  await admin
    .from('site_banners')
    .update({ active: newActive, updated_at: new Date().toISOString() })
    .eq('id', bannerId)

  return newActive
}

// -----------------------------------------------------------------
// ADMIN: delete banner
// -----------------------------------------------------------------
export async function deleteBanner(bannerId: string): Promise<void> {
  const admin = getServiceClient()
  // Dismissals cascade-delete via FK
  const { error } = await admin
    .from('site_banners')
    .delete()
    .eq('id', bannerId)

  if (error) throw new Error('Failed to delete banner')
}
