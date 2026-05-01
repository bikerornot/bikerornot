'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { computeRiskSignals, type RiskSignal } from '@/lib/risk-signals'

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
  return user
}

export interface SuspiciousProfile {
  id: string
  username: string
  firstName: string | null
  gender: string | null
  city: string | null
  state: string | null
  profilePhotoUrl: string | null
  verified: boolean
  joined: string
  messagesSent: number
  conversations: number
  messagedMen: number
  messagedWomen: number
  posts: number
  riskScore: number
  signals: RiskSignal[]
}

export async function getSuspiciousProfiles(): Promise<SuspiciousProfile[]> {
  await requireAdmin()
  const admin = getServiceClient()

  const { data } = await admin.rpc('get_suspicious_profiles' as any)

  if (!data || !Array.isArray(data)) return []

  // Exclude users we're already tracking elsewhere — banned (handled),
  // suspended (handled), or already on the watchlist (being monitored).
  // Also need first_name for the avatar fallback.
  const ids = (data as any[]).map((r) => r.id).filter(Boolean)
  const [statusRes, watchlistRes, signalMap] = await Promise.all([
    ids.length > 0
      ? admin.from('profiles').select('id, status, first_name').in('id', ids)
      : Promise.resolve({ data: [] as any[] }),
    ids.length > 0
      ? admin.from('admin_watchlist').select('user_id').in('user_id', ids)
      : Promise.resolve({ data: [] as any[] }),
    ids.length > 0
      ? computeRiskSignals(admin, ids)
      : Promise.resolve(new Map<string, RiskSignal[]>()),
  ])

  const statusMap = new Map<string, { status: string; first_name: string | null }>()
  for (const p of (statusRes.data ?? []) as any[]) statusMap.set(p.id, p)
  const watchlistedIds = new Set(((watchlistRes.data ?? []) as any[]).map((w) => w.user_id))

  return (data as any[])
    .filter((row) => {
      const s = statusMap.get(row.id)
      // Drop banned/suspended (handled), already-watchlisted (being tracked)
      if (!s) return true
      if (s.status === 'banned' || s.status === 'suspended') return false
      if (watchlistedIds.has(row.id)) return false
      return true
    })
    .map((row) => {
      const sent = Number(row.msgs_sent ?? 0)
      const convos = Number(row.convos ?? 0)
      const toMen = Number(row.to_men ?? 0)
      const toWomen = Number(row.to_women ?? 0)
      const posts = Number(row.posts ?? 0)
      const signals = signalMap.get(row.id) ?? []

      // Risk score — recalibrated against the user's main complaint that
      // gender-skewed messaging is just normal heterosexual user behavior
      // on a dating-adjacent site. We dropped that weight from 25→3 and
      // added points for the real signals we trust (datacenter IP, no
      // bike, burst DMs, copy-paste opener).
      let risk = 0
      if (posts === 0) risk += 30
      else if (posts <= 1) risk += 15
      if (!row.verified) risk += 20
      const totalTargets = toMen + toWomen
      if (totalTargets > 0) {
        const genderRatio = Math.max(toMen, toWomen) / totalTargets
        if (genderRatio >= 1.0) risk += 3 // was 25 — almost everyone msgs only one gender
        else if (genderRatio >= 0.8) risk += 1 // was 15
      }
      if (sent >= 20) risk += 20
      else if (sent >= 10) risk += 10
      if (convos >= 5) risk += 15
      else if (convos >= 3) risk += 10

      // Real risk signals (each one is a much stronger tell than the
      // demographic weights above)
      if (signals.includes('datacenter_ip')) risk += 25
      if (signals.includes('robotic_opener')) risk += 25
      if (signals.includes('burst_dms')) risk += 15
      if (signals.includes('no_bike')) risk += 10
      if (signals.includes('new_account')) risk += 5

      const profileMeta = statusMap.get(row.id)

      return {
        id: row.id,
        username: row.username ?? 'unknown',
        firstName: profileMeta?.first_name ?? null,
        gender: row.gender,
        city: row.city,
        state: row.state,
        profilePhotoUrl: row.profile_photo_url,
        verified: !!row.verified,
        joined: row.joined,
        messagesSent: sent,
        conversations: convos,
        messagedMen: toMen,
        messagedWomen: toWomen,
        posts,
        riskScore: risk,
        signals,
      }
    })
    .filter((p) => p.riskScore >= 30)
    .sort((a, b) => b.riskScore - a.riskScore)
}
