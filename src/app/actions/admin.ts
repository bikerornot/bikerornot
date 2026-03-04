'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { HIGH_RISK_COUNTRIES, computeRiskFlags } from '@/lib/risk'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface RecentSignup {
  id: string
  username: string | null
  first_name: string
  last_name: string
  created_at: string
  status: string
  profile_photo_url: string | null
}

export interface RecentReport {
  id: string
  reported_type: string
  reason: string
  created_at: string
  reporter_username: string | null
}

export interface DashboardStats {
  totalUsers: number
  newToday: number
  newLast24h: number
  newThisWeek: number
  newThisMonth: number
  pendingReports: number
  bannedUsers: number
  suspendedUsers: number
  flaggedUsers: number
  recentSignups: RecentSignup[]
  recentReports: RecentReport[]
}

// Returns the UTC timestamp for the start of today in US Eastern time,
// automatically accounting for EST (UTC-5) vs EDT (UTC-4) DST transitions.
function getEasternMidnightUTC(): string {
  const now = new Date()
  // 'sv-SE' locale reliably gives YYYY-MM-DD format
  const easternDate = now.toLocaleDateString('sv-SE', { timeZone: 'America/New_York' })
  const [y, m, d] = easternDate.split('-').map(Number)
  // Eastern is either UTC-5 (EST) or UTC-4 (EDT) — try both
  for (const offsetHours of [5, 4]) {
    const candidate = new Date(Date.UTC(y, m - 1, d, offsetHours))
    const easternHour = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour: 'numeric', hour12: false,
    }).format(candidate)
    if (easternHour === '0' || easternHour === '00') return candidate.toISOString()
  }
  // Fallback to EST
  return new Date(Date.UTC(y, m - 1, d, 5)).toISOString()
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const admin = getServiceClient()

  const now = new Date()
  const todayStart = getEasternMidnightUTC()
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { count: totalUsers },
    { count: newToday },
    { count: newLast24h },
    { count: newThisWeek },
    { count: newThisMonth },
    { count: pendingReports },
    { count: bannedUsers },
    { count: suspendedUsers },
    { count: flaggedUsers },
    { data: recentSignups },
    { data: recentReportsRaw },
  ] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
    admin.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', last24h),
    admin.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
    admin.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', monthAgo),
    admin.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'banned'),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'suspended'),
    admin.from('profiles').select('*', { count: 'exact', head: true }).in('signup_country', HIGH_RISK_COUNTRIES).eq('status', 'active'),
    admin.from('profiles')
      .select('id, username, first_name, last_name, created_at, status, profile_photo_url')
      .order('created_at', { ascending: false })
      .limit(8),
    admin.from('reports')
      .select('id, reported_type, reason, created_at, reporter:profiles!reporter_id(username)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  return {
    totalUsers: totalUsers ?? 0,
    newToday: newToday ?? 0,
    newLast24h: newLast24h ?? 0,
    newThisWeek: newThisWeek ?? 0,
    newThisMonth: newThisMonth ?? 0,
    pendingReports: pendingReports ?? 0,
    bannedUsers: bannedUsers ?? 0,
    suspendedUsers: suspendedUsers ?? 0,
    flaggedUsers: flaggedUsers ?? 0,
    recentSignups: (recentSignups ?? []) as RecentSignup[],
    recentReports: (recentReportsRaw ?? []).map((r: any) => ({
      id: r.id,
      reported_type: r.reported_type,
      reason: r.reason,
      created_at: r.created_at,
      reporter_username: r.reporter?.username ?? null,
    })),
  }
}

// ─── User Management ────────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) throw new Error('Not authorized')
  return user.id
}

export interface AdminUserRow {
  id: string
  username: string | null
  first_name: string
  last_name: string
  created_at: string
  status: string
  role: string
  city: string | null
  state: string | null
  profile_photo_url: string | null
  signup_country: string | null
  signup_region: string | null
  signup_city: string | null
  signup_ref_url: string | null
  date_of_birth: string | null
  gender: string | null
  post_count: number
  message_count: number
  comment_count: number
  risk_flags: string[]
}

