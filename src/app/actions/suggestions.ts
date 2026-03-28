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

  // Exclude known connections (cap at 500 to stay within URL limits)
  const excludeArr = Array.from(excludeIds).slice(0, 500)
  const excludeFilter = excludeArr.length > 0
    ? `.not('id', 'in', '(${excludeArr.join(',')})')`
    : null

  // Fetch active users: anyone who posted, commented, or liked in the last 14 days
  // This is the engagement pool — no geo restriction
  let query = admin
    .from('profiles')
    .select('id, username, first_name, last_name, profile_photo_url, city, state, latitude, longitude, riding_style')
    .eq('status', 'active')
    .eq('onboarding_complete', true)
    .is('deactivated_at', null)
    .not('profile_photo_url', 'is', null)

  if (excludeArr.length > 0) {
    query = query.not('id', 'in', `(${excludeArr.join(',')})`)
  }

  const { data: candidates } = await query.limit(500)

  if (!candidates?.length) return { riders: [], friendCount }

  // Get recent activity counts for all candidates (last 14 days)
  const candidateIds = candidates.map((c: any) => c.id)
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString()

  const [{ data: postCounts }, { data: commentCounts }, { data: likeCounts }, { data: acceptanceData }] = await Promise.all([
    admin.from('posts').select('author_id').in('author_id', candidateIds).is('deleted_at', null).gte('created_at', twoWeeksAgo),
    admin.from('comments').select('author_id').in('author_id', candidateIds).is('deleted_at', null).gte('created_at', twoWeeksAgo),
    admin.from('post_likes').select('user_id').in('user_id', candidateIds).gte('created_at', twoWeeksAgo),
    admin.from('friendships').select('addressee_id, status').in('addressee_id', candidateIds),
  ])

  // Count actions per user
  const actionMap: Record<string, number> = {}
  for (const p of postCounts ?? []) actionMap[p.author_id] = (actionMap[p.author_id] ?? 0) + 1
  for (const c of commentCounts ?? []) actionMap[c.author_id] = (actionMap[c.author_id] ?? 0) + 1
  for (const l of likeCounts ?? []) actionMap[l.user_id] = (actionMap[l.user_id] ?? 0) + 1

  // Compute acceptance rates
  const acceptMap: Record<string, { accepted: number; total: number }> = {}
  for (const f of acceptanceData ?? []) {
    if (!acceptMap[f.addressee_id]) acceptMap[f.addressee_id] = { accepted: 0, total: 0 }
    acceptMap[f.addressee_id].total++
    if (f.status === 'accepted') acceptMap[f.addressee_id].accepted++
  }

  // Score each candidate: activity * acceptance rate
  // Filter out users with zero activity or <50% acceptance rate
  let pool = (candidates as any[]).map((p) => {
    const actions = actionMap[p.id] ?? 0
    const acc = acceptMap[p.id]
    const acceptRate = acc && acc.total >= 2 ? acc.accepted / acc.total : 0.5 // default 50% for new users
    const dist = myLat && myLon && p.latitude && p.longitude
      ? haversine(myLat, myLon, p.latitude, p.longitude)
      : null
    return {
      ...p,
      _actions: actions,
      _acceptRate: acceptRate,
      _score: actions * acceptRate,
      _dist: dist,
    }
  }).filter((p) => {
    // Must have at least 1 action in last 14 days
    if (p._actions === 0) return false
    // If they have enough data, must have >= 50% acceptance rate
    const acc = acceptMap[p.id]
    if (acc && acc.total >= 4 && p._acceptRate < 0.5) return false
    return true
  })

  // Sort by score descending, take top 50
  pool.sort((a, b) => b._score - a._score)
  const candidatePool = pool.slice(0, 50)

  // Shuffle for variety
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

  checkRateLimit(`dismiss:${user.id}`, 50, 60000)

  const admin = getServiceClient()
  await admin.from('dismissed_suggestions').upsert({
    user_id: user.id,
    dismissed_user_id: dismissedUserId,
  }, { onConflict: 'user_id,dismissed_user_id' })
}
