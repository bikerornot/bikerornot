'use server'

import { createClient as createServiceClient } from '@supabase/supabase-js'

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
