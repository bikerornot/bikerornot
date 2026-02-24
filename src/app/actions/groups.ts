'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { Group, GroupMember, Post, Profile } from '@/lib/supabase/types'

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
  coverFile?: File | null
): Promise<Group> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

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
    const ext = coverFile.name.split('.').pop() ?? 'jpg'
    const path = `groups/${user.id}/${slug}.${ext}`
    const bytes = await coverFile.arrayBuffer()
    const { error: uploadErr } = await admin.storage
      .from('covers')
      .upload(path, bytes, { contentType: coverFile.type, upsert: true })
    if (uploadErr) throw new Error(uploadErr.message)
    cover_photo_url = path
  }

  // Insert group
  const { data: group, error: groupErr } = await admin
    .from('groups')
    .insert({ name, slug, description, privacy, creator_id: user.id, cover_photo_url })
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

export async function getGroups(currentUserId?: string): Promise<Group[]> {
  const admin = getServiceClient()

  const { data: groups, error } = await admin
    .from('groups')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  if (!groups) return []

  const groupIds = groups.map((g) => g.id)

  // Get member counts
  const { data: memberCounts } = await admin
    .from('group_members')
    .select('group_id')
    .in('group_id', groupIds)
    .eq('status', 'active')

  const countMap: Record<string, number> = {}
  for (const row of memberCounts ?? []) {
    countMap[row.group_id] = (countMap[row.group_id] ?? 0) + 1
  }

  // Get current user's memberships
  let myMembershipMap: Record<string, { role: string; status: string }> = {}
  if (currentUserId) {
    const { data: myMemberships } = await admin
      .from('group_members')
      .select('group_id, role, status')
      .eq('user_id', currentUserId)
      .in('group_id', groupIds)

    for (const m of myMemberships ?? []) {
      myMembershipMap[m.group_id] = { role: m.role, status: m.status }
    }
  }

  return groups.map((g) => ({
    ...g,
    member_count: countMap[g.id] ?? 0,
    is_member: !!myMembershipMap[g.id],
    member_role: (myMembershipMap[g.id]?.role as 'admin' | 'member') ?? null,
    member_status: (myMembershipMap[g.id]?.status as 'active' | 'pending') ?? null,
  }))
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
    .select('id')
    .eq('group_id', group.id)
    .eq('status', 'active')

  const member_count = memberCountRows?.length ?? 0

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

  // Sort admins first
  return (data ?? []).sort((a, b) => {
    if (a.role === 'admin' && b.role !== 'admin') return -1
    if (a.role !== 'admin' && b.role === 'admin') return 1
    return 0
  }) as GroupMember[]
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

  const base = admin
    .from('posts')
    .select('*, author:profiles!author_id(*), images:post_images(*)')
    .eq('group_id', groupId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)

  const { data, error } = cursor ? await base.lt('created_at', cursor) : await base

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) return []

  const postIds = data.map((p) => p.id)

  const [{ data: likeCounts }, { data: commentCounts }, { data: myLikes }] = await Promise.all([
    admin.from('post_likes').select('post_id').in('post_id', postIds),
    admin.from('comments').select('post_id').in('post_id', postIds).is('deleted_at', null),
    admin.from('post_likes').select('post_id').in('post_id', postIds).eq('user_id', user.id),
  ])

  const likeMap = (likeCounts ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.post_id] = (acc[r.post_id] ?? 0) + 1
    return acc
  }, {})
  const commentMap = (commentCounts ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.post_id] = (acc[r.post_id] ?? 0) + 1
    return acc
  }, {})
  const myLikeSet = new Set((myLikes ?? []).map((l) => l.post_id))

  return data.map((post) => ({
    ...post,
    like_count: likeMap[post.id] ?? 0,
    comment_count: commentMap[post.id] ?? 0,
    is_liked_by_me: myLikeSet.has(post.id),
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

  // Filter out friends who are already members
  const invitableIds = friendIds.filter((id) => !memberSet.has(id))
  if (invitableIds.length === 0) return []

  const { data: profiles } = await admin
    .from('profiles')
    .select('*')
    .in('id', invitableIds)
    .order('username', { ascending: true })

  return (profiles ?? []) as Profile[]
}

export async function inviteFriendsToGroup(groupId: string, userIds: string[]): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  if (userIds.length === 0) return

  const admin = getServiceClient()

  // Verify caller is an admin of the group
  const { data: membership } = await admin
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .single()

  if (membership?.role !== 'admin') throw new Error('Not authorized')

  // Get existing members to avoid double-inviting
  const { data: existing } = await admin
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .in('user_id', userIds)

  const alreadyIn = new Set((existing ?? []).map((m) => m.user_id))
  const toInvite = userIds.filter((id) => !alreadyIn.has(id))
  if (toInvite.length === 0) return

  // Send a group_invite notification to each invitee
  const notifications = toInvite.map((uid) => ({
    user_id: uid,
    type: 'group_invite',
    actor_id: user.id,
    group_id: groupId,
  }))

  const { error } = await admin.from('notifications').insert(notifications)
  if (error) throw new Error(error.message)
}
