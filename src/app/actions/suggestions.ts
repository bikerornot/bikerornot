'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { haversine } from '@/lib/geo'
import { checkRateLimit } from '@/lib/rate-limit'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface RiderSuggestion {
  id: string
  username: string | null
  first_name: string
  last_name: string
  profile_photo_url: string | null
  city: string | null
  state: string | null
  distance_miles: number | null
  riding_style: string[]
  mutual_friend_count: number
  bike: string | null
}

export interface MutualFriend {
  id: string
  username: string | null
  profile_photo_url: string | null
}



export async function getMutualFriends(
  profileUserId: string
): Promise<{ friends: MutualFriend[]; count: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id === profileUserId) return { friends: [], count: 0 }

  const admin = getServiceClient()

  // Get both users' accepted friend IDs in parallel
  const [{ data: myFriendships }, { data: theirFriendships }] = await Promise.all([
    admin
      .from('friendships')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    admin
      .from('friendships')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${profileUserId},addressee_id.eq.${profileUserId}`),
  ])

  const myFriendIds = new Set<string>()
  for (const f of myFriendships ?? []) {
    myFriendIds.add(f.requester_id === user.id ? f.addressee_id : f.requester_id)
  }

  const mutualIds: string[] = []
  for (const f of theirFriendships ?? []) {
    const friendId = f.requester_id === profileUserId ? f.addressee_id : f.requester_id
    if (myFriendIds.has(friendId)) {
      mutualIds.push(friendId)
    }
  }

  if (mutualIds.length === 0) return { friends: [], count: 0 }

  // Only fetch profile details for the avatars we'll actually display (first 10 for safety),
  // but return the full mutual count so the UI shows the true total.
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username, profile_photo_url, status')
    .in('id', mutualIds.slice(0, 10))

  const friends = (profiles ?? [])
    .filter((p) => p.status === 'active')
    .map((p) => ({
      id: p.id,
      username: p.username,
      profile_photo_url: p.profile_photo_url,
    }))

  return { friends, count: mutualIds.length }
}

export async function getNearbyRiders(): Promise<{ riders: RiderSuggestion[]; friendCount: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { riders: [], friendCount: 0 }

  const admin = getServiceClient()

  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString()

  // Fetch current user profile + connection data + dismissed + recently-shown suggestions in parallel
  const [
    { data: me },
    { data: friendships },
    { data: blocks },
    { data: dismissed },
    { data: recentlyShown },
  ] = await Promise.all([
    admin.from('profiles').select('latitude, longitude, state, riding_style').eq('id', user.id).single(),
    admin.from('friendships').select('requester_id, addressee_id, status').or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    admin.from('blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`),
    admin.from('dismissed_suggestions').select('dismissed_user_id').eq('user_id', user.id),
    admin.from('shown_suggestions').select('shown_user_id').eq('user_id', user.id).gte('shown_at', threeDaysAgo),
  ])

  // Build exclude set + track accepted friend IDs in one pass
  const excludeIds = new Set<string>([user.id])
  const acceptedFriendIds = new Set<string>()

  for (const f of friendships ?? []) {
    const otherId = f.requester_id === user.id ? f.addressee_id : f.requester_id
    excludeIds.add(otherId)
    if (f.status === 'accepted') {
      acceptedFriendIds.add(otherId)
    }
  }
  for (const b of blocks ?? []) {
    const otherId = b.blocker_id === user.id ? b.blocked_id : b.blocker_id
    excludeIds.add(otherId)
  }
  for (const d of dismissed ?? []) {
    excludeIds.add(d.dismissed_user_id)
  }
  for (const s of recentlyShown ?? []) {
    excludeIds.add(s.shown_user_id)
  }

  const friendCount = acceptedFriendIds.size
  const myLat = me?.latitude
  const myLon = me?.longitude

  if (!myLat || !myLon) return { riders: [], friendCount }

  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString()

  // Fetch all active profiles with photos, active in last 14 days — paginated
  const allCandidates: any[] = []
  let fetchPage = 0
  const FETCH_SIZE = 1000
  while (true) {
    const { data: chunk } = await admin
      .from('profiles')
      .select('id, username, first_name, last_name, profile_photo_url, city, state, latitude, longitude, riding_style')
      .eq('status', 'active')
      .eq('onboarding_complete', true)
      .is('deactivated_at', null)
      .not('profile_photo_url', 'is', null)
      .not('latitude', 'is', null)
      .gte('last_seen_at', twoWeeksAgo)
      .range(fetchPage * FETCH_SIZE, (fetchPage + 1) * FETCH_SIZE - 1)
    if (!chunk || chunk.length === 0) break
    allCandidates.push(...chunk)
    if (chunk.length < FETCH_SIZE) break
    fetchPage++
  }

  // Filter out excluded users, calculate distance, sort by nearest
  const nearby = allCandidates
    .filter((p: any) => !excludeIds.has(p.id))
    .map((p: any) => ({
      ...p,
      _dist: haversine(myLat, myLon, p.latitude, p.longitude),
      _mutuals: 0,
    }))
    .sort((a, b) => a._dist - b._dist)
    .slice(0, 100)

  if (nearby.length === 0) return { riders: [], friendCount }

  // Fetch mutual friend counts for the top 30
  const viewerFriendArr = Array.from(acceptedFriendIds).slice(0, 200)
  if (viewerFriendArr.length > 0) {
    const nearbyIds = nearby.map((p: any) => p.id)
    const [{ data: mutualDir1 }, { data: mutualDir2 }] = await Promise.all([
      admin.from('friendships').select('requester_id, addressee_id').eq('status', 'accepted')
        .in('requester_id', viewerFriendArr).in('addressee_id', nearbyIds),
      admin.from('friendships').select('requester_id, addressee_id').eq('status', 'accepted')
        .in('requester_id', nearbyIds).in('addressee_id', viewerFriendArr),
    ])
    for (const f of mutualDir1 ?? []) {
      const p = nearby.find((n: any) => n.id === f.addressee_id)
      if (p) p._mutuals++
    }
    for (const f of mutualDir2 ?? []) {
      const p = nearby.find((n: any) => n.id === f.requester_id)
      if (p) p._mutuals++
    }
  }

  // Shuffle the 100 nearest for variety, then take top 10
  for (let i = nearby.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[nearby[i], nearby[j]] = [nearby[j], nearby[i]]
  }
  const topCandidates = nearby.slice(0, 10)

  // Fetch primary bike for top candidates
  const topIds = topCandidates.map((p: any) => p.id)
  const bikeMap: Record<string, string> = {}
  if (topIds.length > 0) {
    const { data: bikes } = await admin
      .from('user_bikes')
      .select('user_id, year, make, model')
      .in('user_id', topIds)
    for (const b of bikes ?? []) {
      if (!bikeMap[b.user_id]) {
        bikeMap[b.user_id] = `${b.year} ${b.make} ${b.model}`
      }
    }
  }

  const riders: RiderSuggestion[] = topCandidates.map((p: any) => ({
    id: p.id,
    username: p.username,
    first_name: p.first_name,
    last_name: p.last_name,
    profile_photo_url: p.profile_photo_url,
    city: p.city,
    state: p.state,
    distance_miles: p._dist != null && p._dist < 9999 ? Math.round(p._dist) : null,
    riding_style: p.riding_style ?? [],
    mutual_friend_count: p._mutuals,
    bike: bikeMap[p.id] ?? null,
  }))

  // Record these as "shown" so the 3-day cooldown kicks in next time
  if (riders.length > 0) {
    const now = new Date().toISOString()
    const rows = riders.map((r) => ({
      user_id: user.id,
      shown_user_id: r.id,
      shown_at: now,
    }))
    admin
      .from('shown_suggestions')
      .upsert(rows, { onConflict: 'user_id,shown_user_id' })
      .then(() => {})
  }

  return { riders, friendCount }
}

export async function dismissSuggestion(dismissedUserId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  checkRateLimit(`dismiss:${user.id}`, 50, 60000)

  const admin = getServiceClient()
  await admin.from('dismissed_suggestions').upsert({
    user_id: user.id,
    dismissed_user_id: dismissedUserId,
  }, { onConflict: 'user_id,dismissed_user_id' })
}