export interface AdminUserDetail {
  id: string
  username: string | null
  first_name: string
  last_name: string
  email: string | null
  bio: string | null
  zip_code: string
  city: string | null
  state: string | null
  date_of_birth: string | null
  created_at: string
  status: string
  role: string
  profile_photo_url: string | null
  signup_ip: string | null
  signup_country: string | null
  signup_region: string | null
  signup_city: string | null
  signup_ref_url: string | null
  suspension_reason: string | null
  suspended_until: string | null
  ban_reason: string | null
  post_count: number
  message_count: number
  comment_count: number
  report_count: number
  recent_posts: Array<{
    id: string
    content: string | null
    created_at: string
    images: string[]
  }>
  recent_reports: Array<{
    id: string
    reported_type: string
    reason: string
    status: string
    created_at: string
    reporter_username: string | null
  }>
  recent_messages: Array<{
    id: string
    content: string
    created_at: string
    recipient_username: string | null
  }>
}

export async function getUsers({
  search = '',
  status = '',
  gender = '',
  page = 1,
  pageSize = 25,
}: {
  search?: string
  status?: string
  gender?: string
  page?: number
  pageSize?: number
} = {}): Promise<{ users: AdminUserRow[]; total: number; pageSize: number }> {
  const admin = getServiceClient()

  let query = admin
    .from('profiles')
    .select('id, username, first_name, last_name, created_at, status, role, city, state, profile_photo_url, signup_country, signup_region, signup_city, signup_ref_url, date_of_birth, gender', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (search) {
    query = query.or(`username.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`) as typeof query
  }
  if (status === 'flagged') {
    query = query.in('signup_country', HIGH_RISK_COUNTRIES).eq('status', 'active') as typeof query
  } else if (status) {
    query = query.eq('status', status) as typeof query
  }
  if (gender === 'male' || gender === 'female') {
    query = query.eq('gender', gender) as typeof query
  } else if (gender === 'unknown') {
    query = query.is('gender', null) as typeof query
  }

  const { data, count } = await query

  const userIds = (data ?? []).map((u) => u.id)
  let postCountMap: Record<string, number> = {}
  let messageCountMap: Record<string, number> = {}
  let commentCountMap: Record<string, number> = {}
  if (userIds.length > 0) {
    const { data: counts } = await admin.rpc('get_user_activity_counts', { user_ids: userIds })
    for (const row of counts ?? []) {
      postCountMap[row.user_id] = Number(row.post_count)
      messageCountMap[row.user_id] = Number(row.message_count)
      commentCountMap[row.user_id] = Number(row.comment_count)
    }
  }

  return {
    users: (data ?? []).map((u) => ({
      ...u,
      post_count: postCountMap[u.id] ?? 0,
      message_count: messageCountMap[u.id] ?? 0,
      comment_count: commentCountMap[u.id] ?? 0,
      risk_flags: computeRiskFlags(u),
    })) as AdminUserRow[],
    total: count ?? 0,
    pageSize,
  }
}

export async function getGenderCounts(): Promise<{ male: number; female: number; unknown: number }> {
  const admin = getServiceClient()
  const [{ count: male }, { count: female }, { count: total }] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('gender', 'male'),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('gender', 'female'),
    admin.from('profiles').select('*', { count: 'exact', head: true }),
  ])
  return {
    male: male ?? 0,
    female: female ?? 0,
    unknown: (total ?? 0) - (male ?? 0) - (female ?? 0),
  }
}

