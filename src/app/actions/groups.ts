'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { Group, GroupMember, GroupCategory, Post, Profile } from '@/lib/supabase/types'
import { validateImageFile } from '@/lib/rate-limit'
import { moderateImage } from '@/lib/sightengine'
import { notifyIfActive } from '@/lib/notify'
import { geocodeZip } from '@/lib/geocode'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 7)
}

export async function createGroup(
  name: string,
  description: string | null,
  privacy: 'public' | 'private',
  coverFile?: File | null,
  options?: {
    category?: GroupCategory | null
    city?: string | null
    state?: string | null
    zipCode?: string | null
  }
): Promise<Group> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  if (!name.trim()) throw new Error('Group name is required')
  if (name.trim().length > 100) throw new Error('Group name too long (max 100 characters)')
  if (description && description.length > 1000) throw new Error('Description too long (max 1000 characters)')

  const admin = getServiceClient()

  // Generate unique slug
  const base = slugify(name) || 'group'
  let slug = base
  const { data: existing } = await admin.from('groups').select('slug').eq('slug', slug).single()
  if (existing) {
    slug = `${base}-${randomSuffix()}`
  }

  // Upload cover photo if provided
  let cover_photo_url: string | null = null
  if (coverFile && coverFile.size > 0) {
    validateImageFile(coverFile)
    const ext = coverFile.name.split('.').pop() ?? 'jpg'
    const path = `groups/${user.id}/${slug}.${ext}`
    const bytes = await coverFile.arrayBuffer()
    const coverModeration = await moderateImage(bytes, coverFile.type)
    if (coverModeration === 'rejected') throw new Error('This image was rejected by our content filter. Please choose a different photo.')
    const { error: uploadErr } = await admin.storage
      .from('covers')
      .upload(path, bytes, { contentType: coverFile.type, upsert: true })
    if (uploadErr) throw new Error(uploadErr.message)
    cover_photo_url = path
  }

  // Geocode zip if provided
  let latitude: number | null = null
  let longitude: number | null = null
  let city = options?.city?.trim() || null
  let state = options?.state?.trim() || null
  const zip_code = options?.zipCode?.trim() || null

  if (zip_code) {
    const geo = await geocodeZip(zip_code)
    if (geo) {
      latitude = geo.lat
      longitude = geo.lng
      if (!city) city = geo.city
      if (!state) state = geo.state
    }
  }

  // Insert group
  const { data: group, error: groupErr } = await admin
    .from('groups')
    .insert({
      name, slug, description, privacy, creator_id: user.id, cover_photo_url,
      category: options?.category || null,
      city, state, zip_code, latitude, longitude,
    })
    .select()
    .single()

  if (groupErr) throw new Error(groupErr.message)

  // Add creator as admin
  const { error: memberErr } = await admin
    .from('group_members')
    .insert({ group_id: group.id, user_id: user.id, role: 'admin', status: 'active' })

  if (memberErr) throw new Error(memberErr.message)

  return { ...group, member_count: 1, is_member: true, member_role: 'admin', member_status: 'active' }
}

export async function getGroups(currentUserId?: string): Promise<{
  groups: Group[]
  userLat: number | null
  userLng: number | null
}> {
  const admin = getServiceClient()

  const { data: groups, error } = await admin
    .from('groups')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  if (!groups) return { groups: [], userLat: null, userLng: null }

  const groupIds = groups.map((g) => g.id)

  // Get member counts (exclude banned/deactivated profiles)
  const { data: memberCounts } = await admin
    .from('group_members')
    .select('group_id, profile:profiles!user_id(status, deactivated_at)')
    .in('group_id', groupIds)
    .eq('status', 'active')

  const countMap: Record<string, number> = {}
  for (const row of memberCounts ?? []) {
    const p = (row as any).profile
    if (p?.status === 'active' && !p?.deactivated_at) {
      countMap[row.group_id] = (countMap[row.group_id] ?? 0) + 1
    }
  }

  // Get current user's memberships + lat/lng
  let myMembershipMap: Record<string, { role: string; status: string }> = {}
  let userLat: number | null = null
  let userLng: number | null = null

  if (currentUserId) {
    const [{ data: myMemberships }, { data: profile }] = await Promise.all([
      admin
        .from('group_members')
        .select('group_id, role, status')
        .eq('user_id', currentUserId)
        .in('group_id', groupIds),
      admin
        .from('profiles')
        .select('latitude, longitude')
        .eq('id', currentUserId)
        .single(),
    ])

    for (const m of myMemberships ?? []) {
      myMembershipMap[m.group_id] = { role: m.role, status: m.status }
    }

    userLat = profile?.latitude ?? null
    userLng = profile?.longitude ?? null
  }

  return {
    groups: groups.map((g) => ({
      ...g,
      member_count: countMap[g.id] ?? 0,
      is_member: !!myMembershipMap[g.id],
      member_role: (myMembershipMap[g.id]?.role as 'admin' | 'member') ?? null,
      member_status: (myMembershipMap[g.id]?.status as 'active' | 'pending') ?? null,
    })),
    userLat,
    userLng,
  }
}

