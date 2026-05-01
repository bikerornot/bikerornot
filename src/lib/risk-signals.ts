import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isDatacenterIP } from './risk'
import type { RiskSignal } from './risk-signals-meta'

// Re-export so call sites that already import from this module keep working.
export type { RiskSignal } from './risk-signals-meta'

// Batched signal computation. One Promise.all per page render, regardless of
// how many users we're checking. Runs four queries and folds them together.
export async function computeRiskSignals(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, RiskSignal[]>> {
  const out = new Map<string, RiskSignal[]>()
  if (userIds.length === 0) return out

  const [authorsResult, bikesResult, msgsResult] = await Promise.all([
    admin.from('profiles').select('id, created_at, signup_ip').in('id', userIds),
    admin.from('user_bikes').select('user_id').in('user_id', userIds),
    admin.from('messages').select('sender_id, conversation_id, content, created_at')
      .in('sender_id', userIds).order('created_at', { ascending: true }),
  ])

  const authorMap = new Map<string, { created_at: string; signup_ip: string | null }>()
  for (const a of (authorsResult.data ?? []) as any[]) authorMap.set(a.id, a)

  const bikeCount = new Map<string, number>()
  for (const b of (bikesResult.data ?? []) as any[]) {
    bikeCount.set(b.user_id, (bikeCount.get(b.user_id) ?? 0) + 1)
  }

  // Group messages by author for two derived metrics:
  //   - burst: DMs in first 24h
  //   - opener: first message per conversation, count duplicates
  const msgsByAuthor = new Map<string, Array<{ conversation_id: string; content: string | null; created_at: string }>>()
  for (const m of (msgsResult.data ?? []) as any[]) {
    const arr = msgsByAuthor.get(m.sender_id) ?? []
    arr.push({ conversation_id: m.conversation_id, content: m.content, created_at: m.created_at })
    msgsByAuthor.set(m.sender_id, arr)
  }

  const now = Date.now()
  for (const userId of userIds) {
    const a = authorMap.get(userId)
    const signals: RiskSignal[] = []

    if (a) {
      const ageMs = now - new Date(a.created_at).getTime()
      if (ageMs < 7 * 24 * 60 * 60 * 1000) signals.push('new_account')
      if (isDatacenterIP(a.signup_ip)) signals.push('datacenter_ip')
    }

    if ((bikeCount.get(userId) ?? 0) === 0) signals.push('no_bike')

    const msgs = msgsByAuthor.get(userId) ?? []
    if (a && msgs.length > 0) {
      const signupTs = new Date(a.created_at).getTime()
      const burstWindow = 24 * 60 * 60 * 1000
      const burstCount = msgs.filter((m) => new Date(m.created_at).getTime() - signupTs <= burstWindow).length
      if (burstCount > 10) signals.push('burst_dms')
    }

    const firstByConv = new Map<string, string>()
    for (const m of msgs) {
      if (!m.content) continue
      if (!firstByConv.has(m.conversation_id)) {
        firstByConv.set(m.conversation_id, m.content.trim().toLowerCase())
      }
    }
    const openerCounts = new Map<string, number>()
    for (const opener of firstByConv.values()) {
      if (opener.length < 2) continue
      openerCounts.set(opener, (openerCounts.get(opener) ?? 0) + 1)
    }
    const maxOpener = Math.max(0, ...openerCounts.values())
    if (maxOpener >= 3) signals.push('robotic_opener')

    out.set(userId, signals)
  }

  return out
}
