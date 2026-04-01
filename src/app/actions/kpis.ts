'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import {
  getGAMetrics, getGATrafficSources, getGATopPages, getGADeviceBreakdown, getGABounceByPage, getGADailySessions,
  type GAMetrics, type GATrafficSource, type GATopPage, type GADeviceBreakdown, type GAPageBounce, type GADailyMetric,
} from '@/lib/google-analytics'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) throw new Error('Not authorized')
  return user.id
}

export interface KpiData {
  // GA metrics
  visitors: number
  sessions: number
  bounceRate: number
  avgSessionDuration: number
  trafficSources: GATrafficSource[]
  topPages: GATopPage[]
  devices: GADeviceBreakdown[]
  bounceByPage: GAPageBounce[]

  // Supabase metrics
  newSignups: number
  onboardingCompleted: number
  dau: number
  wau: number
  mau: number

  // Engagement
  totalActions: number
  actionsPerSession: number
  postsInRange: number
  commentsInRange: number
  likesInRange: number
  postsPerActiveUser: number
  lurkerRate: number
  friendRequestsSent: number
  friendRequestsAccepted: number
  friendAcceptanceRate: number

  // Network Health
  totalUsers: number
  totalFriendships: number
  avgFriendsPerUser: number
  totalGroups: number
  medianPostsPerUserPerWeek: number

  // Trends (daily data points for sparklines)
  trends: TrendData

  // Retention
  retention: RetentionData

  // Derived
  visitorToSignupRate: number
  onboardingCompleteRate: number
  stickiness: number
}

export interface TrendPoint {
  date: string
  value: number
}

export interface TrendData {
  signups: TrendPoint[]
  posts: TrendPoint[]
  dau: TrendPoint[]
  sessions: TrendPoint[]
}

export interface RetentionData {
  cohortSize: number
  day1Return: number
  day7Return: number
  day30Return: number
  day1Rate: number
  day7Rate: number
  day30Rate: number
  friendedWithin7d: number
  friendConnectionRate: number
  medianHoursToFirstFriend: number | null
}

async function getRetentionData(admin: ReturnType<typeof getServiceClient>, startDate: string, endDate: string): Promise<RetentionData> {
  // Cohort: users who signed up in the date range (at least 30 days ago for day-30 data)
  // For retention, we look at signups from startDate to endDate and check their return behavior
  const { data: cohort } = await admin
    .from('profiles')
    .select('id, created_at, last_seen_at')
    .eq('status', 'active')
    .eq('onboarding_complete', true)
    .gte('created_at', startDate)
    .lte('created_at', endDate + 'T23:59:59Z')
    .limit(1000)

  const users = cohort ?? []
  const cohortSize = users.length
  if (cohortSize === 0) {
    return {
      cohortSize: 0, day1Return: 0, day7Return: 0, day30Return: 0,
      day1Rate: 0, day7Rate: 0, day30Rate: 0,
      friendedWithin7d: 0, friendConnectionRate: 0, medianHoursToFirstFriend: null,
    }
  }

  const dayMs = 24 * 60 * 60 * 1000
  let day1Return = 0
  let day7Return = 0
  let day30Return = 0

  for (const u of users) {
    if (!u.last_seen_at) continue
    const signupTime = new Date(u.created_at).getTime()
    const lastSeen = new Date(u.last_seen_at).getTime()
    const daysSinceSeen = (lastSeen - signupTime) / dayMs
    if (daysSinceSeen >= 1) day1Return++
    if (daysSinceSeen >= 7) day7Return++
    if (daysSinceSeen >= 30) day30Return++
  }

  // Friend connection within 7 days of signup
  const userIds = users.map((u) => u.id)
  const CHUNK = 50
  const hoursToFirstFriend: number[] = []
  let friendedWithin7d = 0

  for (let i = 0; i < userIds.length; i += CHUNK) {
    const chunk = userIds.slice(i, i + CHUNK)
    const [{ data: asReq }, { data: asAddr }] = await Promise.all([
      admin.from('friendships')
        .select('requester_id, created_at')
        .eq('status', 'accepted')
        .in('requester_id', chunk),
      admin.from('friendships')
        .select('addressee_id, created_at')
        .eq('status', 'accepted')
        .in('addressee_id', chunk),
    ])

    // Build earliest friendship time per user
    const earliest: Record<string, number> = {}
    for (const f of asReq ?? []) {
      const t = new Date(f.created_at).getTime()
      if (!earliest[f.requester_id] || t < earliest[f.requester_id]) earliest[f.requester_id] = t
    }
    for (const f of asAddr ?? []) {
      const t = new Date(f.created_at).getTime()
      if (!earliest[f.addressee_id] || t < earliest[f.addressee_id]) earliest[f.addressee_id] = t
    }

    for (const u of users.filter((u) => chunk.includes(u.id))) {
      const firstFriend = earliest[u.id]
      if (!firstFriend) continue
      const signupTime = new Date(u.created_at).getTime()
      const hoursToFriend = (firstFriend - signupTime) / (60 * 60 * 1000)
      if (hoursToFriend <= 7 * 24) friendedWithin7d++
      if (hoursToFriend >= 0) hoursToFirstFriend.push(hoursToFriend)
    }
  }

  // Median hours to first friend
  hoursToFirstFriend.sort((a, b) => a - b)
  const medianHours = hoursToFirstFriend.length > 0
    ? hoursToFirstFriend[Math.floor(hoursToFirstFriend.length / 2)]
    : null

  return {
    cohortSize,
    day1Return,
    day7Return,
    day30Return,
    day1Rate: cohortSize > 0 ? day1Return / cohortSize : 0,
    day7Rate: cohortSize > 0 ? day7Return / cohortSize : 0,
    day30Rate: cohortSize > 0 ? day30Return / cohortSize : 0,
    friendedWithin7d,
    friendConnectionRate: cohortSize > 0 ? friendedWithin7d / cohortSize : 0,
    medianHoursToFirstFriend: medianHours,
  }
}