export async function getGroup(slug: string, currentUserId?: string): Promise<Group | null> {
  const admin = getServiceClient()

  const { data: group, error } = await admin
    .from('groups')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error || !group) return null

  const { data: memberCountRows } = await admin
    .from('group_members')
    .select('id, profile:profiles!user_id(status, deactivated_at)')
    .eq('group_id', group.id)
    .eq('status', 'active')

  const member_count = (memberCountRows ?? []).filter((r) => {
    const p = (r as any).profile
    return p?.status === 'active' && !p?.deactivated_at
  }).length

  let member_role: 'admin' | 'member' | null = null
  let member_status: 'active' | 'pending' | null = null
  let is_member = false

  if (currentUserId) {
    const { data: membership } = await admin
      .from('group_members')
      .select('role, status')
      .eq('group_id', group.id)
      .eq('user_id', currentUserId)
      .single()

    if (membership) {
      is_member = true
      member_role = membership.role as 'admin' | 'member'
      member_status = membership.status as 'active' | 'pending'
    }
  }

  return { ...group, member_count, is_member, member_role, member_status }
}

export async function joinGroup(groupId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  const { data: group } = await admin
    .from('groups')
    .select('privacy')
    .eq('id', groupId)
    .single()

  if (!group) throw new Error('Group not found')

  const status = group.privacy === 'public' ? 'active' : 'pending'

  const { error } = await admin
    .from('group_members')
    .insert({ group_id: groupId, user_id: user.id, role: 'member', status })

  if (error && error.code !== '23505') throw new Error(error.message)
  if (error?.code === '23505') return // Already a member — skip duplicate join post

  // Create a "joined" activity post in the group feed (public groups only)
  if (status === 'active') {
    await admin.from('posts').insert({
      author_id: user.id,
      group_id: groupId,
      content: 'Joined the group! 👋',
    })
  }
}

export async function leaveGroup(groupId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  // Check if sole admin
  const { data: membership } = await admin
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .single()

  if (membership?.role === 'admin') {
    const { count } = await admin
      .from('group_members')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .eq('role', 'admin')
      .eq('status', 'active')

    if ((count ?? 0) <= 1) {
      throw new Error('You are the sole admin. Transfer admin or delete the group before leaving.')
    }
  }

  const { error } = await admin
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', user.id)

  if (error) throw new Error(error.message)
}

export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  const admin = getServiceClient()

  const { data, error } = await admin
    .from('group_members')
    .select('*, profile:profiles!user_id(*)')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .order('role', { ascending: true }) // admin < member alphabetically

  if (error) throw new Error(error.message)

  // Filter out banned/deactivated profiles, then sort admins first
  return ((data ?? []) as GroupMember[])
    .filter((m) => {
      const p = m.profile as any
      return p?.status === 'active' && !p?.deactivated_at
    })
    .sort((a, b) => {
      if (a.role === 'admin' && b.role !== 'admin') return -1
      if (a.role !== 'admin' && b.role === 'admin') return 1
      return 0
    })
}