export async function getUserDetail(userId: string): Promise<AdminUserDetail | null> {
  const admin = getServiceClient()

  const [{ data: profile }, { data: { user: authUser } }] = await Promise.all([
    admin.from('profiles').select('*').eq('id', userId).single(),
    admin.auth.admin.getUserById(userId),
  ])

  if (!profile) return null

  // Post count + recent posts
  const { data: posts } = await admin
    .from('posts')
    .select('id, content, created_at')
    .eq('author_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const postIds = (posts ?? []).map((p) => p.id)

  // Images for recent posts
  let imageMap: Record<string, string[]> = {}
  if (postIds.length > 0) {
    const { data: images } = await admin
      .from('post_images')
      .select('post_id, storage_path')
      .in('post_id', postIds.slice(0, 10))
      .order('order_index')
    for (const img of images ?? []) {
      if (!imageMap[img.post_id]) imageMap[img.post_id] = []
      imageMap[img.post_id].push(img.storage_path)
    }
  }

  // Last 50 sent messages with recipient info
  const { data: rawMessages } = await admin
    .from('messages')
    .select('id, content, created_at, conversation_id')
    .eq('sender_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  const convIds = [...new Set((rawMessages ?? []).map((m) => m.conversation_id))]
  let recipientMap: Record<string, string | null> = {}
  if (convIds.length > 0) {
    const { data: convs } = await admin
      .from('conversations')
      .select('id, participant1_id, participant2_id, p1:profiles!participant1_id(username), p2:profiles!participant2_id(username)')
      .in('id', convIds)
    for (const c of convs ?? []) {
      const cc = c as any
      recipientMap[c.id] = c.participant1_id === userId ? cc.p2?.username : cc.p1?.username
    }
  }

  // Report / message / comment counts
  const [{ count: profileReports }, { count: postReports }, { count: totalMessages }, { count: totalComments }] = await Promise.all([
    admin.from('reports').select('*', { count: 'exact', head: true }).eq('reported_type', 'profile').eq('reported_id', userId),
    postIds.length > 0
      ? admin.from('reports').select('*', { count: 'exact', head: true }).eq('reported_type', 'post').in('reported_id', postIds)
      : Promise.resolve({ count: 0 }),
    admin.from('messages').select('*', { count: 'exact', head: true }).eq('sender_id', userId),
    admin.from('comments').select('*', { count: 'exact', head: true }).eq('author_id', userId).is('deleted_at', null),
  ])

  // Recent reports against this user's profile
  const { data: recentReports } = await admin
    .from('reports')
    .select('id, reported_type, reason, status, created_at, reporter:profiles!reporter_id(username)')
    .eq('reported_type', 'profile')
    .eq('reported_id', userId)
    .order('created_at', { ascending: false })
    .limit(5)

  return {
    id: profile.id,
    username: profile.username,
    first_name: profile.first_name,
    last_name: profile.last_name,
    email: authUser?.email ?? null,
    bio: profile.bio,
    zip_code: profile.zip_code,
    city: profile.city,
    state: profile.state,
    date_of_birth: profile.date_of_birth ?? null,
    created_at: profile.created_at,
    status: profile.status,
    role: profile.role,
    profile_photo_url: profile.profile_photo_url,
    signup_ip: profile.signup_ip ?? null,
    signup_country: profile.signup_country ?? null,
    signup_region: profile.signup_region ?? null,
    signup_city: profile.signup_city ?? null,
    signup_ref_url: profile.signup_ref_url ?? null,
    suspension_reason: profile.suspension_reason ?? null,
    suspended_until: profile.suspended_until ?? null,
    ban_reason: profile.ban_reason ?? null,
    post_count: (posts ?? []).length,
    message_count: totalMessages ?? 0,
    comment_count: totalComments ?? 0,
    report_count: (profileReports ?? 0) + (postReports ?? 0),
    recent_posts: (posts ?? []).slice(0, 10).map((p) => ({
      id: p.id,
      content: p.content,
      created_at: p.created_at,
      images: imageMap[p.id] ?? [],
    })),
    recent_reports: (recentReports ?? []).map((r: any) => ({
      id: r.id,
      reported_type: r.reported_type,
      reason: r.reason,
      status: r.status,
      created_at: r.created_at,
      reporter_username: r.reporter?.username ?? null,
    })),
    recent_messages: (rawMessages ?? []).map((m) => ({
      id: m.id,
      content: m.content,
      created_at: m.created_at,
      recipient_username: recipientMap[m.conversation_id] ?? null,
    })),
  }
}

export async function suspendUser(userId: string, reason: string, days: number | null): Promise<void> {
  await requireAdmin()
  const admin = getServiceClient()
  const suspended_until = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null
  await admin.from('profiles').update({
    status: 'suspended',
    suspension_reason: reason,
    suspended_until,
  }).eq('id', userId)
}

export async function banUser(userId: string, reason: string): Promise<void> {
  await requireAdmin()
  const admin = getServiceClient()
  await admin.from('profiles').update({
    status: 'banned',
    ban_reason: reason,
    suspension_reason: null,
    suspended_until: null,
  }).eq('id', userId)

  // Auto-suspend all active groups created by this user
  await admin
    .from('groups')
    .update({ status: 'suspended', suspended_reason: `Creator account banned: ${reason}` })
    .eq('creator_id', userId)
    .eq('status', 'active')
}

// ─── Admin Group Management ──────────────────────────────────────────────────

export interface AdminGroupRow {
  id: string
  name: string
  slug: string
  privacy: 'public' | 'private'
  status: 'active' | 'suspended'
  suspended_reason: string | null
  member_count: number
  created_at: string
}

export interface GroupMemberOption {
  user_id: string
  username: string | null
  first_name: string
  last_name: string
}

export async function getGroupsByCreator(userId: string): Promise<AdminGroupRow[]> {
  const admin = getServiceClient()

  const { data: groups } = await admin
    .from('groups')
    .select('id, name, slug, privacy, status, suspended_reason, created_at')
    .eq('creator_id', userId)
    .order('created_at', { ascending: false })

  if (!groups || groups.length === 0) return []

  const groupIds = groups.map((g) => g.id)
  const { data: memberCounts } = await admin
    .from('group_members')
    .select('group_id')
    .in('group_id', groupIds)
    .eq('status', 'active')

  const countMap: Record<string, number> = {}
  for (const row of memberCounts ?? []) {
    countMap[row.group_id] = (countMap[row.group_id] ?? 0) + 1
  }

  return groups.map((g) => ({ ...g, member_count: countMap[g.id] ?? 0 })) as AdminGroupRow[]
}

export async function suspendGroup(groupId: string, reason: string): Promise<void> {
  await requireAdmin()
  const admin = getServiceClient()
  await admin
    .from('groups')
    .update({ status: 'suspended', suspended_reason: reason })
    .eq('id', groupId)
}

export async function reinstateGroup(groupId: string): Promise<void> {
  await requireAdmin()
  const admin = getServiceClient()
  await admin
    .from('groups')
    .update({ status: 'active', suspended_reason: null })
    .eq('id', groupId)
}

export async function getGroupMembersForTransfer(
  groupId: string,
  excludeUserId: string
): Promise<GroupMemberOption[]> {
  const admin = getServiceClient()
  const { data } = await admin
    .from('group_members')
    .select('user_id, profile:profiles!user_id(username, first_name, last_name)')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .neq('user_id', excludeUserId)

  return (data ?? []).map((m: any) => ({
    user_id: m.user_id,
    username: m.profile?.username ?? null,
    first_name: m.profile?.first_name ?? '',
    last_name: m.profile?.last_name ?? '',
  }))
}

export async function transferGroupOwnership(
  groupId: string,
  newOwnerId: string
): Promise<void> {
  await requireAdmin()
  const admin = getServiceClient()

  // Look up the current creator so we can remove them
  const { data: group } = await admin
    .from('groups')
    .select('creator_id')
    .eq('id', groupId)
    .single()

  // Ensure new owner is an active admin in group_members
  await admin
    .from('group_members')
    .upsert(
      { group_id: groupId, user_id: newOwnerId, role: 'admin', status: 'active' },
      { onConflict: 'group_id,user_id' }
    )

  // Remove the original creator from the group entirely
  if (group?.creator_id && group.creator_id !== newOwnerId) {
    await admin
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', group.creator_id)
  }

  // Transfer creator_id and reinstate the group
  await admin
    .from('groups')
    .update({ creator_id: newOwnerId, status: 'active', suspended_reason: null })
    .eq('id', groupId)
}

export async function reinstateUser(userId: string): Promise<void> {
  await requireAdmin()
  const admin = getServiceClient()
  await admin.from('profiles').update({
    status: 'active',
    suspension_reason: null,
    suspended_until: null,
    ban_reason: null,
  }).eq('id', userId)
}

export interface OnlineUser {
  id: string
  username: string | null
  first_name: string
  last_name: string
  profile_photo_url: string | null
  status: string
  role: string
  city: string | null
  state: string | null
  last_seen_at: string
}

export async function getOnlineUsers(): Promise<OnlineUser[]> {
  const admin = getServiceClient()
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data } = await admin
    .from('profiles')
    .select('id, username, first_name, last_name, profile_photo_url, status, role, city, state, last_seen_at')
    .gte('last_seen_at', fiveMinutesAgo)
    .order('last_seen_at', { ascending: false })
  return (data ?? []) as OnlineUser[]
}

export async function adminSendFriendRequest(targetUserId: string): Promise<void> {
  const adminId = await requireAdmin()
  if (adminId === targetUserId) throw new Error('Cannot friend yourself')
  const admin = getServiceClient()
  const { error } = await admin
    .from('friendships')
    .insert({ requester_id: adminId, addressee_id: targetUserId })
  if (error && error.code !== '23505') throw new Error(error.message)
  if (error) return // already exists
  await admin.from('notifications').insert({
    user_id: targetUserId,
    type: 'friend_request',
    actor_id: adminId,
  })
}

export interface RefSourceRow {
  label: string
  count: number
}

export async function getRefSources(): Promise<RefSourceRow[]> {
  const admin = getServiceClient()
  const { data } = await admin
    .from('profiles')
    .select('signup_ref_url')
    .not('signup_ref_url', 'is', null)

  // Normalize raw URLs/strings into human-readable labels
  function toLabel(raw: string): string {
    if (/facebook\.com/i.test(raw) || raw.startsWith('facebook /')) return 'Facebook'
    if (/instagram\.com/i.test(raw)) return 'Instagram'
    if (/google\.com/i.test(raw) || raw.startsWith('google /')) return 'Google'
    if (/bing\.com/i.test(raw) || raw.startsWith('bing /')) return 'Bing'
    if (/tiktok\.com/i.test(raw) || raw.startsWith('tiktok /')) return 'TikTok'
    if (/youtube\.com/i.test(raw) || raw.startsWith('youtube /')) return 'YouTube'
    if (/twitter\.com|x\.com/i.test(raw) || raw.startsWith('twitter /') || raw.startsWith('x /')) return 'X / Twitter'
    if (raw.startsWith('ref:')) return raw  // keep explicit ref: tags as-is
    // UTM format "source / medium / campaign" — use as-is
    if (raw.includes(' / ')) return raw
    // Full URL — extract hostname
    try { return new URL(raw).hostname.replace(/^www\./, '') } catch { return raw }
  }

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    const label = toLabel(row.signup_ref_url as string)
    counts[label] = (counts[label] ?? 0) + 1
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }))
}

