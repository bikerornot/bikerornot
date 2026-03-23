'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { sendFriendRequestEmail, sendFriendAcceptedEmail } from '@/lib/email'
import { checkRateLimit } from '@/lib/rate-limit'
import { notifyIfActive } from '@/lib/notify'
import { getBlockedIds } from '@/app/actions/blocks'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function sendFriendRequest(addresseeId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  if (user.id === addresseeId) throw new Error('Cannot friend yourself')

  checkRateLimit(`sendFriendRequest:${user.id}`, 20, 60_000)

  const admin = getServiceClient()

  const blockedIds = await getBlockedIds(user.id, admin)
  // Silently pretend it worked if blocked — don't reveal block status
  if (blockedIds.has(addresseeId)) return

  const { data: senderProfile } = await admin
    .from('profiles')
    .select('created_at, status')
    .eq('id', user.id)
    .single()

  // Silently block if sender is banned/suspended (shadow ban)
  if (senderProfile?.status && senderProfile.status !== 'active') return

  // Daily friend request cap — 30/day for all accounts, 5/day for new (<7 days)
  const accountAgeDays = (Date.now() - new Date(senderProfile!.created_at).getTime()) / 86_400_000
  const dailyLimit = accountAgeDays < 7 ? 5 : 30
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const { count: requestsToday } = await admin
    .from('friendships')
    .select('*', { count: 'exact', head: true })
    .eq('requester_id', user.id)
    .gte('created_at', todayStart.toISOString())
  if ((requestsToday ?? 0) >= dailyLimit) {
    throw new Error(`You can send up to ${dailyLimit} friend requests per day.`)
  }

  const { error } = await admin
    .from('friendships')
    .insert({ requester_id: user.id, addressee_id: addresseeId })

  if (error && error.code !== '23505') throw new Error(error.message)
  if (error) return // already exists, skip notification

  await notifyIfActive(user.id, {
    user_id: addresseeId,
    type: 'friend_request',
    actor_id: user.id,
  })

  // Send email notification (fire and forget)
  const [{ data: requesterProfile }, { data: addresseeAuth }, { data: addresseeProfile }] = await Promise.all([
    admin.from('profiles').select('username, first_name').eq('id', user.id).single(),
    admin.auth.admin.getUserById(addresseeId),
    admin.from('profiles').select('first_name, email_friend_requests').eq('id', addresseeId).single(),
  ])
  const addresseeEmail = addresseeAuth.user?.email
  if (addresseeEmail && requesterProfile?.username && addresseeProfile?.email_friend_requests !== false) {
    sendFriendRequestEmail({
      toEmail: addresseeEmail,
      toName: addresseeProfile?.first_name ?? 'there',
      fromUsername: requesterProfile.username,
    }).catch(() => {})
  }
}

export async function cancelFriendRequest(addresseeId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { error } = await admin
    .from('friendships')
    .delete()
    .eq('requester_id', user.id)
    .eq('addressee_id', addresseeId)
    .eq('status', 'pending')

  if (error) throw new Error(error.message)
}

export async function acceptFriendRequest(requesterId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { data: updated, error } = await admin
    .from('friendships')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('requester_id', requesterId)
    .eq('addressee_id', user.id)
    .eq('status', 'pending')
    .select('id')

  if (error) throw new Error(error.message)

  // Clean up the friend_request notification so it doesn't linger
  await admin
    .from('notifications')
    .delete()
    .eq('user_id', user.id)
    .eq('actor_id', requesterId)
    .eq('type', 'friend_request')

  // Only notify if we actually transitioned a pending request — prevents
  // duplicate notifications if the request was already accepted.
  if (!updated || updated.length === 0) return

  await notifyIfActive(user.id, {
    user_id: requesterId,
    type: 'friend_accepted',
    actor_id: user.id,
  })

  // Send email notification (fire and forget)
  const [{ data: accepterProfile }, { data: requesterAuth }, { data: requesterProfile }] = await Promise.all([
    admin.from('profiles').select('username, first_name').eq('id', user.id).single(),
    admin.auth.admin.getUserById(requesterId),
    admin.from('profiles').select('first_name, email_friend_accepted').eq('id', requesterId).single(),
  ])
  const requesterEmail = requesterAuth.user?.email
  if (requesterEmail && accepterProfile?.username && requesterProfile?.email_friend_accepted !== false) {
    sendFriendAcceptedEmail({
      toEmail: requesterEmail,
      toName: requesterProfile?.first_name ?? 'there',
      fromUsername: accepterProfile.username,
    }).catch(() => {})
  }
}

