'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { geocodeZip, geocodeCity } from '@/lib/geocode'
import type { Profile } from '@/lib/supabase/types'
import { checkRateLimit } from '@/lib/rate-limit'
import { getBlockedIds } from '@/app/actions/blocks'
import { haversine } from '@/lib/geo'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
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

const SEARCH_PAGE_SIZE = 30

/** Shared core: given a lat/lng, find and return nearby users with friendship statuses. */
async function searchNearCoords(
  userId: string,
  coords: { lat: number; lng: number },
  radiusMiles: number,
  filters: SearchFilters,
  offset = 0
): Promise<{ users: NearbyUser[]; error: string | null; hasMore: boolean }> {
  const admin = getServiceClient()

  // Fetch in chunks to avoid Supabase's 1000-row default limit
  const allProfiles: any[] = []
  let fetchPage = 0
  const FETCH_SIZE = 1000
  while (true) {
    const { data: chunk, error: chunkError } = await admin
      .from('profiles')
      .select('*')
      .eq('onboarding_complete', true)
      .eq('status', 'active')
      .is('deactivated_at', null)
      .not('latitude', 'is', null)
      .neq('id', userId)
      .range(fetchPage * FETCH_SIZE, (fetchPage + 1) * FETCH_SIZE - 1)
    if (chunkError) return { users: [], error: chunkError.message, hasMore: false }
    if (!chunk || chunk.length === 0) break
    allProfiles.push(...chunk)
    if (chunk.length < FETCH_SIZE) break
    fetchPage++
  }
  const profiles = allProfiles
  if (profiles.length === 0) return { users: [], error: null, hasMore: false }

  const blockedIds = await getBlockedIds(userId, admin)

  const nearby = (profiles as Profile[])
    .filter((p) => {
      if (blockedIds.has(p.id)) return false
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

  if (nearby.length === 0) return { users: [], error: null, hasMore: false }

  const hasMore = nearby.length > offset + SEARCH_PAGE_SIZE
  const page = nearby.slice(offset, offset + SEARCH_PAGE_SIZE)

  const nearbyIds = page.map((n) => n.profile.id)
  const { data: friendships } = await admin
    .from('friendships')
    .select('requester_id, addressee_id, status')
    .or(
      nearbyIds
        .map((id) =>
          `and(requester_id.eq.${userId},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${userId})`
        )
        .join(',')
    )

  const friendshipMap = new Map<string, NearbyUser['friendshipStatus']>()
  for (const f of friendships ?? []) {
    const otherId = f.requester_id === userId ? f.addressee_id : f.requester_id
    if (f.status === 'accepted') {
      friendshipMap.set(otherId, 'accepted')
    } else if (f.requester_id === userId) {
      friendshipMap.set(otherId, 'pending_sent')
    } else {
      friendshipMap.set(otherId, 'pending_received')
    }
  }

  return {
    users: page.map(({ profile, distanceMiles }) => ({
      profile,
      distanceMiles: Math.round(distanceMiles * 10) / 10,
      friendshipStatus: friendshipMap.get(profile.id) ?? 'none',
    })),
    error: null,
    hasMore,
  }
}

export async function findUsersByUsername(
  query: string
): Promise<{ users: NearbyUser[]; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { users: [], error: 'Not authenticated' }

  const clean = query.trim().replace(/^@/, '').replace(/\s+/g, '')
  if (!clean) return { users: [], error: 'Please enter a username to search' }
  if (clean.length > 50) return { users: [], error: 'Search query too long' }

  checkRateLimit(`findUsersByUsername:${user.id}`, 30, 60_000)

  const admin = getServiceClient()

  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('*')
    .ilike('username', `%${clean}%`)
    .eq('onboarding_complete', true)
    .is('deactivated_at', null)
    .not('status', 'in', '("suspended","banned")')
    .limit(20)

  if (profilesError) return { users: [], error: profilesError.message }
  if (!profiles || profiles.length === 0) return { users: [], error: null }

  const blockedIds = await getBlockedIds(user.id, admin)
  const filteredProfiles = (profiles as Profile[]).filter((p) => !blockedIds.has(p.id))
  if (filteredProfiles.length === 0) return { users: [], error: null }

  const ids = filteredProfiles.map((p) => p.id)
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

  return {
    users: filteredProfiles.map((profile) => ({
      profile,
      distanceMiles: null,
      friendshipStatus: friendshipMap.get(profile.id) ?? 'none',
    })),
    error: null,
  }
}

export async function findNearbyUsers(
  zipCode: string,
  radiusMiles: number,
  filters: SearchFilters = {},
  offset = 0
): Promise<{ users: NearbyUser[]; error: string | null; hasMore: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { users: [], error: 'Not authenticated', hasMore: false }

  checkRateLimit(`findNearby:${user.id}`, 10, 60_000)

  const coords = await geocodeZip(zipCode)
  if (!coords) return { users: [], error: 'Could not find that zip code. Please check and try again.', hasMore: false }

  return searchNearCoords(user.id, coords, radiusMiles, filters, offset)
}

export async function findNearbyUsersByCity(
  city: string,
  stateAbbr: string,
  radiusMiles: number,
  filters: SearchFilters = {},
  offset = 0
): Promise<{ users: NearbyUser[]; error: string | null; hasMore: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { users: [], error: 'Not authenticated', hasMore: false }

  checkRateLimit(`findNearby:${user.id}`, 10, 60_000)

  const coords = await geocodeCity(city, stateAbbr)
  if (!coords) return { users: [], error: `Could not find "${city}, ${stateAbbr}". Please check the city and state and try again.`, hasMore: false }

  return searchNearCoords(user.id, coords, radiusMiles, filters, offset)
}

/**
 * Default results shown before the user searches.
 * Returns the 30 nearest riders who were active in the last 14 days.
 */
export async function getDefaultPeopleResults(): Promise<NearbyUser[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = getServiceClient()

  const { data: me } = await admin
    .from('profiles')
    .select('latitude, longitude')
    .eq('id', user.id)
    .single()

  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString()

  // Fetch active-in-last-14-days profiles with coordinates, paginated
  const allProfiles: any[] = []
  let page = 0
  const PAGE_SIZE = 1000
  while (true) {
    const { data: chunk } = await admin
      .from('profiles')
      .select('*')
      .eq('onboarding_complete', true)
      .eq('status', 'active')
      .is('deactivated_at', null)
      .neq('id', user.id)
      .not('latitude', 'is', null)
      .gte('last_seen_at', twoWeeksAgo)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (!chunk || chunk.length === 0) break
    allProfiles.push(...chunk)
    if (chunk.length < PAGE_SIZE) break
    page++
  }

  if (allProfiles.length === 0) return []

  const blockedIds = await getBlockedIds(user.id, admin)
  const profiles = (allProfiles as Profile[]).filter((p) => !blockedIds.has(p.id))

  // Sort by distance (nearest first)
  let sorted: { profile: Profile; distance: number | null }[]

  if (me?.latitude && me?.longitude) {
    sorted = profiles
      .filter((p) => p.latitude && p.longitude)
      .map((p) => ({
        profile: p,
        distance: Math.round(haversine(me.latitude!, me.longitude!, p.latitude!, p.longitude!) * 10) / 10,
      }))
      .sort((a, b) => (a.distance ?? 99999) - (b.distance ?? 99999))
      .slice(0, 30)
  } else {
    // No coords — just show recently active
    sorted = profiles.slice(0, 30).map((p) => ({ profile: p, distance: null }))
  }

  if (sorted.length === 0) return []

  // Fetch friendship statuses
  const ids = sorted.map((s) => s.profile.id)
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

  return sorted.map(({ profile, distance }) => ({
    profile,
    distanceMiles: distance,
    friendshipStatus: friendshipMap.get(profile.id) ?? 'none',
  }))
}
