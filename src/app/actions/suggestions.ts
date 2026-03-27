'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { haversine } from '@/lib/geo'

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
}

export interface MutualFriend {
  id: string
  username: string | null
  profile_photo_url: string | null
}



export async function getMutualFriends(profileUserId: string): Promise<MutualFriend[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id === profileUserId) return []

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

  if (mutualIds.length === 0) return []

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username, profile_photo_url')
    .in('id', mutualIds.slice(0, 10))

  return (profiles ?? []).map((p) => ({
    id: p.id,
    username: p.username,
    profile_photo_url: p.profile_photo_url,
  }))
}

export async function getNearbyRiders(): Promise<{ riders: RiderSuggestion[]; friendCount: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { riders: [], friendCount: 0 }

  const admin = getServiceClient()

  // Fetch current user profile + connection data + dismissed suggestions in parallel
  const [
    { data: me },
    { data: friendships },
    { data: blocks },
    { data: dismissed },
  ] = await Promise.all([
    admin.from('profiles').select('latitude, longitude, state, riding_style').eq('id', user.id).single(),
    admin.from('friendships').select('requester_id, addressee_id, status').or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    admin.from('blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`),
    admin.from('dismissed_suggestions').select('dismissed_user_id').eq('user_id', user.id),
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

  const friendCount = acceptedFriendIds.size

  // Build candidate query with bounding box if we have location
  let query = admin
    .from('profiles')
    .select('id, username, first_name, last_name, profile_photo_url, city, state, latitude, longitude, riding_style')
    .eq('status', 'active')
    .eq('onboarding_complete', true)
    .is('deactivated_at', null)
    .not('profile_photo_url', 'is', null)

  const myLat = me?.latitude
  const myLon = me?.longitude

  if (myLat && myLon) {
    // ~300 mile bounding box
    const bbox = 5
    query = query
      .not('latitude', 'is', null)
      .gte('latitude', myLat - bbox)
      .lte('latitude', myLat + bbox)
      .gte('longitude', myLon - bbox)
      .lte('longitude', myLon + bbox)
  } else if (me?.state) {
    // Fall back to same state if no coordinates
    query = query.eq('state', me.state)
  }

  // Exclude known connections (cap at 500 to stay within URL limits)
  const excludeArr = Array.from(excludeIds).slice(0, 500)
  if (excludeArr.length > 0) {
    query = query.not('id', 'in', `(${excludeArr.join(',')})`)
  }

  const { data: candidates } = await query.limit(100)

  if (!candidates?.length) return { riders: [], friendCount }

  // Add distance if we have coordinates
  let pool = candidates as any[]
  if (myLat && myLon) {
    pool = pool.map((p) => ({
      ...p,
      _dist: p.latitude && p.longitude ? haversine(myLat, myLon, p.latitude, p.longitude) : 9999,
    }))
  }

  // Take the nearest 50 as a pool, then randomly pick 20 for variety
  if (myLat && myLon) {
    pool.sort((a, b) => a._dist - b._dist)
  }
  const candidatePool = pool.slice(0, 50)

  // Fisher-Yates shuffle
  for (let i = candidatePool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[candidatePool[i], candidatePool[j]] = [candidatePool[j], candidatePool[i]]
  }

  const topCandidates = candidatePool.slice(0, 20)

  // Compute mutual friend counts for top candidates
  const mutualCount: Record<string, number> = {}
  if (acceptedFriendIds.size > 0 && topCandidates.length > 0) {
    const candidateIds = new Set(topCandidates.map((c: any) => c.id as string))
    const viewerFriendArr = Array.from(acceptedFriendIds).slice(0, 200)
    const candidateArr = Array.from(candidateIds)

    // Two queries for both directions of mutual friendships (runs in parallel)
    const [{ data: dir1 }, { data: dir2 }] = await Promise.all([
      admin
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .in('requester_id', viewerFriendArr)
        .in('addressee_id', candidateArr),
      admin
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .in('requester_id', candidateArr)
        .in('addressee_id', viewerFriendArr),
    ])

    for (const f of dir1 ?? []) {
      mutualCount[f.addressee_id] = (mutualCount[f.addressee_id] ?? 0) + 1
    }
    for (const f of dir2 ?? []) {
      mutualCount[f.requester_id] = (mutualCount[f.requester_id] ?? 0) + 1
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
    mutual_friend_count: mutualCount[p.id] ?? 0,
  }))

  return { riders, friendCount }
}

export async function dismissSuggestion(dismissedUserId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  await admin.from('dismissed_suggestions').upsert({
    user_id: user.id,
    dismissed_user_id: dismissedUserId,
  }, { onConflict: 'user_id,dismissed_user_id' })
}
