'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

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
}

export async function getSuspiciousProfiles(): Promise<SuspiciousProfile[]> {
  await requireAdmin()
  const admin = getServiceClient()

  const { data } = await admin.rpc('get_suspicious_profiles' as any)

  if (!data || !Array.isArray(data)) return []

  return (data as any[]).map((row) => {
    const sent = Number(row.msgs_sent ?? 0)
    const convos = Number(row.convos ?? 0)
    const toMen = Number(row.to_men ?? 0)
    const toWomen = Number(row.to_women ?? 0)
    const posts = Number(row.posts ?? 0)

    // Calculate risk score
    let risk = 0
    if (posts === 0) risk += 30
    else if (posts <= 1) risk += 15
    if (!row.verified) risk += 20
    const totalTargets = toMen + toWomen
    if (totalTargets > 0) {
      const genderRatio = Math.max(toMen, toWomen) / totalTargets
      if (genderRatio >= 1.0) risk += 25
      else if (genderRatio >= 0.8) risk += 15
    }
    if (sent >= 20) risk += 20
    else if (sent >= 10) risk += 10
    if (convos >= 5) risk += 15
    else if (convos >= 3) risk += 10

    return {
      id: row.id,
      username: row.username ?? 'unknown',
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
    }
  })
  .filter((p) => p.riskScore >= 30)
  .sort((a, b) => b.riskScore - a.riskScore)
}