export async function declineFriendRequest(requesterId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { error } = await admin
    .from('friendships')
    .delete()
    .eq('requester_id', requesterId)
    .eq('addressee_id', user.id)
    .eq('status', 'pending')

  if (error) throw new Error(error.message)

  // Clean up the friend_request notification
  await admin
    .from('notifications')
    .delete()
    .eq('user_id', user.id)
    .eq('actor_id', requesterId)
    .eq('type', 'friend_request')
}

export interface FriendRequestCard {
  id: string
  username: string | null
  first_name: string
  last_name: string
  profile_photo_url: string | null
  city: string | null
  state: string | null
  riding_style: string[]
  created_at: string // when the request was sent
  mutual_count: number
  primary_bike: string | null
}

export interface FriendCard {
  id: string
  username: string | null
  first_name: string
  last_name: string
  profile_photo_url: string | null
  city: string | null
  state: string | null
  riding_style: string[]
  friends_since: string
  show_real_name: boolean
  starred: boolean
}

export async function getPendingFriendRequests(): Promise<FriendRequestCard[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = getServiceClient()

  // Get pending incoming requests
  const { data: pending } = await admin
    .from('friendships')
    .select('requester_id, created_at')
    .eq('addressee_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (!pending || pending.length === 0) return []

  const blockedIds = await getBlockedIds(user.id, admin)
  const filteredPending = pending.filter((p) => !blockedIds.has(p.requester_id))
  if (filteredPending.length === 0) return []

  const requesterIds = filteredPending.map((p) => p.requester_id)

  // Fetch requester profiles
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username, first_name, last_name, profile_photo_url, city, state, riding_style')
    .in('id', requesterIds)
    .eq('status', 'active')
    .is('deactivated_at', null)

  if (!profiles || profiles.length === 0) return []

  // Get my friend list for mutual count
  const { data: myFriendships } = await admin
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)

  const myFriendIds = new Set<string>()
  for (const f of myFriendships ?? []) {
    myFriendIds.add(f.requester_id === user.id ? f.addressee_id : f.requester_id)
  }

  // Compute mutual friends per requester
  const mutualCounts: Record<string, number> = {}
  if (myFriendIds.size > 0 && requesterIds.length > 0) {
    const [{ data: dir1 }, { data: dir2 }] = await Promise.all([
      admin.from('friendships').select('requester_id, addressee_id').eq('status', 'accepted')
        .in('requester_id', Array.from(myFriendIds).slice(0, 200))
        .in('addressee_id', requesterIds),
      admin.from('friendships').select('requester_id, addressee_id').eq('status', 'accepted')
        .in('requester_id', requesterIds)
        .in('addressee_id', Array.from(myFriendIds).slice(0, 200)),
    ])
    for (const f of dir1 ?? []) {
      mutualCounts[f.addressee_id] = (mutualCounts[f.addressee_id] ?? 0) + 1
    }
    for (const f of dir2 ?? []) {
      mutualCounts[f.requester_id] = (mutualCounts[f.requester_id] ?? 0) + 1
    }
  }

  // Fetch primary bike (oldest) for each requester
  const { data: bikes } = await admin
    .from('user_bikes')
    .select('user_id, year, make, model')
    .in('user_id', requesterIds)
    .order('created_at', { ascending: true })

  const bikeMap = new Map<string, string>()
  for (const b of bikes ?? []) {
    if (!bikeMap.has(b.user_id)) {
      const parts = [b.year, b.make, b.model].filter(Boolean)
      if (parts.length > 0) bikeMap.set(b.user_id, parts.join(' '))
    }
  }

  const profileMap = new Map(profiles.map((p) => [p.id, p]))
  const requestDateMap = new Map(filteredPending.map((p) => [p.requester_id, p.created_at]))

  return requesterIds
    .map((id) => {
      const p = profileMap.get(id)
      if (!p) return null
      return {
        id: p.id,
        username: p.username,
        first_name: p.first_name,
        last_name: p.last_name,
        profile_photo_url: p.profile_photo_url,
        city: p.city,
        state: p.state,
        riding_style: p.riding_style ?? [],
        created_at: requestDateMap.get(id) ?? '',
        mutual_count: mutualCounts[id] ?? 0,
        primary_bike: bikeMap.get(id) ?? null,
      }
    })
    .filter(Boolean) as FriendRequestCard[]
}

