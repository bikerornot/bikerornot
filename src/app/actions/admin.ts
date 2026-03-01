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
  newThisWeek: number
  newThisMonth: number
  pendingReports: number
  bannedUsers: number
  suspendedUsers: number
  flaggedUsers: number
  recentSignups: RecentSignup[]
  recentReports: RecentReport[]
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const admin = getServiceClient()

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { count: totalUsers },
    { count: newToday },
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
  date_of_birth: string | null
  post_count: number
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
  page = 1,
  pageSize = 25,
}: {
  search?: string
  status?: string
  page?: number
  pageSize?: number
} = {}): Promise<{ users: AdminUserRow[]; total: number; pageSize: number }> {
  const admin = getServiceClient()

  let query = admin
    .from('profiles')
    .select('id, username, first_name, last_name, created_at, status, role, city, state, profile_photo_url, signup_country, signup_region, signup_city, date_of_birth', { count: 'exact' })
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

  const { data, count } = await query

  const userIds = (data ?? []).map((u) => u.id)
  let postCountMap: Record<string, number> = {}
  if (userIds.length > 0) {
    const { data: postCounts } = await admin
      .from('posts')
      .select('author_id')
      .in('author_id', userIds)
      .is('deleted_at', null)
    for (const p of postCounts ?? []) {
      postCountMap[p.author_id] = (postCountMap[p.author_id] ?? 0) + 1
    }
  }

  return {
    users: (data ?? []).map((u) => ({
      ...u,
      post_count: postCountMap[u.id] ?? 0,
      risk_flags: computeRiskFlags(u),
    })) as AdminUserRow[],
    total: count ?? 0,
    pageSize,
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

  // Report counts
  const [{ count: profileReports }, { count: postReports }] = await Promise.all([
    admin.from('reports').select('*', { count: 'exact', head: true }).eq('reported_type', 'profile').eq('reported_id', userId),
    postIds.length > 0
      ? admin.from('reports').select('*', { count: 'exact', head: true }).eq('reported_type', 'post').in('reported_id', postIds)
      : Promise.resolve({ count: 0 }),
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

export async function setUserRole(userId: string, role: 'user' | 'moderator' | 'admin' | 'super_admin'): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'super_admin') throw new Error('Only super admins can change roles')
  const admin = getServiceClient()
  await admin.from('profiles').update({ role }).eq('id', userId)
}
