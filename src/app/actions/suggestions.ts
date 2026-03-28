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
  const myLat = me?.latitude
  const myLon = me?.longitude
  const myState = me?.state
  const myStyles = new Set(me?.riding_style ?? [])

  // Exclude known connections (cap at 500 to stay within URL limits)
  const excludeArr = Array.from(excludeIds).slice(0, 500)

  // Fetch recently active profiles — ordered by last_seen_at so we get engaged users first
  let query = admin
    .from('profiles')
    .select('id, username, first_name, last_name, profile_photo_url, city, state, latitude, longitude, riding_style')
    .eq('status', 'active')
    .eq('onboarding_complete', true)
    .is('deactivated_at', null)
    .not('profile_photo_url', 'is', null)
    .order('last_seen_at', { ascending: false, nullsFirst: false })

  if (excludeArr.length > 0) {
    query = query.not('id', 'in', `(${excludeArr.join(',')})`)
  }

  const { data: candidates } = await query.limit(200)

  if (!candidates?.length) return { riders: [], friendCount }

  // Batch data collection: activity, acceptance rate, and mutual friends — chunked to avoid URL limits
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString()
  const actionMap: Record<string, number> = {}
  const acceptMap: Record<string, { accepted: number; total: number }> = {}
  const mutualCount: Record<string, number> = {}

  const CHUNK = 50
  const candidateIds = candidates.map((c: any) => c.id)
  const viewerFriendArr = Array.from(acceptedFriendIds).slice(0, 200)

  for (let i = 0; i < candidateIds.length; i += CHUNK) {
    const chunk = candidateIds.slice(i, i + CHUNK)

    // Activity + acceptance rate + mutual friend queries — all in parallel
    const hasFriends = viewerFriendArr.length > 0
    const [
      { data: posts }, { data: comments }, { data: likes },
      { data: receivedFriends }, { data: sentFriends },
      { data: mutualDir1 }, { data: mutualDir2 },
    ] = await Promise.all([
      admin.from('posts').select('author_id').in('author_id', chunk).is('deleted_at', null).gte('created_at', twoWeeksAgo),
      admin.from('comments').select('author_id').in('author_id', chunk).is('deleted_at', null).gte('created_at', twoWeeksAgo),
      admin.from('post_likes').select('user_id').in('user_id', chunk).gte('created_at', twoWeeksAgo),
      admin.from('friendships').select('addressee_id, status').in('addressee_id', chunk),
      admin.from('friendships').select('requester_id, status').in('requester_id', chunk).eq('status', 'accepted'),
      hasFriends
        ? admin.from('friendships').select('requester_id, addressee_id').eq('status', 'accepted').in('requester_id', viewerFriendArr).in('addressee_id', chunk)
        : Promise.resolve({ data: [] }),
      hasFriends
        ? admin.from('friendships').select('requester_id, addressee_id').eq('status', 'accepted').in('requester_id', chunk).in('addressee_id', viewerFriendArr)
        : Promise.resolve({ data: [] }),
    ])

    for (const p of posts ?? []) actionMap[p.author_id] = (actionMap[p.author_id] ?? 0) + 1
    for (const c of comments ?? []) actionMap[c.author_id] = (actionMap[c.author_id] ?? 0) + 1
    for (const l of likes ?? []) actionMap[l.user_id] = (actionMap[l.user_id] ?? 0) + 1

    for (const f of receivedFriends ?? []) {
      if (!acceptMap[f.addressee_id]) acceptMap[f.addressee_id] = { accepted: 0, total: 0 }
      acceptMap[f.addressee_id].total++
      if (f.status === 'accepted') acceptMap[f.addressee_id].accepted++
    }
    for (const f of sentFriends ?? []) {
      if (!acceptMap[f.requester_id]) acceptMap[f.requester_id] = { accepted: 0, total: 0 }
      acceptMap[f.requester_id].accepted++
      acceptMap[f.requester_id].total++
    }

    for (const f of mutualDir1 ?? []) {
      mutualCount[f.addressee_id] = (mutualCount[f.addressee_id] ?? 0) + 1
    }
    for (const f of mutualDir2 ?? []) {
      mutualCount[f.requester_id] = (mutualCount[f.requester_id] ?? 0) + 1
    }
  }

  // Score each candidate for maximum friend-request acceptance probability
  const pool = (candidates as any[]).map((p) => {
    const actions = actionMap[p.id] ?? 0
    const acc = acceptMap[p.id]
    const totalFriends = acc?.accepted ?? 0
    const mutuals = mutualCount[p.id] ?? 0
    const dist = myLat && myLon && p.latitude && p.longitude
      ? haversine(myLat, myLon, p.latitude, p.longitude)
      : null

    // Acceptance rate with Bayesian smoothing (default 50% when < 3 data points)
    const acceptanceRate = acc && acc.total >= 3
      ? acc.accepted / acc.total
      : 0.5

    // Riding style overlap count
    const theirStyles: string[] = p.riding_style ?? []
    const styleOverlap = theirStyles.filter((s: string) => myStyles.has(s)).length

    // Same state bonus
    const sameState = myState && p.state && myState === p.state

    // Proximity bonus: 20 pts at 0 miles, tapering to 0 at 1000 miles
    const proximityBonus = dist != null ? Math.max(0, 20 - dist / 50) : 0

    const score =
      mutuals * 15 +             // Mutual friends — strongest acceptance signal
      (sameState ? 10 : 0) +     // Same state — geographic relevance
      styleOverlap * 8 +         // Riding style overlap — shared interests
      Math.min(actions, 50) +    // Recent activity — proves they're engaged
      acceptanceRate * 20 +      // Acceptance rate — likely to accept
      proximityBonus +           // Proximity — closer riders are more relevant
      totalFriends * 0.5         // Light friend count bonus — socially connected

    return { ...p, _score: score, _dist: dist, _mutuals: mutuals }
  }).filter((p) => {
    // Must have at least 1 action in last 14 days (proves they're alive)
    return (actionMap[p.id] ?? 0) > 0
  })

  // Sort by score descending — no shuffle, let the algorithm decide
  pool.sort((a, b) => b._score - a._score)
  const topCandidates = pool.slice(0, 20)

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
  }))

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