export async function getMyFriends(): Promise<FriendCard[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = getServiceClient()

  const { data: friendships } = await admin
    .from('friendships')
    .select('requester_id, addressee_id, updated_at, starred_by_requester, starred_by_addressee')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    .order('updated_at', { ascending: false })

  if (!friendships || friendships.length === 0) return []

  const friendMeta = new Map<string, { friends_since: string; starred: boolean }>()
  for (const f of friendships) {
    const isRequester = f.requester_id === user.id
    const friendId = isRequester ? f.addressee_id : f.requester_id
    const starred = isRequester ? !!f.starred_by_requester : !!f.starred_by_addressee
    friendMeta.set(friendId, { friends_since: f.updated_at, starred })
  }

  const friendIds = Array.from(friendMeta.keys())

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username, first_name, last_name, profile_photo_url, city, state, riding_style, show_real_name')
    .in('id', friendIds)
    .eq('status', 'active')
    .is('deactivated_at', null)

  if (!profiles) return []

  return profiles
    .map((p) => {
      const meta = friendMeta.get(p.id)
      return {
        id: p.id,
        username: p.username,
        first_name: p.first_name,
        last_name: p.last_name,
        profile_photo_url: p.profile_photo_url,
        city: p.city,
        state: p.state,
        riding_style: p.riding_style ?? [],
        friends_since: meta?.friends_since ?? '',
        show_real_name: p.show_real_name ?? false,
        starred: meta?.starred ?? false,
      }
    })
    .sort((a, b) => {
      // Starred first, then alphabetical
      if (a.starred !== b.starred) return a.starred ? -1 : 1
      return a.first_name.localeCompare(b.first_name)
    })
}

export interface BirthdayFriend {
  id: string
  username: string | null
  profile_photo_url: string | null
}

export async function getFriendBirthdays(): Promise<BirthdayFriend[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = getServiceClient()

  // Get accepted friends
  const { data: friendships } = await admin
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)

  if (!friendships || friendships.length === 0) return []

  const friendIds = friendships.map((f) =>
    f.requester_id === user.id ? f.addressee_id : f.requester_id
  )

  // Get today's month and day
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()

  // Fetch friends who opted in to show birthday and whose DOB matches today
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username, profile_photo_url, date_of_birth')
    .in('id', friendIds)
    .eq('status', 'active')
    .eq('show_birthday', true)
    .is('deactivated_at', null)

  if (!profiles) return []

  return profiles
    .filter((p) => {
      if (!p.date_of_birth) return false
      const dob = new Date(p.date_of_birth + 'T00:00:00')
      return dob.getMonth() + 1 === month && dob.getDate() === day
    })
    .map((p) => ({
      id: p.id,
      username: p.username,
      profile_photo_url: p.profile_photo_url,
    }))
}

export async function getPendingRequestCount(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const admin = getServiceClient()
  const { count } = await admin
    .from('friendships')
    .select('*', { count: 'exact', head: true })
    .eq('addressee_id', user.id)
    .eq('status', 'pending')

  return count ?? 0
}

export async function toggleStarFriend(friendId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  // Find the friendship row
  const { data: friendship } = await admin
    .from('friendships')
    .select('id, requester_id, addressee_id, starred_by_requester, starred_by_addressee')
    .eq('status', 'accepted')
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${user.id})`
    )
    .single()

  if (!friendship) throw new Error('Friendship not found')

  const isRequester = friendship.requester_id === user.id
  const column = isRequester ? 'starred_by_requester' : 'starred_by_addressee'
  const currentValue = isRequester ? friendship.starred_by_requester : friendship.starred_by_addressee
  const newValue = currentValue ? null : new Date().toISOString()

  const { error } = await admin
    .from('friendships')
    .update({ [column]: newValue })
    .eq('id', friendship.id)

  if (error) throw new Error(error.message)

  return !!newValue
}

export async function unfriend(otherUserId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { error } = await admin
    .from('friendships')
    .delete()
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},addressee_id.eq.${user.id})`
    )

  if (error) throw new Error(error.message)
}
