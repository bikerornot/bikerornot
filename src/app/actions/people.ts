'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { geocodeZip } from '@/lib/geocode'
import type { Profile } from '@/lib/supabase/types'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959 // miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

export interface NearbyUser {
  profile: Profile
  distanceMiles: number | null
  friendshipStatus: 'none' | 'pending_sent' | 'pending_received' | 'accepted'
}

export interface SearchFilters {
  gender?: string[]
  relationshipStatus?: string[]
}

export async function findNearbyUsers(
  zipCode: string,
  radiusMiles: number,
  filters: SearchFilters = {}
): Promise<{ users: NearbyUser[]; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { users: [], error: 'Not authenticated' }

  const coords = await geocodeZip(zipCode)
  if (!coords) return { users: [], error: 'Could not find that zip code. Please check and try again.' }

  const admin = getServiceClient()

  // Fetch all profiles with coordinates, excluding self
  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('*')
    .eq('onboarding_complete', true)
    .eq('status', 'active')
    .is('deactivated_at', null)
    .not('latitude', 'is', null)
    .neq('id', user.id)

  if (profilesError) return { users: [], error: profilesError.message }
  if (!profiles || profiles.length === 0) return { users: [], error: null }

  // Filter by radius, distance, and advanced filters
  const nearby = (profiles as Profile[])
    .filter((p) => {
      if (filters.gender?.length && !filters.gender.includes(p.gender ?? '')) return false
      if (filters.relationshipStatus?.length && !filters.relationshipStatus.includes(p.relationship_status ?? '')) return false
      return true
    })
    .map((p) => ({
      profile: p,
      distanceMiles: haversine(coords.lat, coords.lng, p.latitude!, p.longitude!),
    }))
    .filter((p) => p.distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles)

  if (nearby.length === 0) return { users: [], error: null }

  // Fetch friendship statuses for all nearby users in one query
  const nearbyIds = nearby.map((n) => n.profile.id)
  const { data: friendships } = await admin
    .from('friendships')
    .select('requester_id, addressee_id, status')
    .or(
      nearbyIds
        .map((id) =>
          `and(requester_id.eq.${user.id},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${user.id})`
        )
        .join(',')
    )

  const friendshipMap = new Map<string, NearbyUser['friendshipStatus']>()
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

  const users: NearbyUser[] = nearby.map(({ profile, distanceMiles }) => ({
    profile,
    distanceMiles: Math.round(distanceMiles * 10) / 10,
    friendshipStatus: friendshipMap.get(profile.id) ?? 'none',
  }))

  return { users, error: null }
}

/**
 * Default results shown before the user searches.
 * If the current user has stored coordinates, returns the 10 nearest riders.
 * Otherwise returns the 10 most recently joined members.
 */
export async function getDefaultPeopleResults(): Promise<NearbyUser[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = getServiceClient()

  // Fetch current user's stored coordinates
  const { data: me } = await admin
    .from('profiles')
    .select('latitude, longitude')
    .eq('id', user.id)
    .single()

  // Fetch up to 50 eligible profiles, most recently active first
  const { data: raw } = await admin
    .from('profiles')
    .select('*')
    .eq('onboarding_complete', true)
    .eq('status', 'active')
    .is('deactivated_at', null)
    .neq('id', user.id)
    .not('last_seen_at', 'is', null)
    .order('last_seen_at', { ascending: false })
    .limit(50)

  if (!raw || raw.length === 0) return []
  const profiles = raw as Profile[]

  // Sort by distance when we have the user's coordinates
  const distanceMap = new Map<string, number | null>()
  let sorted: Profile[]

  if (me?.latitude && me?.longitude) {
    const withCoords = profiles
      .filter((p) => p.latitude && p.longitude)
      .map((p) => ({
        profile: p,
        distance: Math.round(haversine(me.latitude!, me.longitude!, p.latitude!, p.longitude!) * 10) / 10,
      }))
      .sort((a, b) => a.distance - b.distance)

    const top = withCoords.slice(0, 10)
    sorted = top.map((w) => w.profile)
    top.forEach((w) => distanceMap.set(w.profile.id, w.distance))

    // Pad with newest if fewer than 10 have coordinates
    if (sorted.length < 10) {
      const seen = new Set(sorted.map((p) => p.id))
      const rest = profiles.filter((p) => !seen.has(p.id)).slice(0, 10 - sorted.length)
      sorted = [...sorted, ...rest]
      rest.forEach((p) => distanceMap.set(p.id, null))
    }
  } else {
    sorted = profiles.slice(0, 10)
    sorted.forEach((p) => distanceMap.set(p.id, null))
  }

  if (sorted.length === 0) return []

  // Fetch friendship statuses in one query
  const ids = sorted.map((p) => p.id)
  const { data: friendships } = await admin
    .from('friendships')
    .select('requester_id, addressee_id, status')
    .or(
      ids
        .map((id) =>
          `and(requester_id.eq.${user.id},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${user.id})`
        )
        .join(',')
    )

  const friendshipMap = new Map<string, NearbyUser['friendshipStatus']>()
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

  return sorted.map((p) => ({
    profile: p,
    distanceMiles: distanceMap.get(p.id) ?? null,
    friendshipStatus: friendshipMap.get(p.id) ?? 'none',
  }))
}
