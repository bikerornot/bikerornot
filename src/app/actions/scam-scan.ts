'use server'

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getOpenAI } from '@/lib/openai'

function getAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const SCAM_PATTERNS = `- Romance scam tactics (sudden love/attraction, wanting to move off platform)
- Requests for money, gift cards, wire transfers, or cryptocurrency
- Investment or "opportunity" pitches
- Phishing links or suspicious URLs
- Fabricated emergencies needing financial help
- Too-good-to-be-true offers
- Excessive flattery to build false trust`

async function runScamScan(content: string, context: 'message' | 'comment'): Promise<{ score: number; reason: string | null }> {
  const contextDesc = context === 'message'
    ? 'private message'
    : 'public comment on a post'

  const openai = getOpenAI()
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a scam detection system for a motorcycle enthusiast social network. Analyze this ${contextDesc} and rate its scam likelihood from 0.0 (legitimate) to 1.0 (definite scam). Flag these patterns:
${SCAM_PATTERNS}

Normal motorcycle conversation (rides, bikes, gear, meetups, routes) scores 0.0.
Sharing links to YouTube, social media, personal websites, businesses, news articles, or organizations is NORMAL social behavior — do NOT flag as suspicious unless the surrounding text contains clear scam tactics (e.g. asking for money, fake urgency, romance manipulation). A link alone is never a scam.${context === 'comment' ? '\nPublic comments are shorter and more casual — only flag if the scam intent is clear and unmistakable.' : ''}

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
  return { score, reason }
}

async function autoBanIfNeeded(admin: ReturnType<typeof getAdmin>, senderId: string, score: number, reason: string | null, context: string) {
  if (score >= 0.85) {
    // Never auto-ban admin or super_admin accounts
    const { data: profile } = await admin.from('profiles').select('role').eq('id', senderId).single()
    if (profile && ['admin', 'super_admin'].includes(profile.role)) return

    await admin
      .from('profiles')
      .update({
        status: 'banned',
        ban_reason: `Auto-banned: AI scam detection (${(score * 100).toFixed(0)}% confidence) — ${reason ?? `suspicious ${context} content`}`,
      })
      .eq('id', senderId)
      .eq('status', 'active')
  }
}

export async function scanMessageForScam(
  messageId: string,
  senderId: string,
  content: string
): Promise<void> {
  try {
    // Skip scan for banned users — their content is shadow-hidden, saves OpenAI calls
    const admin = getAdmin()
    const { data: sender } = await admin.from('profiles').select('status').eq('id', senderId).single()
    if (sender?.status === 'banned') return

    const { score, reason } = await runScamScan(content, 'message')
    if (score < 0.55) return

    await admin.from('content_flags').insert({
      message_id: messageId,
      sender_id: senderId,
      content,
      score,
      reason,
      status: 'pending',
      flag_type: 'message',
    })

    // No auto-ban — all flags go to admin review only
  } catch {
    // Scam scanning is best-effort — never block message delivery
  }
}

export async function scanCommentForScam(
  commentId: string,
  postId: string,
  senderId: string,
  content: string
): Promise<void> {
  try {
    // Skip very short comments (emoji reactions, "nice!", etc.)
    if (content.trim().length < 15) return

    // Skip scan for banned users — their content is shadow-hidden, saves OpenAI calls
    const admin = getAdmin()
    const { data: sender } = await admin.from('profiles').select('status').eq('id', senderId).single()
    if (sender?.status === 'banned') return

    const { score, reason } = await runScamScan(content, 'comment')
    // Higher threshold for public comments to reduce false positives
    if (score < 0.65) return

    await admin.from('content_flags').insert({
      comment_id: commentId,
      post_id: postId,
      sender_id: senderId,
      content,
      score,
      reason,
      status: 'pending',
      flag_type: 'comment',
    })

    // Comments are public and lower-risk than DMs — flag for review only, no auto-ban
  } catch {
    // Scam scanning is best-effort — never block comment posting
  }
}

export interface ContentFlag {
  id: string
  message_id: string | null
  comment_id: string | null
  post_id: string | null
  conversation_id: string | null
  flag_type: 'message' | 'comment'
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
  recipient?: {
    id: string
    username: string | null
    first_name: string
    last_name: string
  } | null
}

async function requireAdminOrMod() {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'moderator', 'super_admin'].includes(profile.role)) throw new Error('Not authorized')
}

