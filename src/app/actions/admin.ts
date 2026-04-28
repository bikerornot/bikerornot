'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { assertUuid } from '@/lib/rate-limit'
import { HIGH_RISK_COUNTRIES, computeRiskFlags } from '@/lib/risk'
import { computeScammerScore, type ScammerInput, type ScammerResult } from '@/lib/scammer-score'

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
  // Users
  totalUsers: number
  newToday: number
  newLast24h: number
  newThisWeek: number
  newThisMonth: number
  onboardingComplete: number
  // Engagement
  posts24h: number
  posts7d: number
  postsTotal: number
  comments24h: number
  comments7d: number
  commentsTotal: number
  messages24h: number
  messages7d: number
  messagesTotal: number
  likes24h: number
  likes7d: number
  likesTotal: number
  // Social
  friendRequestsTotal: number
  friendRequestsSent24h: number
  friendRequestsSent7d: number
  friendshipsFormed24h: number
  friendshipsFormed7d: number
  friendshipsTotal: number
  // Content
  photosUploaded24h: number
  photosUploaded7d: number
  bikesAdded24h: number
  bikesAdded7d: number
  bikesTotal: number
  groupsCreated7d: number
  groupsTotal: number
  // Safety
  pendingReports: number
  reports24h: number
  reports7d: number
  blocks24h: number
  blocks7d: number
  bannedUsers: number
  suspendedUsers: number
  flaggedUsers: number
  activeWomenUnder40: number
  // Activity feeds
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

  const c = (table: string, col = '*') => admin.from(table).select(col, { count: 'exact', head: true })

  const [
    // Users
    { count: totalUsers },
    { count: newToday },
    { count: newLast24h },
    { count: newThisWeek },
    { count: newThisMonth },
    { count: onboardingComplete },
    // Posts
    { count: postsTotal },
    { count: posts24h },
    { count: posts7d },
    // Comments
    { count: commentsTotal },
    { count: comments24h },
    { count: comments7d },
    // Messages
    { count: messagesTotal },
    { count: messages24h },
    { count: messages7d },
    // Likes
    { count: likesTotal },
    { count: likes24h },
    { count: likes7d },
    // Friendships
    { count: friendRequestsTotal },
    { count: friendRequestsSent24h },
    { count: friendRequestsSent7d },
    { count: friendshipsFormed24h },
    { count: friendshipsFormed7d },
    { count: friendshipsTotal },
    // Content
    { count: photosUploaded24h },
    { count: photosUploaded7d },
    { count: bikesAdded24h },
    { count: bikesAdded7d },
    { count: bikesTotal },
    { count: groupsCreated7d },
    { count: groupsTotal },
    // Safety
    { count: pendingReports },
    { count: reports24h },
    { count: reports7d },
    { count: blocks24h },
    { count: blocks7d },
    { count: bannedUsers },
    { count: suspendedUsers },
    { count: flaggedUsers },
    { count: activeWomenUnder40 },
    // Activity feeds
    { data: recentSignups },
    { data: recentReportsRaw },
  ] = await Promise.all([
    // Users
    c('profiles'),
    c('profiles').gte('created_at', todayStart),
    c('profiles').gte('created_at', last24h),
    c('profiles').gte('created_at', weekAgo),
    c('profiles').gte('created_at', monthAgo),
    c('profiles').eq('onboarding_complete', true),
    // Posts
    c('posts').is('deleted_at', null),
    c('posts').is('deleted_at', null).gte('created_at', last24h),
    c('posts').is('deleted_at', null).gte('created_at', weekAgo),
    // Comments
    c('comments').is('deleted_at', null),
    c('comments').is('deleted_at', null).gte('created_at', last24h),
    c('comments').is('deleted_at', null).gte('created_at', weekAgo),
    // Messages
    c('messages'),
    c('messages').gte('created_at', last24h),
    c('messages').gte('created_at', weekAgo),
    // Likes
    c('post_likes'),
    c('post_likes').gte('created_at', last24h),
    c('post_likes').gte('created_at', weekAgo),
    // Friendships
    c('friendships'),
    c('friendships').gte('created_at', last24h),
    c('friendships').gte('created_at', weekAgo),
    c('friendships').eq('status', 'accepted').gte('updated_at', last24h),
    c('friendships').eq('status', 'accepted').gte('updated_at', weekAgo),
    c('friendships').eq('status', 'accepted'),
    // Content
    c('post_images').gte('created_at', last24h),
    c('post_images').gte('created_at', weekAgo),
    c('user_bikes').gte('created_at', last24h),
    c('user_bikes').gte('created_at', weekAgo),
    c('user_bikes'),
    c('groups').gte('created_at', weekAgo),
    c('groups'),
    // Safety
    c('reports').eq('status', 'pending'),
    c('reports').gte('created_at', last24h),
    c('reports').gte('created_at', weekAgo),
    c('blocks').gte('created_at', last24h),
    c('blocks').gte('created_at', weekAgo),
    c('profiles').eq('status', 'banned'),
    c('profiles').eq('status', 'suspended'),
    c('profiles').in('signup_country', HIGH_RISK_COUNTRIES).eq('status', 'active'),
    // Active women under 40
    (() => {
      const cutoff = new Date()
      cutoff.setFullYear(cutoff.getFullYear() - 40)
      return c('profiles').eq('status', 'active').eq('gender', 'female').gte('date_of_birth', cutoff.toISOString().slice(0, 10))
    })(),
    // Activity feeds
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
    onboardingComplete: onboardingComplete ?? 0,
    postsTotal: postsTotal ?? 0,
    posts24h: posts24h ?? 0,
    posts7d: posts7d ?? 0,
    commentsTotal: commentsTotal ?? 0,
    comments24h: comments24h ?? 0,
    comments7d: comments7d ?? 0,
    messagesTotal: messagesTotal ?? 0,
    messages24h: messages24h ?? 0,
    messages7d: messages7d ?? 0,
    likesTotal: likesTotal ?? 0,
    likes24h: likes24h ?? 0,
    likes7d: likes7d ?? 0,
    friendRequestsTotal: friendRequestsTotal ?? 0,
    friendRequestsSent24h: friendRequestsSent24h ?? 0,
    friendRequestsSent7d: friendRequestsSent7d ?? 0,
    friendshipsFormed24h: friendshipsFormed24h ?? 0,
    friendshipsFormed7d: friendshipsFormed7d ?? 0,
    friendshipsTotal: friendshipsTotal ?? 0,
    photosUploaded24h: photosUploaded24h ?? 0,
    photosUploaded7d: photosUploaded7d ?? 0,
    bikesAdded24h: bikesAdded24h ?? 0,
    bikesAdded7d: bikesAdded7d ?? 0,
    bikesTotal: bikesTotal ?? 0,
    groupsCreated7d: groupsCreated7d ?? 0,
    groupsTotal: groupsTotal ?? 0,
    pendingReports: pendingReports ?? 0,
    reports24h: reports24h ?? 0,
    reports7d: reports7d ?? 0,
    blocks24h: blocks24h ?? 0,
    blocks7d: blocks7d ?? 0,
    bannedUsers: bannedUsers ?? 0,
    suspendedUsers: suspendedUsers ?? 0,
    flaggedUsers: flaggedUsers ?? 0,
    activeWomenUnder40: activeWomenUnder40 ?? 0,
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
  deactivated_at: string | null
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
  friend_requests_sent: number
  phone_verified_at: string | null
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
  deactivated_at: string | null
  role: string
  profile_photo_url: string | null
  avatar_reviewed_at: string | null
  gender: string | null
  signup_ip: string | null
  signup_country: string | null
  signup_region: string | null
  signup_city: string | null
  signup_ref_url: string | null
  suspension_reason: string | null
  suspended_until: string | null
  ban_reason: string | null
  phone_number: string | null
  phone_verified_at: string | null
  phone_verification_required: boolean
  avatar_web_detection: {
    matchCount: number
    topMatches: Array<{ url: string; pageTitle: string | null; score: number | null }>
    bestGuess: string | null
    isSuspicious: boolean
    checkedAt: string
  } | null
  post_count: number
  message_count: number
  comment_count: number
  friend_count: number
  friend_requests_sent: number
  friend_requests_received: number
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
  // One entry per conversation the user is in (deduped by conversation_id),
  // not one per individual message. Lets the admin UI render a chat-list
  // style summary instead of repeating the same recipient over and over.
  recent_messages: Array<{
    conversation_id: string
    recipient_username: string | null
    message_count: number
    last_at: string
    last_preview: string
  }>
  recent_comments: Array<{
    id: string
    content: string
    created_at: string
    post_id: string
    post_author_username: string | null
  }>
  bikes: Array<{
    id: string
    year: number | null
    make: string | null
    model: string | null
    description: string | null
    photo_url: string | null
    photo_count: number
    created_at: string
  }>
}

export async function getUsers({
  search = '',
  status = '',
  gender = '',
  maxAge = 0,
  page = 1,
  pageSize = 25,
}: {
  search?: string
  status?: string
  gender?: string
  maxAge?: number
  page?: number
  pageSize?: number
} = {}): Promise<{ users: AdminUserRow[]; total: number; pageSize: number }> {
  const admin = getServiceClient()

  let query = admin
    .from('profiles')
    .select('id, username, first_name, last_name, created_at, status, deactivated_at, role, city, state, profile_photo_url, signup_country, signup_region, signup_city, signup_ref_url, date_of_birth, gender, phone_verified_at', { count: 'exact' })
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
  if (maxAge > 0) {
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - maxAge)
    query = query.gte('date_of_birth', cutoff.toISOString().slice(0, 10)) as typeof query
  }

  const { data, count } = await query

  const userIds = (data ?? []).map((u) => u.id)
  let postCountMap: Record<string, number> = {}
  let messageCountMap: Record<string, number> = {}
  let commentCountMap: Record<string, number> = {}
  let friendRequestCountMap: Record<string, number> = {}
  if (userIds.length > 0) {
    const [{ data: counts }, { data: friendRequests }] = await Promise.all([
      admin.rpc('get_user_activity_counts', { user_ids: userIds }),
      admin.from('friendships').select('requester_id').in('requester_id', userIds),
    ])
    for (const row of counts ?? []) {
      postCountMap[row.user_id] = Number(row.post_count)
      messageCountMap[row.user_id] = Number(row.message_count)
      commentCountMap[row.user_id] = Number(row.comment_count)
    }
    for (const row of friendRequests ?? []) {
      friendRequestCountMap[row.requester_id] = (friendRequestCountMap[row.requester_id] ?? 0) + 1
    }
  }

  return {
    users: (data ?? []).map((u) => ({
      ...u,
      post_count: postCountMap[u.id] ?? 0,
      message_count: messageCountMap[u.id] ?? 0,
      comment_count: commentCountMap[u.id] ?? 0,
      friend_requests_sent: friendRequestCountMap[u.id] ?? 0,
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

  // Pull every message this user has sent so we can group by conversation.
  // Bounded to 1000 rows so the page doesn't choke on a chat-bot account
  // with thousands of outbound messages — anything past that is rarely
  // useful for moderation review anyway.
  const { data: rawMessages } = await admin
    .from('messages')
    .select('id, content, created_at, conversation_id')
    .eq('sender_id', userId)
    .order('created_at', { ascending: false })
    .limit(1000)

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

  // Report / message / comment / friend request counts
  const [{ count: profileReports }, { count: postReports }, { count: totalMessages }, { count: totalComments }, { count: frSent }, { count: frReceived }, { count: friendsAsReq }, { count: friendsAsAddr }] = await Promise.all([
    admin.from('reports').select('*', { count: 'exact', head: true }).eq('reported_type', 'profile').eq('reported_id', userId),
    postIds.length > 0
      ? admin.from('reports').select('*', { count: 'exact', head: true }).eq('reported_type', 'post').in('reported_id', postIds)
      : Promise.resolve({ count: 0 }),
    admin.from('messages').select('*', { count: 'exact', head: true }).eq('sender_id', userId),
    admin.from('comments').select('*', { count: 'exact', head: true }).eq('author_id', userId).is('deleted_at', null),
    admin.from('friendships').select('*', { count: 'exact', head: true }).eq('requester_id', userId),
    admin.from('friendships').select('*', { count: 'exact', head: true }).eq('addressee_id', userId),
    admin.from('friendships').select('*', { count: 'exact', head: true }).eq('requester_id', userId).eq('status', 'accepted'),
    admin.from('friendships').select('*', { count: 'exact', head: true }).eq('addressee_id', userId).eq('status', 'accepted'),
  ])

  // Recent comments by this user
  const { data: recentComments } = await admin
    .from('comments')
    .select('id, content, created_at, post_id')
    .eq('author_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50)

  // Fetch post author usernames for comments
  const commentPostIds = [...new Set((recentComments ?? []).map((c) => c.post_id))]
  let commentPostAuthorMap: Record<string, string | null> = {}
  if (commentPostIds.length > 0) {
    const { data: commentPosts } = await admin
      .from('posts')
      .select('id, author:profiles!author_id(username)')
      .in('id', commentPostIds)
    for (const p of commentPosts ?? []) {
      commentPostAuthorMap[p.id] = (p.author as any)?.username ?? null
    }
  }

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
    deactivated_at: profile.deactivated_at ?? null,
    role: profile.role,
    profile_photo_url: profile.profile_photo_url,
    avatar_reviewed_at: profile.avatar_reviewed_at ?? null,
    gender: profile.gender ?? null,
    signup_ip: profile.signup_ip ?? null,
    signup_country: profile.signup_country ?? null,
    signup_region: profile.signup_region ?? null,
    signup_city: profile.signup_city ?? null,
    signup_ref_url: profile.signup_ref_url ?? null,
    suspension_reason: profile.suspension_reason ?? null,
    suspended_until: profile.suspended_until ?? null,
    ban_reason: profile.ban_reason ?? null,
    phone_number: profile.phone_number ?? null,
    phone_verified_at: profile.phone_verified_at ?? null,
    phone_verification_required: profile.phone_verification_required ?? false,
    avatar_web_detection: profile.avatar_web_detection ?? null,
    post_count: (posts ?? []).length,
    message_count: totalMessages ?? 0,
    comment_count: totalComments ?? 0,
    friend_count: (friendsAsReq ?? 0) + (friendsAsAddr ?? 0),
    friend_requests_sent: frSent ?? 0,
    friend_requests_received: frReceived ?? 0,
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
    // Aggregate sent messages by conversation: count how many the user sent
    // to that recipient, plus the latest message for the chat-list preview.
    // Sorted by recency so the freshest conversation is on top.
    recent_messages: (() => {
      const map = new Map<string, { conversation_id: string; recipient_username: string | null; message_count: number; last_at: string; last_preview: string }>()
      for (const m of rawMessages ?? []) {
        const existing = map.get(m.conversation_id)
        if (!existing) {
          map.set(m.conversation_id, {
            conversation_id: m.conversation_id,
            recipient_username: recipientMap[m.conversation_id] ?? null,
            message_count: 1,
            last_at: m.created_at,
            last_preview: (m.content ?? '').slice(0, 200),
          })
        } else {
          existing.message_count++
          if (m.created_at > existing.last_at) {
            existing.last_at = m.created_at
            existing.last_preview = (m.content ?? '').slice(0, 200)
          }
        }
      }
      return Array.from(map.values())
        .sort((a, b) => b.last_at.localeCompare(a.last_at))
        .slice(0, 50)
    })(),
    recent_comments: (recentComments ?? []).map((c) => ({
      id: c.id,
      content: c.content,
      created_at: c.created_at,
      post_id: c.post_id,
      post_author_username: commentPostAuthorMap[c.post_id] ?? null,
    })),
    bikes: await (async () => {
      const { data: rawBikes } = await admin
        .from('user_bikes')
        .select('id, year, make, model, description, photo_url, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      const list = (rawBikes ?? []) as any[]
      if (list.length === 0) return []
      const ids = list.map((b) => b.id)
      const { data: photoCounts } = await admin
        .from('bike_photos')
        .select('bike_id')
        .in('bike_id', ids)
      const countMap: Record<string, number> = {}
      for (const r of photoCounts ?? []) countMap[r.bike_id] = (countMap[r.bike_id] ?? 0) + 1
      return list.map((b) => ({
        id: b.id,
        year: b.year ?? null,
        make: b.make ?? null,
        model: b.model ?? null,
        description: b.description ?? null,
        photo_url: b.photo_url ?? null,
        photo_count: countMap[b.id] ?? 0,
        created_at: b.created_at,
      }))
    })(),
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
  const { error } = await admin.from('profiles').update({
    status: 'active',
    suspension_reason: null,
    suspended_until: null,
    ban_reason: null,
  }).eq('id', userId)

  if (error) throw new Error(`Failed to reinstate user: ${error.message}`)

  // Clean up orphaned pending friend requests sent while banned/suspended.
  // Delete outbound pending requests so the user can re-send them fresh,
  // since recipients couldn't see requests from a non-active profile.
  await admin
    .from('friendships')
    .delete()
    .eq('requester_id', userId)
    .eq('status', 'pending')
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
  gender: string | null
  date_of_birth: string | null
  phone_verified_at: string | null
  created_at: string
  last_seen_at: string
}

export async function getOnlineUsers(): Promise<OnlineUser[]> {
  const admin = getServiceClient()
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data } = await admin
    .from('profiles')
    .select('id, username, first_name, last_name, profile_photo_url, status, role, city, state, gender, date_of_birth, phone_verified_at, created_at, last_seen_at')
    .eq('status', 'active')
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

export interface AdminThreadMessage {
  id: string
  sender_id: string
  content: string
  created_at: string
  sender_name: string
  sender_username: string | null
}

export async function getConversationThread(
  conversationId: string,
  limit = 50,
): Promise<AdminThreadMessage[]> {
  await requireAdmin()
  const admin = getServiceClient()

  const { data } = await admin
    .from('messages')
    .select('id, sender_id, content, created_at, sender:profiles!sender_id(first_name, last_name, username)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!data) return []

  return data.reverse().map((row: any) => ({
    id: row.id,
    sender_id: row.sender_id,
    content: row.content,
    created_at: row.created_at,
    sender_name: row.sender ? `${row.sender.first_name} ${row.sender.last_name}` : 'Unknown',
    sender_username: row.sender?.username ?? null,
  }))
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

// ─── Scammer Analysis ────────────────────────────────────────────────────────

export interface ScammerAnalysis {
  profile: AdminUserDetail
  result: ScammerResult
}

export async function getScammerAnalysis(userId: string): Promise<ScammerAnalysis | null> {
  await requireAdmin()
  assertUuid(userId, 'userId')
  const admin = getServiceClient()

  // Parallel fetch all data
  const [
    profile,
    { data: sentMessages },
    { count: receivedCount },
    { data: conversations },
    { data: frSent },
    { count: frReceivedCount },
    { count: reportsAgainst },
    { count: blocksAgainst },
    { count: contentFlags },
  ] = await Promise.all([
    getUserDetail(userId),
    admin
      .from('messages')
      .select('id, content, created_at, conversation_id')
      .eq('sender_id', userId)
      .order('created_at', { ascending: false })
      .limit(500),
    admin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .neq('sender_id', userId)
      .in('conversation_id',
        // subquery: all conversations this user is in
        // We'll resolve this after
        [],
      ),
    admin
      .from('conversations')
      .select('id, participant1_id, participant2_id, created_at')
      .or(`participant1_id.eq.${userId},participant2_id.eq.${userId}`),
    admin
      .from('friendships')
      .select('created_at, status')
      .eq('requester_id', userId),
    admin
      .from('friendships')
      .select('*', { count: 'exact', head: true })
      .eq('addressee_id', userId),
    admin
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('reported_type', 'profile')
      .eq('reported_id', userId),
    admin
      .from('blocks')
      .select('*', { count: 'exact', head: true })
      .eq('blocked_id', userId),
    admin
      .from('content_flags')
      .select('*', { count: 'exact', head: true })
      .eq('sender_id', userId),
  ])

  if (!profile) return null

  // Now get received messages count using actual conversation IDs
  const convIds = (conversations ?? []).map((c) => c.id)
  let actualReceivedCount = receivedCount ?? 0
  if (convIds.length > 0) {
    const { count } = await admin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .neq('sender_id', userId)
      .in('conversation_id', convIds)
    actualReceivedCount = count ?? 0
  }

  // Map messages to include recipient IDs
  const convMap = new Map<string, { participant1_id: string; participant2_id: string }>()
  for (const c of conversations ?? []) {
    convMap.set(c.id, { participant1_id: c.participant1_id, participant2_id: c.participant2_id })
  }

  const messagesSent = (sentMessages ?? []).map((m) => {
    const conv = convMap.get(m.conversation_id)
    const recipientId = conv
      ? (conv.participant1_id === userId ? conv.participant2_id : conv.participant1_id)
      : null
    return { content: m.content, created_at: m.created_at, recipient_id: recipientId }
  })

  // Determine which conversations the user initiated (sent the first message)
  // For simplicity, count conversations where the first message in our data is from the user
  const firstMessageByConv = new Map<string, string>()
  // sentMessages is sorted desc, so iterate in reverse for chronological order
  for (let i = (sentMessages ?? []).length - 1; i >= 0; i--) {
    const m = sentMessages![i]
    if (!firstMessageByConv.has(m.conversation_id)) {
      firstMessageByConv.set(m.conversation_id, m.conversation_id)
    }
  }
  // A user "initiated" if they appear to have sent the first message we have
  const conversationsInitiated = firstMessageByConv.size

  const accountAgeDays = Math.max(
    1,
    Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)),
  )

  const input: ScammerInput = {
    accountAgeDays,
    bio: profile.bio,
    ridingStyle: null, // not in AdminUserDetail, treated as null
    postCount: profile.post_count,
    commentCount: profile.comment_count,
    profileCity: profile.city,
    profileState: profile.state,
    signupCountry: profile.signup_country,
    signupCity: profile.signup_city,
    messagesSent,
    messagesReceivedCount: actualReceivedCount,
    conversationsInitiated,
    conversationsTotal: convIds.length,
    friendRequestsSent: (frSent ?? []).map((f) => ({
      created_at: f.created_at,
      status: f.status,
    })),
    friendRequestsReceivedCount: frReceivedCount ?? 0,
    reportsAgainstCount: reportsAgainst ?? 0,
    blocksAgainstCount: blocksAgainst ?? 0,
    contentFlagsCount: contentFlags ?? 0,
  }

  const result = computeScammerScore(input)

  return { profile, result }
}

export interface AdminSearchResult {
  id: string
  username: string | null
  first_name: string
  last_name: string
  profile_photo_url: string | null
}

export async function searchUsersForAdmin(query: string): Promise<AdminSearchResult[]> {
  await requireAdmin()
  const admin = getServiceClient()
  const term = query.replace(/^@/, '').trim()
  if (!term) return []

  const { data } = await admin
    .from('profiles')
    .select('id, username, first_name, last_name, profile_photo_url')
    .or(`username.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`)
    .limit(10)

  return (data ?? []) as AdminSearchResult[]
}

// ── Watchlist ──

export interface WatchlistEntry {
  id: string
  user_id: string
  added_by: string
  note: string | null
  created_at: string
  user?: {
    id: string
    username: string | null
    first_name: string
    last_name: string
    profile_photo_url: string | null
    status: string
  }
  activity?: {
    message_count: number
    friend_requests_sent: number
    content_flags: number
    reports_against: number
  }
}

export async function getWatchlist(): Promise<WatchlistEntry[]> {
  await requireAdmin()
  const admin = getServiceClient()

  const { data } = await admin
    .from('admin_watchlist')
    .select('*, user:profiles!user_id(id, username, first_name, last_name, profile_photo_url, status)')
    .order('created_at', { ascending: false })

  if (!data || data.length === 0) return []

  // Exclude banned users — they no longer need monitoring
  const filtered = data.filter((w: any) => w.user?.status !== 'banned')
  if (filtered.length === 0) return []

  // Fetch activity stats for each watched user
  const userIds = filtered.map((w: any) => w.user_id)

  const [{ data: msgCounts }, { data: frCounts }, { data: flagCounts }, { data: reportCounts }] = await Promise.all([
    admin.from('messages').select('sender_id').in('sender_id', userIds),
    admin.from('friendships').select('requester_id').in('requester_id', userIds),
    admin.from('content_flags').select('sender_id').in('sender_id', userIds).eq('status', 'pending'),
    admin.from('reports').select('reported_user_id').in('reported_user_id', userIds),
  ])

  const msgMap: Record<string, number> = {}
  for (const m of msgCounts ?? []) msgMap[m.sender_id] = (msgMap[m.sender_id] ?? 0) + 1
  const frMap: Record<string, number> = {}
  for (const f of frCounts ?? []) frMap[f.requester_id] = (frMap[f.requester_id] ?? 0) + 1
  const flagMap: Record<string, number> = {}
  for (const f of flagCounts ?? []) flagMap[f.sender_id] = (flagMap[f.sender_id] ?? 0) + 1
  const reportMap: Record<string, number> = {}
  for (const r of reportCounts ?? []) reportMap[r.reported_user_id] = (reportMap[r.reported_user_id] ?? 0) + 1

  return filtered.map((w: any) => ({
    ...w,
    activity: {
      message_count: msgMap[w.user_id] ?? 0,
      friend_requests_sent: frMap[w.user_id] ?? 0,
      content_flags: flagMap[w.user_id] ?? 0,
      reports_against: reportMap[w.user_id] ?? 0,
    },
  })) as WatchlistEntry[]
}

export async function addToWatchlist(userId: string, note: string): Promise<void> {
  const adminId = await requireAdmin()
  const admin = getServiceClient()

  const { error } = await admin
    .from('admin_watchlist')
    .insert({ user_id: userId, added_by: adminId, note: note.trim() || null })

  if (error && error.code === '23505') throw new Error('User is already on the watchlist')
  if (error) throw new Error(error.message)
}

export async function removeFromWatchlist(userId: string): Promise<void> {
  await requireAdmin()
  const admin = getServiceClient()

  const { error } = await admin
    .from('admin_watchlist')
    .delete()
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
}

export async function isOnWatchlist(userId: string): Promise<{ onWatchlist: boolean; note: string | null }> {
  await requireAdmin()
  const admin = getServiceClient()

  const { data } = await admin
    .from('admin_watchlist')
    .select('note')
    .eq('user_id', userId)
    .maybeSingle()

  return { onWatchlist: !!data, note: data?.note ?? null }
}

export async function getWatchlistCount(): Promise<number> {
  await requireAdmin()
  const admin = getServiceClient()
  // Get all watchlist user IDs, then exclude banned
  const { data } = await admin
    .from('admin_watchlist')
    .select('user_id, user:profiles!user_id(status)')
  return (data ?? []).filter((w: any) => w.user?.status !== 'banned').length
}

// ── Growth Analytics ──

// Helper: fetch all banned user IDs into a Set for fast lookups
async function getBannedUserIds(admin: ReturnType<typeof getServiceClient>): Promise<Set<string>> {
  const ids = new Set<string>()
  let offset = 0
  const PAGE_SIZE = 1000
  while (true) {
    const { data } = await admin
      .from('profiles')
      .select('id')
      .eq('status', 'banned')
      .range(offset, offset + PAGE_SIZE - 1)
    if (!data || data.length === 0) break
    for (const row of data) ids.add(row.id)
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return ids
}

export interface DailyMemberCount {
  date: string    // YYYY-MM-DD
  total: number   // cumulative total at end of day
  verifiedTotal: number // cumulative verified users at end of day
  newSignups: number // signups that day
  organicSignups: number // signups excluding banned users
  floridaSignups: number // signups from Florida
}

export async function getDailyMemberCounts(
  startDate: string,
  endDate: string,
): Promise<DailyMemberCount[]> {
  await requireAdmin()
  const admin = getServiceClient()

  const bannedIds = await getBannedUserIds(admin)

  // Get total users before startDate (the baseline)
  const [{ count: baseline }, { count: verifiedBaseline }] = await Promise.all([
    admin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', `${startDate}T00:00:00Z`),
    admin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .not('phone_verified_at', 'is', null)
      .lt('phone_verified_at', `${startDate}T00:00:00Z`),
  ])

  // Get daily signup counts using Supabase RPC or paginated fetch
  // Default select limit is 1000 rows, so we paginate to get all signups
  const dailyMap: Record<string, number> = {}
  const organicMap: Record<string, number> = {}
  const floridaMap: Record<string, number> = {}
  let offset = 0
  const PAGE_SIZE = 1000
  while (true) {
    const { data: page } = await admin
      .from('profiles')
      .select('id, created_at, state')
      .gte('created_at', `${startDate}T00:00:00Z`)
      .lte('created_at', `${endDate}T23:59:59Z`)
      .order('created_at')
      .range(offset, offset + PAGE_SIZE - 1)

    if (!page || page.length === 0) break

    for (const row of page) {
      const day = row.created_at.slice(0, 10)
      dailyMap[day] = (dailyMap[day] ?? 0) + 1
      if (!bannedIds.has(row.id)) {
        organicMap[day] = (organicMap[day] ?? 0) + 1
      }
      if (row.state === 'FL') {
        floridaMap[day] = (floridaMap[day] ?? 0) + 1
      }
    }

    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  // Get daily verified counts (by phone_verified_at date)
  const verifiedMap: Record<string, number> = {}
  let vOffset = 0
  while (true) {
    const { data: vPage } = await admin
      .from('profiles')
      .select('phone_verified_at')
      .not('phone_verified_at', 'is', null)
      .gte('phone_verified_at', `${startDate}T00:00:00Z`)
      .lte('phone_verified_at', `${endDate}T23:59:59Z`)
      .order('phone_verified_at')
      .range(vOffset, vOffset + PAGE_SIZE - 1)

    if (!vPage || vPage.length === 0) break

    for (const row of vPage) {
      const day = row.phone_verified_at!.slice(0, 10)
      verifiedMap[day] = (verifiedMap[day] ?? 0) + 1
    }

    if (vPage.length < PAGE_SIZE) break
    vOffset += PAGE_SIZE
  }

  // Build cumulative array for every day in range
  const result: DailyMemberCount[] = []
  let running = baseline ?? 0
  let runningVerified = verifiedBaseline ?? 0
  const current = new Date(startDate + 'T00:00:00Z')
  const end = new Date(endDate + 'T00:00:00Z')

  while (current <= end) {
    const day = current.toISOString().slice(0, 10)
    const newSignups = dailyMap[day] ?? 0
    const organicSignups = organicMap[day] ?? 0
    const floridaSignups = floridaMap[day] ?? 0
    const newVerified = verifiedMap[day] ?? 0
    running += newSignups
    runningVerified += newVerified
    result.push({ date: day, total: running, verifiedTotal: runningVerified, newSignups, organicSignups, floridaSignups })
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return result
}

// ── Daily Post Counts ──

export interface DailyPostCount {
  date: string
  count: number
  organic: number
}

export async function getDailyPostCounts(
  startDate: string,
  endDate: string,
): Promise<DailyPostCount[]> {
  await requireAdmin()
  const admin = getServiceClient()

  const bannedIds = await getBannedUserIds(admin)

  const dailyMap: Record<string, number> = {}
  const organicMap: Record<string, number> = {}
  let offset = 0
  const PAGE_SIZE = 1000
  while (true) {
    const { data: page } = await admin
      .from('posts')
      .select('created_at, author_id')
      .is('deleted_at', null)
      .gte('created_at', `${startDate}T00:00:00Z`)
      .lte('created_at', `${endDate}T23:59:59Z`)
      .order('created_at')
      .range(offset, offset + PAGE_SIZE - 1)

    if (!page || page.length === 0) break

    for (const row of page) {
      const day = row.created_at.slice(0, 10)
      dailyMap[day] = (dailyMap[day] ?? 0) + 1
      if (!bannedIds.has(row.author_id)) {
        organicMap[day] = (organicMap[day] ?? 0) + 1
      }
    }

    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  const result: DailyPostCount[] = []
  const current = new Date(startDate + 'T00:00:00Z')
  const end = new Date(endDate + 'T00:00:00Z')

  while (current <= end) {
    const day = current.toISOString().slice(0, 10)
    result.push({ date: day, count: dailyMap[day] ?? 0, organic: organicMap[day] ?? 0 })
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return result
}

// ── Daily Friend Request Counts ──

export interface DailyFriendRequestCount {
  date: string
  count: number
  organic: number
}

export async function getDailyFriendRequestCounts(
  startDate: string,
  endDate: string,
): Promise<DailyFriendRequestCount[]> {
  await requireAdmin()
  const admin = getServiceClient()

  const bannedIds = await getBannedUserIds(admin)

  const dailyMap: Record<string, number> = {}
  const organicMap: Record<string, number> = {}
  let offset = 0
  const PAGE_SIZE = 1000
  while (true) {
    const { data: page } = await admin
      .from('friendships')
      .select('created_at, requester_id')
      .gte('created_at', `${startDate}T00:00:00Z`)
      .lte('created_at', `${endDate}T23:59:59Z`)
      .order('created_at')
      .range(offset, offset + PAGE_SIZE - 1)

    if (!page || page.length === 0) break

    for (const row of page) {
      const day = row.created_at.slice(0, 10)
      dailyMap[day] = (dailyMap[day] ?? 0) + 1
      if (!bannedIds.has(row.requester_id)) {
        organicMap[day] = (organicMap[day] ?? 0) + 1
      }
    }

    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  const result: DailyFriendRequestCount[] = []
  const current = new Date(startDate + 'T00:00:00Z')
  const end = new Date(endDate + 'T00:00:00Z')

  while (current <= end) {
    const day = current.toISOString().slice(0, 10)
    result.push({ date: day, count: dailyMap[day] ?? 0, organic: organicMap[day] ?? 0 })
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return result
}

// ── Daily Message Counts ──

export interface DailyMessageCount {
  date: string
  count: number
  organic: number
}

export async function getDailyMessageCounts(
  startDate: string,
  endDate: string,
): Promise<DailyMessageCount[]> {
  await requireAdmin()
  const admin = getServiceClient()

  const bannedIds = await getBannedUserIds(admin)

  const dailyMap: Record<string, number> = {}
  const organicMap: Record<string, number> = {}
  let offset = 0
  const PAGE_SIZE = 1000
  while (true) {
    const { data: page } = await admin
      .from('messages')
      .select('created_at, sender_id')
      .gte('created_at', `${startDate}T00:00:00Z`)
      .lte('created_at', `${endDate}T23:59:59Z`)
      .order('created_at')
      .range(offset, offset + PAGE_SIZE - 1)

    if (!page || page.length === 0) break

    for (const row of page) {
      const day = row.created_at.slice(0, 10)
      dailyMap[day] = (dailyMap[day] ?? 0) + 1
      if (!bannedIds.has(row.sender_id)) {
        organicMap[day] = (organicMap[day] ?? 0) + 1
      }
    }

    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  const result: DailyMessageCount[] = []
  const current = new Date(startDate + 'T00:00:00Z')
  const end = new Date(endDate + 'T00:00:00Z')

  while (current <= end) {
    const day = current.toISOString().slice(0, 10)
    result.push({ date: day, count: dailyMap[day] ?? 0, organic: organicMap[day] ?? 0 })
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return result
}

// ── Daily Comment Counts ──

export interface DailyCommentCount {
  date: string
  count: number
  organic: number
}

export async function getDailyCommentCounts(
  startDate: string,
  endDate: string,
): Promise<DailyCommentCount[]> {
  await requireAdmin()
  const admin = getServiceClient()

  const bannedIds = await getBannedUserIds(admin)

  const dailyMap: Record<string, number> = {}
  const organicMap: Record<string, number> = {}
  let offset = 0
  const PAGE_SIZE = 1000
  while (true) {
    const { data: page } = await admin
      .from('comments')
      .select('created_at, author_id')
      .is('deleted_at', null)
      .gte('created_at', `${startDate}T00:00:00Z`)
      .lte('created_at', `${endDate}T23:59:59Z`)
      .order('created_at')
      .range(offset, offset + PAGE_SIZE - 1)

    if (!page || page.length === 0) break

    for (const row of page) {
      const day = row.created_at.slice(0, 10)
      dailyMap[day] = (dailyMap[day] ?? 0) + 1
      if (!bannedIds.has(row.author_id)) {
        organicMap[day] = (organicMap[day] ?? 0) + 1
      }
    }

    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  const result: DailyCommentCount[] = []
  const current = new Date(startDate + 'T00:00:00Z')
  const end = new Date(endDate + 'T00:00:00Z')

  while (current <= end) {
    const day = current.toISOString().slice(0, 10)
    result.push({ date: day, count: dailyMap[day] ?? 0, organic: organicMap[day] ?? 0 })
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return result
}

// ─── Safety Center Overview ────────────────────────────────

export interface SafetyOverview {
  bannedToday: number
  bannedThisWeek: number
  pendingReports: number
  pendingFlags: number
  watchlistCount: number
  autoBansThisWeek: number
  recentAutoBans: { id: string; username: string | null; ban_reason: string | null; updated_at: string }[]
  highScoreFlags: { id: string; sender_id: string; sender_username: string | null; score: number; content: string; flag_type: string; created_at: string }[]
  hotReports: { reported_type: string; target_id: string; reporter_count: number; reason: string }[]
  highRiskSignups: { id: string; username: string | null; first_name: string; last_name: string; gender: string | null; created_at: string; country: string | null; profile_photo_url: string | null; date_of_birth: string | null }[]
  recentBans: { id: string; username: string | null; ban_reason: string | null; updated_at: string; status: string }[]
}

export async function getSafetyOverview(): Promise<SafetyOverview> {
  await requireAdmin()
  const admin = getServiceClient()

  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString()
  const dayAgo = new Date(now.getTime() - 86400000).toISOString()

  const [
    { count: bannedToday },
    { count: bannedThisWeek },
    { count: pendingReports },
    { count: pendingFlags },
    { count: watchlistCount },
    { count: autoBansThisWeek },
    { data: recentAutoBans },
    { data: highScoreFlags },
    { data: hotReportsRaw },
    { data: highRiskSignups },
    { data: recentBans },
  ] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true })
      .eq('status', 'banned').gte('updated_at', todayStart.toISOString()),
    admin.from('profiles').select('*', { count: 'exact', head: true })
      .eq('status', 'banned').gte('updated_at', weekAgo),
    admin.from('content_reports').select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    admin.from('content_flags').select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    admin.from('admin_watchlist').select('*', { count: 'exact', head: true }),
    admin.from('profiles').select('*', { count: 'exact', head: true })
      .eq('status', 'banned').ilike('ban_reason', '%auto%').gte('updated_at', weekAgo),
    admin.from('profiles')
      .select('id, username, ban_reason, updated_at')
      .eq('status', 'banned').ilike('ban_reason', '%auto%')
      .gte('updated_at', dayAgo)
      .order('updated_at', { ascending: false }).limit(10),
    admin.from('content_flags')
      .select('id, sender_id, content, score, flag_type, created_at, sender:profiles!sender_id(username)')
      .eq('status', 'pending').gte('score', 0.7)
      .order('score', { ascending: false }).limit(10),
    admin.from('content_reports')
      .select('reported_type, target_id, reason')
      .eq('status', 'pending'),
    admin.from('profiles')
      .select('id, username, first_name, last_name, gender, created_at, country, profile_photo_url, date_of_birth')
      .eq('status', 'active').eq('onboarding_complete', true)
      .gte('created_at', dayAgo)
      .is('phone_verified_at', null)
      .eq('gender', 'female')
      .order('created_at', { ascending: false }).limit(20),
    admin.from('profiles')
      .select('id, username, ban_reason, updated_at, status')
      .eq('status', 'banned')
      .order('updated_at', { ascending: false }).limit(10),
  ])

  const reportMap: Record<string, { reported_type: string; target_id: string; count: number; reason: string }> = {}
  for (const r of hotReportsRaw ?? []) {
    const key = `${r.reported_type}:${r.target_id}`
    if (!reportMap[key]) reportMap[key] = { reported_type: r.reported_type, target_id: r.target_id, count: 0, reason: r.reason }
    reportMap[key].count++
  }
  const hotReports = Object.values(reportMap).filter((r) => r.count >= 2).sort((a, b) => b.count - a.count).slice(0, 10)

  const riskSignups = (highRiskSignups ?? []).filter((p: any) => {
    if (!p.date_of_birth) return true
    const age = (Date.now() - new Date(p.date_of_birth).getTime()) / (365.25 * 86400000)
    return age < 35
  }).slice(0, 10)

  return {
    bannedToday: bannedToday ?? 0,
    bannedThisWeek: bannedThisWeek ?? 0,
    pendingReports: pendingReports ?? 0,
    pendingFlags: pendingFlags ?? 0,
    watchlistCount: watchlistCount ?? 0,
    autoBansThisWeek: autoBansThisWeek ?? 0,
    recentAutoBans: (recentAutoBans ?? []) as any,
    highScoreFlags: (highScoreFlags ?? []).map((f: any) => ({
      ...f, sender_username: f.sender?.username ?? null,
    })),
    hotReports: hotReports.map((r) => ({ ...r, reporter_count: r.count })),
    highRiskSignups: riskSignups as any,
    recentBans: (recentBans ?? []) as any,
  }
}

// Bundle for the admin user detail UI — used both on
// /admin/users/[id] and inline in the report queue. Combines everything
// we need to render UserDetailView so callers don't have to sequence
// three separate actions.
export interface AdminUserProfileBundle {
  user: AdminUserDetail
  createdGroups: AdminGroupRow[]
  onWatchlist: boolean
  watchlistNote: string | null
  isSuperAdmin: boolean
  friendshipStatus: 'none' | 'pending_sent' | 'pending_received' | 'accepted'
}

export async function getAdminUserProfileBundle(
  userId: string,
): Promise<AdminUserProfileBundle | null> {
  assertUuid(userId)
  await requireAdmin()
  const supabase = await createClient()
  const admin = getServiceClient()

  const { data: { user: adminUser } } = await supabase.auth.getUser()
  const adminId = adminUser?.id ?? ''

  const [user, createdGroups, watchlistStatus, { data: adminProfile }, { data: friendship }] = await Promise.all([
    getUserDetail(userId),
    getGroupsByCreator(userId),
    isOnWatchlist(userId),
    admin.from('profiles').select('role').eq('id', adminId).single(),
    admin
      .from('friendships')
      .select('status, requester_id')
      .or(`and(requester_id.eq.${adminId},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${adminId})`)
      .maybeSingle(),
  ])

  if (!user) return null

  let friendshipStatus: 'none' | 'pending_sent' | 'pending_received' | 'accepted' = 'none'
  if (friendship) {
    if (friendship.status === 'accepted') friendshipStatus = 'accepted'
    else if (friendship.requester_id === adminId) friendshipStatus = 'pending_sent'
    else friendshipStatus = 'pending_received'
  }

  return {
    user,
    createdGroups,
    onWatchlist: watchlistStatus.onWatchlist,
    watchlistNote: watchlistStatus.note,
    isSuperAdmin: adminProfile?.role === 'super_admin',
    friendshipStatus,
  }
}
