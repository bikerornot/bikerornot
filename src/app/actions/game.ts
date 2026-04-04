'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

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

// ─── Photo Review Types ────────────────────────────────────

export interface GamePhoto {
  id: string
  storage_path: string
  bike_id: string
  year: number | null
  make: string | null
  model: string | null
  username: string | null
}

export interface GamePhotoStats {
  total: number
  approved: number
  rejected: number
  remaining: number
}

// ─── Photo Review Actions ──────────────────────────────────

export async function getUnreviewedGamePhotos(limit = 20): Promise<GamePhoto[]> {
  await requireAdmin()
  const admin = getServiceClient()

  const { data } = await admin
    .from('bike_photos')
    .select('id, storage_path, bike_id, bike:user_bikes!bike_id(year, make, model, user_id), owner:user_bikes!bike_id(user:profiles!user_id(username))')
    .is('game_approved', null)
    .order('created_at', { ascending: true })
    .limit(200)

  if (!data) return []

  // Filter to Harley-Davidson only (client-side since we can't filter on joined table easily)
  const harleys = (data as any[])
    .filter((p) => p.bike?.make === 'Harley-Davidson')
    .slice(0, limit)
    .map((p) => ({
      id: p.id,
      storage_path: p.storage_path,
      bike_id: p.bike_id,
      year: p.bike?.year ?? null,
      make: p.bike?.make ?? null,
      model: p.bike?.model ?? null,
      username: p.owner?.user?.username ?? null,
    }))

  return harleys
}

export async function submitGamePhotoReviews(
  approved: string[],
  rejected: string[]
): Promise<void> {
  await requireAdmin()
  const admin = getServiceClient()
  const now = new Date().toISOString()

  if (approved.length > 0) {
    await admin
      .from('bike_photos')
      .update({ game_approved: true, game_reviewed_at: now })
      .in('id', approved)
  }

  if (rejected.length > 0) {
    await admin
      .from('bike_photos')
      .update({ game_approved: false, game_reviewed_at: now })
      .in('id', rejected)
  }
}

export async function getGamePhotoStats(): Promise<GamePhotoStats> {
  await requireAdmin()
  const admin = getServiceClient()

  // Get all Harley bike IDs first
  const { data: harleyBikes } = await admin
    .from('user_bikes')
    .select('id')
    .eq('make', 'Harley-Davidson')

  if (!harleyBikes || harleyBikes.length === 0) {
    return { total: 0, approved: 0, rejected: 0, remaining: 0 }
  }

  const bikeIds = harleyBikes.map((b) => b.id)

  const [
    { count: total },
    { count: approved },
    { count: rejected },
  ] = await Promise.all([
    admin.from('bike_photos').select('*', { count: 'exact', head: true }).in('bike_id', bikeIds),
    admin.from('bike_photos').select('*', { count: 'exact', head: true }).in('bike_id', bikeIds).eq('game_approved', true),
    admin.from('bike_photos').select('*', { count: 'exact', head: true }).in('bike_id', bikeIds).eq('game_approved', false),
  ])

  const t = total ?? 0
  const a = approved ?? 0
  const r = rejected ?? 0

  return {
    total: t,
    approved: a,
    rejected: r,
    remaining: t - a - r,
  }
}