export async function getFlaggedContent(): Promise<ContentFlag[]> {
  await requireAdminOrMod()
  const admin = getAdmin()
  const { data } = await admin
    .from('content_flags')
    .select('*, sender:profiles!sender_id(id, username, first_name, last_name, profile_photo_url, status), message:messages!message_id(conversation_id, conversation:conversations!conversation_id(participant1_id, participant2_id, participant1:profiles!participant1_id(id, username, first_name, last_name), participant2:profiles!participant2_id(id, username, first_name, last_name)))')
    .order('score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100)

  // Resolve recipient from conversation participants (for DM flags)
  return (data ?? []).map((flag: any) => {
    let recipient = null
    if (flag.flag_type === 'message' || !flag.flag_type) {
      const conv = flag.message?.conversation
      if (conv) {
        if (conv.participant1_id !== flag.sender_id) {
          recipient = conv.participant1
        } else {
          recipient = conv.participant2
        }
      }
    }
    return {
      id: flag.id,
      message_id: flag.message_id,
      comment_id: flag.comment_id,
      post_id: flag.post_id,
      conversation_id: flag.message?.conversation_id ?? null,
      flag_type: flag.flag_type ?? 'message',
      sender_id: flag.sender_id,
      content: flag.content,
      score: flag.score,
      reason: flag.reason,
      status: flag.status,
      created_at: flag.created_at,
      sender: flag.sender,
      recipient,
    } as ContentFlag
  })
}

export interface FlagConversationMessage {
  id: string
  sender_id: string
  sender_username: string | null
  content: string
  created_at: string
}

export async function getFlagConversationMessages(conversationId: string): Promise<FlagConversationMessage[]> {
  await requireAdminOrMod()
  const admin = getAdmin()

  const { data } = await admin
    .from('messages')
    .select('id, sender_id, content, created_at, sender:profiles!sender_id(username)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(100)

  return (data ?? []).map((m: any) => ({
    id: m.id,
    sender_id: m.sender_id,
    sender_username: m.sender?.username ?? null,
    content: m.content,
    created_at: m.created_at,
  }))
}

export interface ConversationScanResult {
  score: number
  patterns: string[]
  summary: string
  suspiciousMessageIds: string[]
}

export async function scanConversation(conversationId: string): Promise<ConversationScanResult> {
  await requireAdminOrMod()
  const admin = getAdmin()

  const { data: messages } = await admin
    .from('messages')
    .select('id, sender_id, content, created_at, sender:profiles!sender_id(username)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(100)

  if (!messages?.length) {
    return { score: 0, patterns: [], summary: 'No messages to analyze', suspiciousMessageIds: [] }
  }

  // Format conversation for AI analysis
  const transcript = messages.map((m: any) =>
    `[${new Date(m.created_at).toLocaleString()}] @${m.sender?.username ?? 'unknown'}: ${m.content}`
  ).join('\n')

  const openai = getOpenAI()
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a scam detection system for a motorcycle enthusiast social network. Analyze this FULL conversation between two users and assess the overall scam likelihood.

Look for these patterns across the conversation arc:
${SCAM_PATTERNS}
- Grooming behavior that escalates over multiple messages
- Building false trust before making requests
- Trying to move conversation to another platform (WhatsApp, Hangouts, email)
- Inconsistent stories or claims

Normal motorcycle conversation (rides, bikes, gear, meetups, routes, events) scores 0.0.
Consider the FULL context — a single suspicious message in an otherwise normal conversation is less concerning than a pattern of escalating manipulation.

Reply ONLY with valid JSON:
{
  "score": 0.0,
  "patterns": ["pattern1", "pattern2"],
  "summary": "2-3 sentence assessment",
  "suspicious_indices": [0, 3, 7]
}

Where suspicious_indices are 0-based indices of the most suspicious messages in the conversation.`,
      },
      { role: 'user', content: transcript },
    ],
    max_tokens: 500,
    temperature: 0,
    response_format: { type: 'json_object' },
  })

  const text = response.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(text) as {
    score?: number
    patterns?: string[]
    summary?: string
    suspicious_indices?: number[]
  }

  const suspiciousIds = (parsed.suspicious_indices ?? [])
    .filter((i) => i >= 0 && i < messages.length)
    .map((i) => messages[i].id)

  return {
    score: typeof parsed.score === 'number' ? parsed.score : 0,
    patterns: parsed.patterns ?? [],
    summary: parsed.summary ?? '',
    suspiciousMessageIds: suspiciousIds,
  }
}

export async function dismissFlag(flagId: string): Promise<void> {
  await requireAdminOrMod()
  const admin = getAdmin()
  await admin
    .from('content_flags')
    .update({ status: 'dismissed' })
    .eq('id', flagId)
}

export async function reviewFlag(flagId: string): Promise<void> {
  await requireAdminOrMod()
  const admin = getAdmin()
  await admin
    .from('content_flags')
    .update({ status: 'reviewed' })
    .eq('id', flagId)
}

export async function getPendingFlagsCount(): Promise<number> {
  await requireAdminOrMod()
  const admin = getAdmin()
  const { count } = await admin
    .from('content_flags')
    .select('*, sender:profiles!sender_id!inner(status)', { count: 'exact', head: true })
    .eq('status', 'pending')
    .neq('sender.status', 'banned')
  return count ?? 0
}
