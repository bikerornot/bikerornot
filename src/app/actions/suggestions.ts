'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

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
}

function haversinemiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function getNearbyRiders(): Promise<{ riders: RiderSuggestion[]; friendCount: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { riders: [], friendCount: 0 }

  const admin = getServiceClient()

  // Fetch current user profile + connection data in parallel
  const [
    { data: me },
    { data: friendships },
    { data: blocks },
  ] = await Promise.all([
    admin.from('profiles').select('latitude, longitude, state, riding_style').eq('id', user.id).single(),
    admin.from('friendships').select('requester_id, addressee_id').or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    admin.from('blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`),
  ])

  // Build exclude set
  const excludeIds = new Set<string>([user.id])
  for (const f of friendships ?? []) {
    excludeIds.add(f.requester_id)
    excludeIds.add(f.addressee_id)
  }
  for (const b of blocks ?? []) {
    excludeIds.add(b.blocker_id)
    excludeIds.add(b.blocked_id)
  }

  const friendCount = (friendships ?? []).filter((f) => {
    // Only count accepted friendships
    return true // we'll count separately below
  }).length

  // Accurate friend count (accepted only)
  const { count: acceptedFriends } = await admin
    .from('friendships')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'accepted')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)

  // Build candidate query with bounding box if we have location
  let query = admin
    .from('profiles')
    .select('id, username, first_name, last_name, profile_photo_url, city, state, latitude, longitude, riding_style')
    .eq('status', 'active')
    .eq('onboarding_complete', true)

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

  // Exclude known connections (cap at 200 to stay within URL limits)
  const excludeArr = Array.from(excludeIds).slice(0, 200)
  if (excludeArr.length > 0) {
    query = query.not('id', 'in', `(${excludeArr.join(',')})`)
  }

  const { data: candidates } = await query.limit(100)

  if (!candidates?.length) return { riders: [], friendCount: acceptedFriends ?? 0 }

  // Sort by distance if we have coordinates, otherwise leave as-is
  let sorted = candidates as any[]
  if (myLat && myLon) {
    sorted = sorted
      .map((p) => ({
        ...p,
        _dist: p.latitude && p.longitude ? haversinemiles(myLat, myLon, p.latitude, p.longitude) : 9999,
      }))
      .sort((a, b) => a._dist - b._dist)
  }

  const riders: RiderSuggestion[] = sorted.slice(0, 20).map((p) => ({
    id: p.id,
    username: p.username,
    first_name: p.first_name,
    last_name: p.last_name,
    profile_photo_url: p.profile_photo_url,
    city: p.city,
    state: p.state,
    distance_miles: p._dist != null && p._dist < 9999 ? Math.round(p._dist) : null,
    riding_style: p.riding_style ?? [],
  }))

  return { riders, friendCount: acceptedFriends ?? 0 }
}