export async function getPendingRequests(groupId: string): Promise<GroupMember[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  // Verify requester is admin
  const { data: membership } = await admin
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .single()

  if (membership?.role !== 'admin') throw new Error('Not authorized')

  const { data, error } = await admin
    .from('group_members')
    .select('*, profile:profiles!user_id(*)')
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .order('joined_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as GroupMember[]
}

export async function approveRequest(groupId: string, userId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  const { data: membership } = await admin
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .single()

  if (membership?.role !== 'admin') throw new Error('Not authorized')

  const { error } = await admin
    .from('group_members')
    .update({ status: 'active' })
    .eq('group_id', groupId)
    .eq('user_id', userId)

  if (error) throw new Error(error.message)

  // Create a "joined" activity post in the group feed
  await admin.from('posts').insert({
    author_id: userId,
    group_id: groupId,
    content: 'Joined the group! 👋',
  })
}

export async function removeMember(groupId: string, userId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  const { data: membership } = await admin
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .single()

  if (membership?.role !== 'admin') throw new Error('Not authorized')

  // Prevent removing another admin
  const { data: target } = await admin
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .single()

  if (target?.role === 'admin') throw new Error('Cannot remove another admin')

  const { error } = await admin
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
}

export async function denyRequest(groupId: string, userId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  const { data: membership } = await admin
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .single()

  if (membership?.role !== 'admin') throw new Error('Not authorized')

  const { error } = await admin
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
}

const PAGE_SIZE = 10

export async function getGroupPosts(groupId: string, cursor?: string): Promise<Post[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  // Verify the group exists and check privacy + membership
  const { data: group } = await admin
    .from('groups')
    .select('privacy')
    .eq('id', groupId)
    .single()

  if (!group) throw new Error('Group not found')

  if (group.privacy === 'private') {
    const { data: membership } = await admin
      .from('group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()
    if (!membership) throw new Error('Not a member of this group')
  }

  // Fetch extra to account for banned/suspended authors being filtered out
  const FETCH_SIZE = PAGE_SIZE + 10

  const base = admin
    .from('posts')
    .select('*, author:profiles!author_id(*), images:post_images(*), event:events!event_id(id, type, title, slug, starts_at, city, state, going_count, cover_photo_url, status)')
    .eq('group_id', groupId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(FETCH_SIZE)

  const { data, error } = cursor ? await base.lt('created_at', cursor) : await base

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) return []

  // Only keep posts where the author is confirmed active (not banned/suspended/missing)
  const filtered = data.filter((p: any) => p.author?.status === 'active').slice(0, PAGE_SIZE)

  const postIds = filtered.map((p: any) => p.id)
  const sharedPostIds = filtered.map((p: any) => p.shared_post_id).filter(Boolean) as string[]

  const [{ data: likeCounts }, { data: commentCounts }, { data: myLikes }, { data: sharedPostsData }] = await Promise.all([
    admin.from('post_likes').select('post_id').in('post_id', postIds),
    admin.from('comments').select('post_id, author:profiles!author_id(status)').in('post_id', postIds).is('deleted_at', null),
    admin.from('post_likes').select('post_id').in('post_id', postIds).eq('user_id', user.id),
    sharedPostIds.length > 0
      ? admin.from('posts').select('*, author:profiles!author_id(*), images:post_images(*)').in('id', sharedPostIds)
      : Promise.resolve({ data: [] }),
  ])

  const likeMap = (likeCounts ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.post_id] = (acc[r.post_id] ?? 0) + 1
    return acc
  }, {})
  const commentMap = (commentCounts ?? []).reduce<Record<string, number>>((acc, r: any) => {
    if (['banned', 'suspended'].includes(r.author?.status)) return acc
    acc[r.post_id] = (acc[r.post_id] ?? 0) + 1
    return acc
  }, {})
  const myLikeSet = new Set((myLikes ?? []).map((l) => l.post_id))
  const sharedPostMap: Record<string, Post> = {}
  for (const p of sharedPostsData ?? []) {
    sharedPostMap[p.id] = p as Post
  }

  return filtered.map((post: any) => ({
    ...post,
    like_count: likeMap[post.id] ?? 0,
    comment_count: commentMap[post.id] ?? 0,
    is_liked_by_me: myLikeSet.has(post.id),
    shared_post: post.shared_post_id ? (sharedPostMap[post.shared_post_id] ?? null) : null,
  })) as Post[]
}

export async function getFriendsNotInGroup(groupId: string): Promise<Profile[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  // Get all accepted friend IDs
  const { data: friendships } = await admin
    .from('friendships')
    .select('requester_id, addressee_id')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    .eq('status', 'accepted')

  if (!friendships || friendships.length === 0) return []

  const friendIds = friendships.map((f) =>
    f.requester_id === user.id ? f.addressee_id : f.requester_id
  )

  // Get existing group member IDs (active or pending)
  const { data: members } = await admin
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)

  const memberSet = new Set((members ?? []).map((m) => m.user_id))

  // Get already-invited users (pending or declined — declined can never be re-invited)
  const { data: invites } = await admin
    .from('group_invites')
    .select('invited_user_id')
    .eq('group_id', groupId)

  const invitedSet = new Set((invites ?? []).map((i) => i.invited_user_id))

  // Filter out friends who are already members or already invited/declined
  const invitableIds = friendIds.filter((id) => !memberSet.has(id) && !invitedSet.has(id))
  if (invitableIds.length === 0) return []

  const { data: profiles } = await admin
    .from('profiles')
    .select('*')
    .in('id', invitableIds)
    .eq('status', 'active')
    .is('deactivated_at', null)
    .order('username', { ascending: true })

  return (profiles ?? []) as Profile[]
}

