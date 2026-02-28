'use server'

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getOpenAI } from '@/lib/openai'

function getAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function scanMessageForScam(
  messageId: string,
  senderId: string,
  content: string
): Promise<void> {
  try {
    const openai = getOpenAI()
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a scam detection system for a motorcycle enthusiast social network. Analyze this private message and rate its scam likelihood from 0.0 (legitimate) to 1.0 (definite scam). Flag these patterns:
- Romance scam tactics (sudden love/attraction, wanting to move off platform)
- Requests for money, gift cards, wire transfers, or cryptocurrency
- Investment or "opportunity" pitches
- Phishing links or suspicious URLs
- Fabricated emergencies needing financial help
- Too-good-to-be-true offers
- Excessive flattery to build false trust

Normal motorcycle conversation (rides, bikes, gear, meetups, routes) scores 0.0.

Reply ONLY with valid JSON: {"score": 0.0, "reason": "brief explanation under 100 chars"}`,
        },
        { role: 'user', content },
      ],
      max_tokens: 150,
      temperature: 0,
      response_format: { type: 'json_object' },
    })

    const text = response.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(text) as { score?: number; reason?: string }
    const score = typeof parsed.score === 'number' ? parsed.score : 0
    const reason = parsed.reason ?? null

    if (score < 0.55) return

    const admin = getAdmin()

    await admin.from('content_flags').insert({
      message_id: messageId,
      sender_id: senderId,
      content,
      score,
      reason,
      status: 'pending',
    })

    if (score >= 0.85) {
      await admin
        .from('profiles')
        .update({
          status: 'banned',
          ban_reason: `Auto-banned: AI scam detection (${(score * 100).toFixed(0)}% confidence) — ${reason ?? 'suspicious DM content'}`,
        })
        .eq('id', senderId)
        .eq('status', 'active')
    }
  } catch {
    // Scam scanning is best-effort — never block message delivery
  }
}

export interface ContentFlag {
  id: string
  message_id: string | null
  sender_id: string
  content: string
  score: number
  reason: string | null
  status: 'pending' | 'reviewed' | 'dismissed'
  created_at: string
  sender?: {
    id: string
    username: string | null
    first_name: string
    last_name: string
    profile_photo_url: string | null
    status: string
  }
}

export async function getFlaggedContent(): Promise<ContentFlag[]> {
  const admin = getAdmin()
  const { data } = await admin
    .from('content_flags')
    .select('*, sender:profiles!sender_id(id, username, first_name, last_name, profile_photo_url, status)')
    .order('score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100)

  return (data ?? []) as ContentFlag[]
}

export async function dismissFlag(flagId: string): Promise<void> {
  const admin = getAdmin()
  await admin
    .from('content_flags')
    .update({ status: 'dismissed' })
    .eq('id', flagId)
}

export async function reviewFlag(flagId: string): Promise<void> {
  const admin = getAdmin()
  await admin
    .from('content_flags')
    .update({ status: 'reviewed' })
    .eq('id', flagId)
}

export async function getPendingFlagsCount(): Promise<number> {
  const admin = getAdmin()
  const { count } = await admin
    .from('content_flags')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
  return count ?? 0
}