// ─── Admin Messages ─────────────────────────────────────────────────────────

export interface AdminMessageRow {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  created_at: string
  sender: {
    id: string
    username: string | null
    first_name: string
    last_name: string
    profile_photo_url: string | null
    status: string
  } | null
  recipient: {
    id: string
    username: string | null
    first_name: string
    last_name: string
    profile_photo_url: string | null
  } | null
}

export async function getAdminMessages(
  page = 0,
  pageSize = 50,
): Promise<{ messages: AdminMessageRow[]; hasMore: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['moderator', 'admin', 'super_admin'].includes(profile.role)) throw new Error('Not authorized')

  const admin = getServiceClient()

  const { data } = await admin
    .from('messages')
    .select(`
      id, conversation_id, sender_id, content, created_at,
      sender:profiles!sender_id(id, username, first_name, last_name, profile_photo_url, status),
      conversation:conversations!conversation_id(
        participant1_id, participant2_id,
        p1:profiles!participant1_id(id, username, first_name, last_name, profile_photo_url),
        p2:profiles!participant2_id(id, username, first_name, last_name, profile_photo_url)
      )
    `)
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize) // fetch pageSize+1 to detect hasMore

  const rows = data ?? []
  const hasMore = rows.length > pageSize

  const messages: AdminMessageRow[] = rows.slice(0, pageSize).map((row: any) => {
    const convo = row.conversation
    let recipient = null
    if (convo) {
      recipient = row.sender_id === convo.participant1_id ? convo.p2 : convo.p1
    }
    return {
      id: row.id,
      conversation_id: row.conversation_id,
      sender_id: row.sender_id,
      content: row.content,
      created_at: row.created_at,
      sender: row.sender ?? null,
      recipient: recipient ?? null,
    }
  })

  return { messages, hasMore }
}

export async function setUserRole(userId: string, role: 'user' | 'moderator' | 'admin' | 'super_admin'): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') throw new Error('Only super admins can change roles')
  const admin = getServiceClient()
  await admin.from('profiles').update({ role }).eq('id', userId)
}
