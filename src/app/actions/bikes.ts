'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { Profile } from '@/lib/supabase/types'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

export type FriendshipStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted'

export interface BikeOwner {
  profile: Profile
  bike: { year: number | null; make: string | null; model: string | null }
  friendshipStatus: FriendshipStatus
  distanceMiles: number | null
}

const RESULT_LIMIT = 100

export async function findBikeOwners(
  make: string,
  year?: number | null,
  model?: string | null
): Promise<{ owners: BikeOwner[]; error: string | null; limited: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { owners: [], error: 'Not authenticated', limited: false }

  const admin = getServiceClient()

  // Build query — make is required, year and model are optional
  let query = admin
    .from('user_bikes')
    .select('user_id, year, make, model')
    .eq('make', make)
    .neq('user_id', user.id)
    .limit(RESULT_LIMIT + 1) // fetch one extra to detect if results were capped

  if (year) query = query.eq('year', year)
  if (model) query = query.eq('model', model)

  const { data: bikeRows, error: bikeError } = await query

  if (bikeError) return { owners: [], error: bikeError.message, limited: false }
  if (!bikeRows || bikeRows.length === 0) return { owners: [], error: null, limited: false }

  const limited = bikeRows.length > RESULT_LIMIT
  const rows = limited ? bikeRows.slice(0, RESULT_LIMIT) : bikeRows

  // Dedupe by user_id (a user might own multiple matching bikes — take first)
  const seenUserIds = new Set<string>()
  const dedupedRows: typeof rows = []
  for (const row of rows) {
    if (!seenUserIds.has(row.user_id)) {
      seenUserIds.add(row.user_id)
      dedupedRows.push(row)
    }
  }

  const userIds = dedupedRows.map((r) => r.user_id)

  // Fetch profiles
  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('*')
    .in('id', userIds)
    .eq('onboarding_complete', true)
    .eq('status', 'active')

  if (profilesError) return { owners: [], error: profilesError.message, limited: false }
  if (!profiles || profiles.length === 0) return { owners: [], error: null, limited: false }

  // Map profile id → bike row
  const bikeByUserId = new Map(dedupedRows.map((r) => [r.user_id, r]))

  // Get current user's location
  const { data: myProfile } = await admin
    .from('profiles')
    .select('latitude, longitude')
    .eq('id', user.id)
    .single()

  // Fetch friendship statuses in one query
  const profileIds = profiles.map((p: Profile) => p.id)
  const { data: friendships } = await admin
    .from('friendships')
    .select('requester_id, addressee_id, status')
    .or(
      profileIds
        .map((id: string) =>
          `and(requester_id.eq.${user.id},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${user.id})`
        )
        .join(',')
    )

  const friendshipMap = new Map<string, FriendshipStatus>()
  for (const f of friendships ?? []) {
    const otherId = f.requester_id === user.id ? f.addressee_id : f.requester_id
    if (f.status === 'accepted') {
      friendshipMap.set(otherId, 'accepted')
    } else if (f.requester_id === user.id) {
      friendshipMap.set(otherId, 'pending_sent')
    } else {
      friendshipMap.set(otherId, 'pending_received')
    }
  }

  const owners: BikeOwner[] = (profiles as Profile[]).map((p) => {
    let distanceMiles: number | null = null
    if (myProfile?.latitude && myProfile?.longitude && p.latitude && p.longitude) {
      distanceMiles =
        Math.round(haversine(myProfile.latitude, myProfile.longitude, p.latitude, p.longitude) * 10) / 10
    }
    const bikeRow = bikeByUserId.get(p.id)
    return {
      profile: p,
      bike: { year: bikeRow?.year ?? null, make: bikeRow?.make ?? null, model: bikeRow?.model ?? null },
      friendshipStatus: friendshipMap.get(p.id) ?? 'none',
      distanceMiles,
    }
  })

  owners.sort((a, b) => {
    if (a.distanceMiles !== null && b.distanceMiles !== null) return a.distanceMiles - b.distanceMiles
    if (a.distanceMiles !== null) return -1
    if (b.distanceMiles !== null) return 1
    return (a.profile.username ?? '').localeCompare(b.profile.username ?? '')
  })

  return { owners, error: null, limited }
}