export async function getKpiData(startDate: string, endDate: string): Promise<KpiData> {
  await requireAdmin()
  const admin = getServiceClient()

  // Fetch GA and Supabase data in parallel
  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [
    gaMetrics,
    trafficSources,
    topPages,
    devices,
    bounceByPage,
    { count: newSignups },
    { count: onboardingCompleted },
    { count: dau },
    { count: wau },
    { count: mau },
    { count: postsInRange },
    { count: commentsInRange },
    { count: likesInRange },
    { count: friendRequestsSent },
    { count: friendRequestsAccepted },
    { data: recentPosters },
    { data: recentCommenters },
    { data: recentLikers },
    retention,
    { count: totalUsersCount },
    { count: totalFriendshipsCount },
    { count: totalGroupsCount },
    { data: signupRows },
    { data: postRows },
    dailySessions,
    { data: postsPerUserRows },
  ] = await Promise.all([
    getGAMetrics(startDate, endDate).catch(async (err) => {
      console.error('GA metrics failed, retrying:', err.message)
      try { return await getGAMetrics(startDate, endDate) } catch { return { visitors: 0, sessions: 0, bounceRate: 0, avgSessionDuration: 0 } as GAMetrics }
    }),
    getGATrafficSources(startDate, endDate).catch((): GATrafficSource[] => []),
    getGATopPages(startDate, endDate, 10).catch((): GATopPage[] => []),
    getGADeviceBreakdown(startDate, endDate).catch((): GADeviceBreakdown[] => []),
    getGABounceByPage(startDate, endDate, 10).catch((): GAPageBounce[] => []),

    // New signups in date range
    admin.from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startDate)
      .lte('created_at', endDate + 'T23:59:59Z')
      .eq('status', 'active'),

    // Onboarding completed in date range
    admin.from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startDate)
      .lte('created_at', endDate + 'T23:59:59Z')
      .eq('status', 'active')
      .eq('onboarding_complete', true),

    // DAU: active in last 24h
    admin.from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .gte('last_seen_at', oneDayAgo),

    // WAU: active in last 7 days
    admin.from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .gte('last_seen_at', sevenDaysAgo),

    // MAU: active in last 30 days
    admin.from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .gte('last_seen_at', thirtyDaysAgo),

    // Posts in date range
    admin.from('posts')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null)
      .gte('created_at', startDate)
      .lte('created_at', endDate + 'T23:59:59Z'),

    // Comments in date range
    admin.from('comments')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null)
      .gte('created_at', startDate)
      .lte('created_at', endDate + 'T23:59:59Z'),

    // Likes in date range
    admin.from('post_likes')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startDate)
      .lte('created_at', endDate + 'T23:59:59Z'),

    // Friend requests sent in date range
    admin.from('friendships')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startDate)
      .lte('created_at', endDate + 'T23:59:59Z'),

    // Friend requests accepted in date range
    admin.from('friendships')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .gte('created_at', startDate)
      .lte('created_at', endDate + 'T23:59:59Z'),

    // Active users who posted, commented, or liked in last 7 days (for lurker calc)
    admin.from('posts')
      .select('author_id')
      .is('deleted_at', null)
      .gte('created_at', sevenDaysAgo),
    admin.from('comments')
      .select('author_id')
      .is('deleted_at', null)
      .gte('created_at', sevenDaysAgo),
    admin.from('post_likes')
      .select('user_id')
      .gte('created_at', sevenDaysAgo),

    // Retention cohort analysis
    getRetentionData(admin, startDate, endDate),

    // Network health: total users, friendships, groups
    admin.from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .eq('onboarding_complete', true),
    admin.from('friendships')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'accepted'),
    admin.from('groups')
      .select('*', { count: 'exact', head: true }),

    // Daily signups for trend sparkline
    admin.from('profiles')
      .select('created_at')
      .eq('status', 'active')
      .gte('created_at', startDate)
      .lte('created_at', endDate + 'T23:59:59Z')
      .order('created_at', { ascending: true })
      .limit(1000),

    // Daily posts for trend sparkline
    admin.from('posts')
      .select('created_at')
      .is('deleted_at', null)
      .gte('created_at', startDate)
      .lte('created_at', endDate + 'T23:59:59Z')
      .order('created_at', { ascending: true })
      .limit(1000),

    // Daily sessions from GA
    getGADailySessions(startDate, endDate).catch((): GADailyMetric[] => []),

    // Posts per user last 7 days (for median calc)
    admin.from('posts')
      .select('author_id')
      .is('deleted_at', null)
      .gte('created_at', sevenDaysAgo),
  ])

  const signups = newSignups ?? 0
  const completed = onboardingCompleted ?? 0
  const dailyActive = dau ?? 0
  const weeklyActive = wau ?? 0
  const monthlyActive = mau ?? 0
  const posts = postsInRange ?? 0
  const comments = commentsInRange ?? 0
  const likes = likesInRange ?? 0
  const frSent = friendRequestsSent ?? 0
  const frAccepted = friendRequestsAccepted ?? 0
  const totalActions = posts + comments + likes

  // Lurker rate: WAU users who visited but didn't post/comment/like in 7 days
  const activeCreators = new Set<string>()
  for (const p of recentPosters ?? []) activeCreators.add(p.author_id)
  for (const c of recentCommenters ?? []) activeCreators.add(c.author_id)
  for (const l of recentLikers ?? []) activeCreators.add(l.user_id)
  const lurkerRate = weeklyActive > 0 ? Math.max(0, weeklyActive - activeCreators.size) / weeklyActive : 0

  // Days in range for per-day calculations
  const dayMs = 24 * 60 * 60 * 1000
  const rangeDays = Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / dayMs))

  // Network health
  const totalUsers = totalUsersCount ?? 0
  const totalFriendships = totalFriendshipsCount ?? 0
  const totalGroups = totalGroupsCount ?? 0
  const avgFriendsPerUser = totalUsers > 0 ? (totalFriendships * 2) / totalUsers : 0

  // Median posts per user per week
  const postCountByUser: Record<string, number> = {}
  for (const p of postsPerUserRows ?? []) {
    postCountByUser[p.author_id] = (postCountByUser[p.author_id] ?? 0) + 1
  }
  const postCounts = Object.values(postCountByUser).sort((a, b) => a - b)
  const medianPostsPerUserPerWeek = postCounts.length > 0
    ? postCounts[Math.floor(postCounts.length / 2)]
    : 0

  // Build trend sparkline data — aggregate rows by date
  function buildDailyTrend(rows: { created_at: string }[]): TrendPoint[] {
    const map: Record<string, number> = {}
    for (const r of rows) {
      const date = r.created_at.slice(0, 10)
      map[date] = (map[date] ?? 0) + 1
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }))
  }

  const trends: TrendData = {
    signups: buildDailyTrend(signupRows ?? []),
    posts: buildDailyTrend(postRows ?? []),
    dau: [], // DAU trend would need daily snapshots — placeholder for now
    sessions: dailySessions.map((d) => ({ date: d.date, value: d.value })),
  }

  return {
    visitors: gaMetrics.visitors,
    sessions: gaMetrics.sessions,
    bounceRate: gaMetrics.bounceRate,
    avgSessionDuration: gaMetrics.avgSessionDuration,
    trafficSources,
    topPages,
    devices,
    bounceByPage,

    newSignups: signups,
    onboardingCompleted: completed,
    dau: dailyActive,
    wau: weeklyActive,
    mau: monthlyActive,

    totalActions,
    actionsPerSession: gaMetrics.sessions > 0 ? totalActions / gaMetrics.sessions : 0,
    postsInRange: posts,
    commentsInRange: comments,
    likesInRange: likes,
    postsPerActiveUser: weeklyActive > 0 ? (posts / rangeDays) / weeklyActive : 0,
    lurkerRate,
    friendRequestsSent: frSent,
    friendRequestsAccepted: frAccepted,
    friendAcceptanceRate: frSent > 0 ? frAccepted / frSent : 0,

    totalUsers,
    totalFriendships,
    avgFriendsPerUser,
    totalGroups,
    medianPostsPerUserPerWeek,
    trends,

    retention,

    visitorToSignupRate: gaMetrics.visitors > 0 ? signups / gaMetrics.visitors : 0,
    onboardingCompleteRate: signups > 0 ? completed / signups : 0,
    stickiness: monthlyActive > 0 ? dailyActive / monthlyActive : 0,
  }
}