export async function updateGroup(
  groupId: string,
  updates: {
    description?: string | null
    coverFile?: File | null
    privacy?: 'private'
    category?: GroupCategory | null
    city?: string | null
    state?: string | null
    zipCode?: string | null
  }
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  // Verify admin
  const { data: membership } = await admin
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .single()

  if (membership?.role !== 'admin') throw new Error('Not authorized')

  // Fetch current group for slug + privacy guard + zip comparison
  const { data: group } = await admin.from('groups').select('*').eq('id', groupId).single()
  if (!group) throw new Error('Group not found')

  const patch: Record<string, unknown> = {}

  if ('description' in updates) {
    patch.description = updates.description
  }

  // Privacy: public → private only
  if (updates.privacy === 'private' && group.privacy === 'public') {
    patch.privacy = 'private'
  }

  // Category
  if ('category' in updates) {
    patch.category = updates.category || null
  }

  // Location
  if ('city' in updates) patch.city = updates.city?.trim() || null
  if ('state' in updates) patch.state = updates.state?.trim() || null
  if ('zipCode' in updates) {
    const newZip = updates.zipCode?.trim() || null
    patch.zip_code = newZip
    if (newZip && newZip !== group.zip_code) {
      const geo = await geocodeZip(newZip)
      if (geo) {
        patch.latitude = geo.lat
        patch.longitude = geo.lng
        if (!('city' in updates) || !updates.city?.trim()) patch.city = geo.city
        if (!('state' in updates) || !updates.state?.trim()) patch.state = geo.state
      }
    } else if (!newZip) {
      patch.latitude = null
      patch.longitude = null
    }
  }

  // Cover photo upload
  if (updates.coverFile && updates.coverFile.size > 0) {
    const ext = updates.coverFile.name.split('.').pop() ?? 'jpg'
    const path = `groups/${user.id}/${group.slug}.${ext}`
    const bytes = await updates.coverFile.arrayBuffer()
    const coverModeration = await moderateImage(bytes, updates.coverFile.type)
    if (coverModeration === 'rejected') throw new Error('This image was rejected by our content filter. Please choose a different photo.')
    const { error: uploadErr } = await admin.storage
      .from('covers')
      .upload(path, bytes, { contentType: updates.coverFile.type, upsert: true })
    if (uploadErr) throw new Error(uploadErr.message)
    patch.cover_photo_url = path
  }

  if (Object.keys(patch).length === 0) return

  patch.updated_at = new Date().toISOString()
  const { error } = await admin.from('groups').update(patch).eq('id', groupId)
  if (error) throw new Error(error.message)
}

const SENDER_DAILY_CAP = 50
const RECEIVER_DAILY_CAP = 10

