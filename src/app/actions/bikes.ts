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
  bike: { year: number | null; make: string | null; model: string | null; photo_url: string | null }
  friendshipStatus: FriendshipStatus
  distanceMiles: number | null
}

const RESULT_LIMIT = 100

// Known alternate names for makes that users may have typed manually or that
// existed in earlier versions of the UI. Values are matched case-insensitively.
const MAKE_ALIASES: Record<string, string[]> = {
  'Harley-Davidson': ['HD', 'H-D', 'H.D.', 'Harley'],
  'Indian': ['Indian Motorcycle', 'Indian Motocycle'],
  'BMW': ['BMW Motorrad'],
}

// Returns a PostgREST OR filter string that covers the fuzzy canonical pattern
// plus any known alternate spellings, e.g.:
//   "Harley-Davidson" → "make.ilike.%Harley%Davidson%,make.ilike.HD,make.ilike.H-D"
function buildMakeOrFilter(make: string): string {
  const canonical = make.trim()
  const fuzzyPat = '%' + canonical.replace(/[\s-]+/g, '%') + '%'
  const aliases = MAKE_ALIASES[canonical] ?? []
  return [`make.ilike.${fuzzyPat}`, ...aliases.map((a) => `make.ilike.${a}`)].join(',')
}

export async function findBikeOwners(
  make: string,
  year?: number | null,
  model?: string | null
): Promise<{ owners: BikeOwner[]; error: string | null; limited: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { owners: [], error: 'Not authenticated', limited: false }

  const admin = getServiceClient()

  const modelPat = model ? '%' + model.trim().replace(/[\s-]+/g, '%') + '%' : null

  // Build query — make is required, year and model are optional
  let query = admin
    .from('user_bikes')
    .select('user_id, year, make, model, photo_url')
    .or(buildMakeOrFilter(make))
    .neq('user_id', user.id)
    .limit(RESULT_LIMIT + 1) // fetch one extra to detect if results were capped

  if (year) query = query.eq('year', year)
  if (modelPat) query = query.ilike('model', modelPat)

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
      bike: { year: bikeRow?.year ?? null, make: bikeRow?.make ?? null, model: bikeRow?.model ?? null, photo_url: bikeRow?.photo_url ?? null },
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

// ── Bike Profile Page actions ──────────────────────────────────────────────────

import { bikeSluggify } from '@/lib/bike-slug'

export interface BikeProfileOwner {
  id: string
  username: string | null
  first_name: string
  last_name: string
  profile_photo_url: string | null
  city: string | null
  state: string | null
  updated_at: string
}

export interface BikeGalleryPhoto {
  bikeId: string
  photoUrl: string
  owner: {
    id: string
    username: string | null
    profile_photo_url: string | null
    updated_at: string
  }
}

export async function getBikeProfileData(username: string, bikeSlug: string) {
  const admin = getServiceClient()

  // Fetch profile by username
  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('username', username)
    .single()

  if (!profile) return null

  // Fetch this user's bikes and match by slug
  const { data: bikes } = await admin
    .from('user_bikes')
    .select('*')
    .eq('user_id', profile.id)

  if (!bikes || bikes.length === 0) return null

  const matchedBike = bikes.find((b) => {
    if (!b.year || !b.make || !b.model) return false
    return bikeSluggify(b.year, b.make, b.model) === bikeSlug
  })

  if (!matchedBike) return null

  return { profile, bike: matchedBike }
}

export async function getBikeOwnersCount(year: number, make: string, model: string): Promise<number> {
  const admin = getServiceClient()
  const { count } = await admin
    .from('user_bikes')
    .select('*', { count: 'exact', head: true })
    .eq('year', year)
    .ilike('make', make)
    .ilike('model', model)
  return count ?? 0
}

export async function getBikeOwnersPaginated(
  year: number,
  make: string,
  model: string,
  page: number = 0,
  pageSize: number = 12
): Promise<BikeProfileOwner[]> {
  const admin = getServiceClient()
  const from = page * pageSize
  const to = from + pageSize - 1

  // Get user_ids who own this bike
  const { data: bikeRows } = await admin
    .from('user_bikes')
    .select('user_id')
    .eq('year', year)
    .ilike('make', make)
    .ilike('model', model)
    .range(from, to)

  if (!bikeRows || bikeRows.length === 0) return []

  const userIds = [...new Set(bikeRows.map((r) => r.user_id))]

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username, first_name, last_name, profile_photo_url, city, state, updated_at')
    .in('id', userIds)
    .eq('onboarding_complete', true)
    .eq('status', 'active')

  return (profiles ?? []) as BikeProfileOwner[]
}

export async function getBikeGalleryPhotos(
  year: number,
  make: string,
  model: string,
  page: number = 0,
  pageSize: number = 12
): Promise<BikeGalleryPhoto[]> {
  const admin = getServiceClient()
  const from = page * pageSize
  const to = from + pageSize - 1

  // Get bikes with photos for this year/make/model
  const { data: bikeRows } = await admin
    .from('user_bikes')
    .select('id, user_id, photo_url')
    .eq('year', year)
    .ilike('make', make)
    .ilike('model', model)
    .not('photo_url', 'is', null)
    .range(from, to)

  if (!bikeRows || bikeRows.length === 0) return []

  const userIds = [...new Set(bikeRows.map((r) => r.user_id))]

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username, profile_photo_url, updated_at')
    .in('id', userIds)
    .eq('onboarding_complete', true)
    .eq('status', 'active')

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))

  return bikeRows
    .filter((b) => profileMap.has(b.user_id))
    .map((b) => ({
      bikeId: b.id,
      photoUrl: b.photo_url!,
      owner: profileMap.get(b.user_id)!,
    }))
}
