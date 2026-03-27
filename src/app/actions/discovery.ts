'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface BikeMatchUser {
  id: string
  username: string | null
  profile_photo_url: string | null
  city: string | null
  state: string | null
  bike_photo_url: string | null
}

export interface BikeMatchResult {
  bike: { make: string; model: string }
  matches: BikeMatchUser[]
}

export async function getMotorcycleMatches(): Promise<BikeMatchResult | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = getServiceClient()

  // Fetch user's bikes, friendships, and blocks in parallel
  const [{ data: myBikes }, { data: friendships }, { data: blocks }] = await Promise.all([
    admin.from('user_bikes').select('make, model').eq('user_id', user.id),
    admin.from('friendships').select('requester_id, addressee_id').or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    admin.from('blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`),
  ])

  if (!myBikes || myBikes.length === 0) return null

  // Deduplicate by make+model (ignore year)
  const seen = new Set<string>()
  const uniqueBikes: { make: string; model: string }[] = []
  for (const b of myBikes) {
    if (!b.make || !b.model) continue
    const key = `${b.make.toLowerCase()}|${b.model.toLowerCase()}`
    if (!seen.has(key)) {
      seen.add(key)
      uniqueBikes.push({ make: b.make, model: b.model })
    }
  }

  if (uniqueBikes.length === 0) return null

  // Build exclude set: friends (pending + accepted), blocked users
  const excludeIds = new Set<string>()
  for (const f of friendships ?? []) {
    excludeIds.add(f.requester_id === user.id ? f.addressee_id : f.requester_id)
  }
  for (const b of blocks ?? []) {
    excludeIds.add(b.blocker_id === user.id ? b.blocked_id : b.blocker_id)
  }

  // Query matches per make+model (any year)
  const bikeMatchPromises = uniqueBikes.map((bike) =>
    admin
      .from('user_bikes')
      .select('user_id, photo_url')
      .neq('user_id', user.id)
      .ilike('make', bike.make)
      .ilike('model', bike.model)
      .not('photo_url', 'is', null)
      .limit(50)
      .then(({ data }) => ({ bike, matches: data ?? [] }))
  )

  const bikeResults = await Promise.all(bikeMatchPromises)

  // Find the bike with the most eligible matches
  let bestBike: { make: string; model: string } | null = null
  let bestMatchEntries: { user_id: string; photo_url: string }[] = []

  for (const { bike, matches } of bikeResults) {
    const seenUsers = new Set<string>()
    const entries: { user_id: string; photo_url: string }[] = []

    for (const m of matches) {
      if (!excludeIds.has(m.user_id) && !seenUsers.has(m.user_id) && m.photo_url) {
        seenUsers.add(m.user_id)
        entries.push({ user_id: m.user_id, photo_url: m.photo_url })
      }
    }

    if (entries.length > bestMatchEntries.length) {
      bestBike = bike
      bestMatchEntries = entries
    }
  }

  if (!bestBike || bestMatchEntries.length === 0) return null

  // Fetch profiles for the top 20 matches
  const matchUserIds = bestMatchEntries.slice(0, 20).map((e) => e.user_id)
  const bikePhotoMap = new Map(bestMatchEntries.map((e) => [e.user_id, e.photo_url]))

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username, profile_photo_url, city, state')
    .in('id', matchUserIds)
    .eq('status', 'active')
    .is('deactivated_at', null)

  const matches: BikeMatchUser[] = (profiles ?? []).map((p) => ({
    id: p.id,
    username: p.username,
    profile_photo_url: p.profile_photo_url,
    city: p.city,
    state: p.state,
    bike_photo_url: bikePhotoMap.get(p.id) ?? null,
  })).filter((m) => m.bike_photo_url)

  if (matches.length === 0) return null

  // Shuffle matches so the card feels fresh each load
  for (let i = matches.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[matches[i], matches[j]] = [matches[j], matches[i]]
  }

  return { bike: bestBike, matches }
}