export async function inviteFriendsToGroup(
  groupId: string,
  userIds: string[],
  isMassInvite?: boolean
): Promise<{ sent: number; skipped: number; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sent: 0, skipped: 0, error: 'Not authenticated' }

  if (userIds.length === 0) return { sent: 0, skipped: 0 }

  const admin = getServiceClient()

  // Verify caller is a member of the group
  const { data: membership } = await admin
    .from('group_members')
    .select('role, status')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .single()

  if (!membership || membership.status !== 'active') return { sent: 0, skipped: 0, error: 'Not a member of this group' }

  // If mass invite, check 30-day cooldown
  if (isMassInvite) {
    const { data: lastMass } = await admin
      .from('group_mass_invites')
      .select('used_at')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .order('used_at', { ascending: false })
      .limit(1)
      .single()

    if (lastMass) {
      const cooldownEnd = new Date(lastMass.used_at)
      cooldownEnd.setDate(cooldownEnd.getDate() + 30)
      if (new Date() < cooldownEnd) {
        return { sent: 0, skipped: userIds.length, error: `Mass invite on cooldown until ${cooldownEnd.toLocaleDateString()}` }
      }
    }
  }

  // Check sender daily cap
  const oneDayAgo = new Date(Date.now() - 86400000).toISOString()
  const { count: senderCount } = await admin
    .from('group_invites')
    .select('*', { count: 'exact', head: true })
    .eq('invited_by', user.id)
    .gte('created_at', oneDayAgo)

  const senderRemaining = SENDER_DAILY_CAP - (senderCount ?? 0)
  if (senderRemaining <= 0) return { sent: 0, skipped: userIds.length, error: 'You have reached your daily invite limit. Try again tomorrow.' }

  // Get existing members to avoid double-inviting
  const { data: existingMembers } = await admin
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .in('user_id', userIds)

  const memberSet = new Set((existingMembers ?? []).map((m) => m.user_id))

  // Get existing invites (any status — declined can never be re-invited)
  const { data: existingInvites } = await admin
    .from('group_invites')
    .select('invited_user_id')
    .eq('group_id', groupId)
    .in('invited_user_id', userIds)

  const invitedSet = new Set((existingInvites ?? []).map((i) => i.invited_user_id))

  // Filter to invitable users, cap by sender limit
  let toInvite = userIds.filter((id) => !memberSet.has(id) && !invitedSet.has(id))
  if (toInvite.length > senderRemaining) {
    toInvite = toInvite.slice(0, senderRemaining)
  }

  if (toInvite.length === 0) return { sent: 0, skipped: userIds.length }

  // Check receiver daily caps — find who's already at limit today
  const { data: receiverCounts } = await admin
    .from('group_invites')
    .select('invited_user_id')
    .in('invited_user_id', toInvite)
    .gte('created_at', oneDayAgo)

  const receiverCountMap: Record<string, number> = {}
  for (const r of receiverCounts ?? []) {
    receiverCountMap[r.invited_user_id] = (receiverCountMap[r.invited_user_id] ?? 0) + 1
  }

  const eligible = toInvite.filter((id) => (receiverCountMap[id] ?? 0) < RECEIVER_DAILY_CAP)
  const skipped = userIds.length - eligible.length

  if (eligible.length === 0) return { sent: 0, skipped }

  // Insert into group_invites
  const inviteRows = eligible.map((uid) => ({
    group_id: groupId,
    invited_user_id: uid,
    invited_by: user.id,
    status: 'pending',
  }))

  const { error: inviteErr } = await admin.from('group_invites').insert(inviteRows)
  if (inviteErr) throw new Error(inviteErr.message)

  // Send notifications
  const notifications = eligible.map((uid) => ({
    user_id: uid,
    type: 'group_invite',
    actor_id: user.id,
    group_id: groupId,
  }))

  await notifyIfActive(user.id, notifications)

  // Record mass invite usage
  if (isMassInvite) {
    await admin.from('group_mass_invites').insert({
      group_id: groupId,
      user_id: user.id,
      invite_count: eligible.length,
    })
  }

  return { sent: eligible.length, skipped }
}

export async function canMassInvite(groupId: string): Promise<{ allowed: boolean; nextAvailable: Date | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { allowed: false, nextAvailable: null }

  const admin = getServiceClient()

  const { data: lastMass } = await admin
    .from('group_mass_invites')
    .select('used_at')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .order('used_at', { ascending: false })
    .limit(1)
    .single()

  if (!lastMass) return { allowed: true, nextAvailable: null }

  const cooldownEnd = new Date(lastMass.used_at)
  cooldownEnd.setDate(cooldownEnd.getDate() + 30)

  if (new Date() >= cooldownEnd) return { allowed: true, nextAvailable: null }

  return { allowed: false, nextAvailable: cooldownEnd }
}

export async function respondToGroupInvite(
  groupId: string,
  accept: boolean
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  // Find the pending invite
  const { data: invite } = await admin
    .from('group_invites')
    .select('id')
    .eq('group_id', groupId)
    .eq('invited_user_id', user.id)
    .eq('status', 'pending')
    .single()

  if (!invite) throw new Error('Invite not found')

  // Update invite status
  const { error: updateErr } = await admin
    .from('group_invites')
    .update({
      status: accept ? 'accepted' : 'declined',
      responded_at: new Date().toISOString(),
    })
    .eq('id', invite.id)

  if (updateErr) throw new Error(updateErr.message)

  if (accept) {
    // Add as member — check group privacy for status
    const { data: group } = await admin
      .from('groups')
      .select('privacy')
      .eq('id', groupId)
      .single()

    const memberStatus = group?.privacy === 'private' ? 'pending' : 'active'

    // Insert into group_members (ignore conflict if already a member)
    const { error: memberErr } = await admin
      .from('group_members')
      .insert({ group_id: groupId, user_id: user.id, role: 'member', status: memberStatus })

    if (memberErr && memberErr.code !== '23505') throw new Error(memberErr.message)

    // Create a "joined" activity post in the group feed
    if (memberStatus === 'active') {
      await admin.from('posts').insert({
        author_id: user.id,
        group_id: groupId,
        content: 'Joined the group! 👋',
      })
    }
  }

  // Clean up the notification
  await admin
    .from('notifications')
    .delete()
    .eq('user_id', user.id)
    .eq('group_id', groupId)
    .eq('type', 'group_invite')
}
