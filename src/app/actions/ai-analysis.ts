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

  // Get new users from last 14 days
  const { data: newUsers } = await admin
    .from('profiles')
    .select('id, username, gender, city, state, profile_photo_url, phone_verified_at, created_at')
    .eq('status', 'active')
    .eq('onboarding_complete', true)
    .gte('created_at', new Date(Date.now() - 14 * 86400000).toISOString())

  if (!newUsers || newUsers.length === 0) return []

  const userIds = newUsers.map((u) => u.id)

  // Fetch messages sent by these users — paginated to avoid 1000-row limit
  const allMessages: any[] = []
  for (let i = 0; i < userIds.length; i += 50) {
    const chunk = userIds.slice(i, i + 50)
    let page = 0
    while (true) {
      const { data: msgs } = await admin
        .from('messages')
        .select('sender_id, conversation_id')
        .in('sender_id', chunk)
        .range(page * 1000, (page + 1) * 1000 - 1)
      if (!msgs || msgs.length === 0) break
      allMessages.push(...msgs)
      if (msgs.length < 1000) break
      page++
    }
  }
  const messages = allMessages

  // Fetch conversations to determine who they're messaging
  const convIds = [...new Set(messages.map((m) => m.conversation_id))]
  const allConversations: any[] = []
  for (let i = 0; i < convIds.length; i += 50) {
    const chunk = convIds.slice(i, i + 50)
    const { data: convs } = await admin.from('conversations').select('id, participant1_id, participant2_id').in('id', chunk)
    if (convs) allConversations.push(...convs)
  }
  const conversations = allConversations

  const convMap = new Map(conversations.map((c: any) => [c.id, c]))

  // Fetch gender of conversation partners
  const partnerIds = new Set<string>()
  for (const m of messages ?? []) {
    const conv = convMap.get(m.conversation_id)
    if (conv) {
      const partnerId = conv.participant1_id === m.sender_id ? conv.participant2_id : conv.participant1_id
      partnerIds.add(partnerId)
    }
  }

  const { data: partnerProfiles } = partnerIds.size > 0
    ? await admin.from('profiles').select('id, gender').in('id', Array.from(partnerIds))
    : { data: [] }
  const partnerGenderMap = new Map((partnerProfiles ?? []).map((p) => [p.id, p.gender]))

  // Build per-user message stats
  const userStats = new Map<string, { sent: number; convos: Set<string>; toMen: Set<string>; toWomen: Set<string> }>()
  for (const m of messages ?? []) {
    if (!userStats.has(m.sender_id)) {
      userStats.set(m.sender_id, { sent: 0, convos: new Set(), toMen: new Set(), toWomen: new Set() })
    }
    const s = userStats.get(m.sender_id)!
    s.sent++
    s.convos.add(m.conversation_id)

    const conv = convMap.get(m.conversation_id)
    if (conv) {
      const partnerId = conv.participant1_id === m.sender_id ? conv.participant2_id : conv.participant1_id
      const partnerGender = partnerGenderMap.get(partnerId)
      if (partnerGender === 'male') s.toMen.add(partnerId)
      else if (partnerGender === 'female') s.toWomen.add(partnerId)
    }
  }

  // Fetch post counts
  const { data: postCounts } = await admin
    .from('posts')
    .select('author_id')
    .in('author_id', userIds)
    .is('deleted_at', null)

  const postMap = new Map<string, number>()
  for (const p of postCounts ?? []) {
    postMap.set(p.author_id, (postMap.get(p.author_id) ?? 0) + 1)
  }

  // Score and filter
  const results: SuspiciousProfile[] = []
  for (const u of newUsers) {
    const stats = userStats.get(u.id)
    const sent = stats?.sent ?? 0
    const convos = stats?.convos.size ?? 0
    const toMen = stats?.toMen.size ?? 0
    const toWomen = stats?.toWomen.size ?? 0
    const posts = postMap.get(u.id) ?? 0

    // Skip if not enough activity to flag
    if (sent < 5) continue

    // Calculate risk score
    let risk = 0
    // Heavy messaging, low posting
    if (posts === 0) risk += 30
    else if (posts <= 1) risk += 15
    // Not verified
    if (!u.phone_verified_at) risk += 20
    // Gender-targeted messaging (messaging only one gender)
    const totalTargets = toMen + toWomen
    if (totalTargets > 0) {
      const genderRatio = Math.max(toMen, toWomen) / totalTargets
      if (genderRatio >= 1.0) risk += 25 // 100% one gender
      else if (genderRatio >= 0.8) risk += 15
    }
    // High message volume for a new account
    if (sent >= 20) risk += 20
    else if (sent >= 10) risk += 10
    // Many unique conversations (casting a wide net)
    if (convos >= 5) risk += 15
    else if (convos >= 3) risk += 10

    if (risk >= 30) {
      results.push({
        id: u.id,
        username: u.username ?? 'unknown',
        gender: u.gender,
        city: u.city,
        state: u.state,
        profilePhotoUrl: u.profile_photo_url,
        verified: !!u.phone_verified_at,
        joined: u.created_at,
        messagesSent: sent,
        conversations: convos,
        messagedMen: toMen,
        messagedWomen: toWomen,
        posts,
        riskScore: risk,
      })
    }
  }

  return results.sort((a, b) => b.riskScore - a.riskScore)
}
