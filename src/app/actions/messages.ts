'use server'

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { ConversationSummary, Message } from '@/lib/supabase/types'
import { scanMessageForScam } from '@/app/actions/scam-scan'
import { checkRateLimit, assertUuid } from '@/lib/rate-limit'
import { getBlockedIds } from '@/app/actions/blocks'
import { sendPushToUser } from '@/lib/push'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Daily request limits by trust tier. Phone-verified users are the trusted baseline.
const DAILY_REQUEST_LIMIT_VERIFIED = 10
const DAILY_REQUEST_LIMIT_UNVERIFIED = 3
const COOLDOWN_DAYS_AFTER_IGNORE = 30

type FriendshipLookup = 'accepted' | 'none'

async function getFriendshipStatus(
  admin: ReturnType<typeof getServiceClient>,
  a: string,
  b: string,
): Promise<FriendshipLookup> {
  const { data } = await admin
    .from('friendships')
    .select('id')
    .or(`and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`)
    .eq('status', 'accepted')
    .maybeSingle()
  return data ? 'accepted' : 'none'
}

async function requireSenderEligibility(
  admin: ReturnType<typeof getServiceClient>,
  senderId: string,
): Promise<void> {
  const [{ count: postCount }, { count: commentCount }] = await Promise.all([
    admin.from('posts').select('*', { count: 'exact', head: true }).eq('author_id', senderId).is('deleted_at', null),
    admin.from('comments').select('*', { count: 'exact', head: true }).eq('author_id', senderId).is('deleted_at', null),
  ])
  if ((postCount ?? 0) === 0 && (commentCount ?? 0) === 0) {
    throw new Error('Please make a post or comment before sending messages.')
  }
}

/**
 * Return existing conversation id if one exists between the two users, else null.
 * Used by re-entry flows (clicking Message on a friend's profile when a thread already exists).
 */
export async function getOrCreateConversation(otherUserId: string): Promise<string> {
  assertUuid(otherUserId, 'otherUserId')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  if (user.id === otherUserId) throw new Error('Cannot message yourself')

  const admin = getServiceClient()

  const blockedIds = await getBlockedIds(user.id, admin)
  if (blockedIds.has(otherUserId)) throw new Error('Cannot message this user')

  const { data: otherUser } = await admin
    .from('profiles')
    .select('status, deactivated_at, message_privacy')
    .eq('id', otherUserId)
    .single()

  if (!otherUser || otherUser.status !== 'active' || otherUser.deactivated_at) {
    throw new Error('Cannot message this user')
  }

  const [p1, p2] = [user.id, otherUserId].sort()

  const { data: existing } = await admin
    .from('conversations')
    .select('id, status')
    .eq('participant1_id', p1)
    .eq('participant2_id', p2)
    .maybeSingle()

  // Resuming an existing conversation — even if it was a request, the receiver can land here
  if (existing) return existing.id

  // No existing conversation — require friendship for this legacy entry point.
  // First-time messaging to non-friends goes through startConversation + a compose modal.
  const friendship = await getFriendshipStatus(admin, user.id, otherUserId)
  if (friendship === 'none') {
    throw new Error('Use the message-request flow for non-friends')
  }

  await requireSenderEligibility(admin, user.id)

  const { data: convo, error } = await admin
    .from('conversations')
    .insert({ participant1_id: p1, participant2_id: p2, status: 'active', initiated_by: user.id })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return convo.id
}

/**
 * Create a new conversation with a first message. Non-friends become status='request'
 * (lands in recipient's Requests tab); friends go to status='active' immediately.
 */
export async function startConversation(
  recipientId: string,
  content: string,
): Promise<{ conversationId: string; status: 'request' | 'active' }> {
  assertUuid(recipientId, 'recipientId')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  if (user.id === recipientId) throw new Error('Cannot message yourself')

  checkRateLimit(`startConversation:${user.id}`, 20, 60_000)

  const trimmed = content.trim()
  if (!trimmed) throw new Error('Message cannot be empty')
  if (trimmed.length > 2000) throw new Error('Message too long (max 2000 characters)')

  const admin = getServiceClient()

  // Block check (both directions — existing getBlockedIds returns everyone blocked by/of this user)
  const blockedIds = await getBlockedIds(user.id, admin)
  if (blockedIds.has(recipientId)) throw new Error("You've reached your limit for this rider.")

  // Recipient active?
  const { data: recipient } = await admin
    .from('profiles')
    .select('status, deactivated_at, message_privacy')
    .eq('id', recipientId)
    .single()
  if (!recipient || recipient.status !== 'active' || recipient.deactivated_at) {
    throw new Error("You've reached your limit for this rider.")
  }

  // Quality gate: sender must have at least one post or comment
  await requireSenderEligibility(admin, user.id)

  const [p1, p2] = [user.id, recipientId].sort()

  const { data: existing } = await admin
    .from('conversations')
    .select('id, status, initiated_by')
    .eq('participant1_id', p1)
    .eq('participant2_id', p2)
    .maybeSingle()

  // Existing conversation paths
  if (existing) {
    if (existing.status === 'active') {
      // Already messaging — just insert via the same code path as sendMessage
      const message = await insertMessageAndBump(admin, existing.id, user.id, trimmed, recipientId, 'active')
      after(() => scanMessageForScam(message.id, user.id, trimmed, false))
      return { conversationId: existing.id, status: 'active' }
    }
    if (existing.status === 'request') {
      if (existing.initiated_by === user.id) {
        throw new Error('Waiting for a reply to your earlier message.')
      }
      // Recipient replying to a pending request → implicit accept
      await admin.from('conversations').update({ status: 'active' }).eq('id', existing.id)
      const message = await insertMessageAndBump(admin, existing.id, user.id, trimmed, recipientId, 'active')
      after(() => scanMessageForScam(message.id, user.id, trimmed, false))
      return { conversationId: existing.id, status: 'active' }
    }
    // status === 'ignored' falls through to cooldown check below
  }

  // Friendship status governs whether this is a direct DM or a request
  const friendship = await getFriendshipStatus(admin, user.id, recipientId)
  const becomesActive = friendship === 'accepted'

  if (!becomesActive) {
    // Privacy gate (only applies to non-friends)
    if (recipient.message_privacy === 'friends_only') {
      throw new Error('This rider only accepts messages from friends.')
    }

    // Cooldown: has this sender been ignored by this recipient in last 30 days?
    const cooldownCutoff = new Date(Date.now() - COOLDOWN_DAYS_AFTER_IGNORE * 86_400_000).toISOString()
    const { data: ignoredRow } = await admin
      .from('conversations')
      .select('id')
      .eq('participant1_id', p1)
      .eq('participant2_id', p2)
      .eq('initiated_by', user.id)
      .eq('status', 'ignored')
      .gte('ignored_at', cooldownCutoff)
      .maybeSingle()
    if (ignoredRow) throw new Error("You've reached your limit for this rider.")

    // Daily rate limit based on phone verification
    const { data: senderProfile } = await admin
      .from('profiles')
      .select('phone_verified_at')
      .eq('id', user.id)
      .single()
    const dailyLimit = senderProfile?.phone_verified_at
      ? DAILY_REQUEST_LIMIT_VERIFIED
      : DAILY_REQUEST_LIMIT_UNVERIFIED
    const dayStart = new Date(Date.now() - 86_400_000).toISOString()
    const { count: requestsToday } = await admin
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('initiated_by', user.id)
      .in('status', ['request', 'active', 'ignored'])
      .gte('created_at', dayStart)
    if ((requestsToday ?? 0) >= dailyLimit) {
      throw new Error(`You've reached today's limit of ${dailyLimit} message requests.`)
    }
  }

  // If an ignored conversation row exists from a past request by this sender and cooldown passed,
  // we intentionally reuse that row by flipping it back to 'request' so the unique pair constraint holds.
  let conversationId: string
  if (existing && existing.status === 'ignored') {
    await admin
      .from('conversations')
      .update({
        status: becomesActive ? 'active' : 'request',
        initiated_by: user.id,
        ignored_at: null,
      })
      .eq('id', existing.id)
    conversationId = existing.id
  } else {
    const { data: convo, error } = await admin
      .from('conversations')
      .insert({
        participant1_id: p1,
        participant2_id: p2,
        status: becomesActive ? 'active' : 'request',
        initiated_by: user.id,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    conversationId = convo.id
  }

  const message = await insertMessageAndBump(admin, conversationId, user.id, trimmed, recipientId, becomesActive ? 'active' : 'request')

  // Message-request notification to recipient (only for actual requests; friend DMs don't need it)
  if (!becomesActive) {
    await admin.from('notifications').insert({
      user_id: recipientId,
      type: 'message_request',
      actor_id: user.id,
    })
  }

  after(() => scanMessageForScam(message.id, user.id, trimmed, !becomesActive))

  return { conversationId, status: becomesActive ? 'active' : 'request' }
}

/**
 * Insert a message, update the conversation's last_message_* columns, return the message row.
 * Extracted so startConversation and sendMessage share the same write path.
 */
async function insertMessageAndBump(
  admin: ReturnType<typeof getServiceClient>,
  conversationId: string,
  senderId: string,
  content: string,
  recipientId: string,
  _status: 'request' | 'active',
): Promise<Message> {
  const { data: message, error } = await admin
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, content })
    .select('*, sender:profiles!sender_id(*)')
    .single()
  if (error) throw new Error(error.message)

  await admin
    .from('conversations')
    .update({
      last_message_at: message.created_at,
      last_message_preview: content.slice(0, 100),
    })
    .eq('id', conversationId)

  // Fire-and-forget push to the recipient. Wrapped in after() so a slow /
  // failed FCM call never delays the sender's UI response. Title is the
  // sender's display name; body is the first 140 chars of the message so
  // long paragraphs don't bloat the notification. conversationId goes in
  // data for future deep-link routing on tap.
  const sender = (message as Message & { sender?: { username?: string | null; full_name?: string | null } }).sender
  const senderName = sender?.full_name?.trim() || sender?.username || 'BikerOrNot'
  console.log('[push] DM trigger queued', { recipientId, senderName, messageId: message.id })
  after(() =>
    sendPushToUser(recipientId, {
      title: senderName,
      body: content.slice(0, 140),
      data: { conversationId, messageId: String(message.id), type: 'dm' },
    }).catch((err) => console.warn('[push] DM trigger failed', err))
  )

  return message as Message
}

export async function getConversations(): Promise<ConversationSummary[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = getServiceClient()

  const { data: convos } = await admin
    .from('conversations')
    .select('*, participant1:profiles!participant1_id(*), participant2:profiles!participant2_id(*)')
    .or(`participant1_id.eq.${user.id},participant2_id.eq.${user.id}`)
    .in('status', ['request', 'active'])
    .order('last_message_at', { ascending: false })

  if (!convos || convos.length === 0) return []

  const blockedIds = await getBlockedIds(user.id, admin)

  // Requests where the current user is the RECIPIENT belong in the Requests tab, not the main inbox.
  // Requests the current user SENT stay visible in the main inbox with a "Pending" badge.
  const inboxConvos = convos.filter((c) => {
    if (c.status !== 'request') return true
    return c.initiated_by === user.id
  })

  if (inboxConvos.length === 0) return []

  const convoIds = inboxConvos.map((c) => c.id)
  const { data: unreadRows } = await admin
    .from('messages')
    .select('conversation_id')
    .in('conversation_id', convoIds)
    .neq('sender_id', user.id)
    .is('read_at', null)

  const unreadByConvo: Record<string, number> = {}
  for (const row of unreadRows ?? []) {
    unreadByConvo[row.conversation_id] = (unreadByConvo[row.conversation_id] ?? 0) + 1
  }

  return inboxConvos
    .map((c) => ({
      id: c.id,
      other_user: c.participant1_id === user.id ? c.participant2 : c.participant1,
      last_message_preview: c.last_message_preview,
      last_message_at: c.last_message_at,
      unread_count: unreadByConvo[c.id] ?? 0,
      status: c.status,
      initiated_by: c.initiated_by,
      is_sent_request: c.status === 'request' && c.initiated_by === user.id,
    }))
    .filter((c) => {
      const other = c.other_user as any
      if (!other || other.status !== 'active' || other.deactivated_at) return false
      if (blockedIds.has(other.id)) return false
      return true
    }) as ConversationSummary[]
}

export async function getMessageRequests(): Promise<ConversationSummary[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = getServiceClient()

  const { data: convos } = await admin
    .from('conversations')
    .select('*, participant1:profiles!participant1_id(*), participant2:profiles!participant2_id(*)')
    .or(`participant1_id.eq.${user.id},participant2_id.eq.${user.id}`)
    .eq('status', 'request')
    .neq('initiated_by', user.id)
    .order('last_message_at', { ascending: false })

  if (!convos || convos.length === 0) return []

  const blockedIds = await getBlockedIds(user.id, admin)

  return convos
    .map((c) => ({
      id: c.id,
      other_user: c.participant1_id === user.id ? c.participant2 : c.participant1,
      last_message_preview: c.last_message_preview,
      last_message_at: c.last_message_at,
      unread_count: 0, // requests don't surface unread counts — they're a single inbound message awaiting action
      status: c.status,
      initiated_by: c.initiated_by,
      is_sent_request: false,
    }))
    .filter((c) => {
      const other = c.other_user as any
      if (!other || other.status !== 'active' || other.deactivated_at) return false
      if (blockedIds.has(other.id)) return false
      return true
    }) as ConversationSummary[]
}

export async function getMessageRequestCount(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const admin = getServiceClient()
  const { count } = await admin
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .or(`participant1_id.eq.${user.id},participant2_id.eq.${user.id}`)
    .eq('status', 'request')
    .neq('initiated_by', user.id)

  return count ?? 0
}

const MESSAGES_PAGE_SIZE = 50

export async function getMessages(
  conversationId: string,
  before?: string
): Promise<{ messages: Message[]; hasMore: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { messages: [], hasMore: false }

  const admin = getServiceClient()

  const { data: convo } = await admin
    .from('conversations')
    .select('participant1_id, participant2_id')
    .eq('id', conversationId)
    .single()

  if (!convo || (convo.participant1_id !== user.id && convo.participant2_id !== user.id)) {
    throw new Error('Not authorized')
  }

  let query = admin
    .from('messages')
    .select('*, sender:profiles!sender_id(*)')
    .eq('conversation_id', conversationId)

  if (before) {
    query = query.lt('created_at', before)
  }

  const { data } = await query
    .order('created_at', { ascending: false })
    .limit(MESSAGES_PAGE_SIZE + 1)

  const raw = (data ?? []) as any[]
  const hasMore = raw.length > MESSAGES_PAGE_SIZE
  const page = hasMore ? raw.slice(0, MESSAGES_PAGE_SIZE) : raw

  const messages = page.reverse().filter((m) => {
    return m.sender_id === user.id || !m.sender || m.sender.status === 'active'
  }) as Message[]

  return { messages, hasMore }
}

export async function sendMessage(conversationId: string, content: string): Promise<Message> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  checkRateLimit(`sendMessage:${user.id}`, 30, 60_000)

  const admin = getServiceClient()

  const { data: convo } = await admin
    .from('conversations')
    .select('participant1_id, participant2_id, status, initiated_by')
    .eq('id', conversationId)
    .single()

  if (!convo || (convo.participant1_id !== user.id && convo.participant2_id !== user.id)) {
    throw new Error('Not authorized')
  }

  if (convo.status === 'ignored') {
    throw new Error('This conversation is no longer available.')
  }

  // Request state: only the RECIPIENT may send (implicit accept). Sender is frozen until reply.
  if (convo.status === 'request') {
    if (convo.initiated_by === user.id) {
      throw new Error('Waiting for a reply to your earlier message.')
    }
  }

  const recipientId = convo.participant1_id === user.id ? convo.participant2_id : convo.participant1_id

  const blockedIds = await getBlockedIds(user.id, admin)
  if (blockedIds.has(recipientId)) throw new Error('Cannot send message to this user')

  const { data: recipient } = await admin
    .from('profiles')
    .select('status, deactivated_at')
    .eq('id', recipientId)
    .single()

  if (!recipient || recipient.status !== 'active' || recipient.deactivated_at) {
    throw new Error('Cannot send message to this user')
  }

  const trimmed = content.trim()
  if (!trimmed) throw new Error('Message cannot be empty')
  if (trimmed.length > 2000) throw new Error('Message too long (max 2000 characters)')

  const { data: message, error } = await admin
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: user.id, content: trimmed })
    .select('*, sender:profiles!sender_id(*)')
    .single()

  if (error) throw new Error(error.message)

  const newStatus = convo.status === 'request' ? 'active' : convo.status
  await admin
    .from('conversations')
    .update({
      last_message_at: message.created_at,
      last_message_preview: trimmed.slice(0, 100),
      status: newStatus,
    })
    .eq('id', conversationId)

  // Request messages (first message) scan at lower threshold; replies/accepted scan at normal threshold.
  const isRequest = convo.status === 'request' && convo.initiated_by === user.id
  after(() => scanMessageForScam(message.id, user.id, trimmed, isRequest))

  return message as Message
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const admin = getServiceClient()

  const { data: convo } = await admin
    .from('conversations')
    .select('participant1_id, participant2_id')
    .eq('id', conversationId)
    .single()
  if (!convo || (convo.participant1_id !== user.id && convo.participant2_id !== user.id)) return

  await admin
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .neq('sender_id', user.id)
    .is('read_at', null)
}

export async function getUnreadMessageCount(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const admin = getServiceClient()

  const { data: convos } = await admin
    .from('conversations')
    .select('id, participant1_id, participant2_id, participant1:profiles!participant1_id(status, deactivated_at), participant2:profiles!participant2_id(status, deactivated_at)')
    .or(`participant1_id.eq.${user.id},participant2_id.eq.${user.id}`)
    .eq('status', 'active')

  if (!convos || convos.length === 0) return 0

  const blockedIds = await getBlockedIds(user.id, admin)

  const visibleConvoIds = convos
    .filter((c: any) => {
      const other = c.participant1_id === user.id ? c.participant2 : c.participant1
      if (!other || other.status !== 'active' || other.deactivated_at) return false
      const otherId = c.participant1_id === user.id ? c.participant2_id : c.participant1_id
      if (blockedIds.has(otherId)) return false
      return true
    })
    .map((c) => c.id)

  if (visibleConvoIds.length === 0) return 0

  const { count } = await admin
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .in('conversation_id', visibleConvoIds)
    .neq('sender_id', user.id)
    .is('read_at', null)

  return count ?? 0
}

/**
 * Recipient accepts a pending message request. Flips status to 'active' so both can DM freely.
 */
export async function acceptMessageRequest(conversationId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { data: convo } = await admin
    .from('conversations')
    .select('participant1_id, participant2_id, status, initiated_by')
    .eq('id', conversationId)
    .single()

  if (!convo) throw new Error('Conversation not found')
  if (convo.participant1_id !== user.id && convo.participant2_id !== user.id) throw new Error('Not authorized')
  if (convo.initiated_by === user.id) throw new Error('Not authorized')
  if (convo.status !== 'request') throw new Error('Conversation is not a pending request')

  await admin.from('conversations').update({ status: 'active' }).eq('id', conversationId)

  // Clear any unread message-request notifications pointing at the sender
  await admin
    .from('notifications')
    .delete()
    .eq('user_id', user.id)
    .eq('actor_id', convo.initiated_by)
    .eq('type', 'message_request')
}

/**
 * Recipient silently declines a pending request. Starts the 30-day cooldown; sender sees no signal.
 */
export async function ignoreMessageRequest(conversationId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { data: convo } = await admin
    .from('conversations')
    .select('participant1_id, participant2_id, status, initiated_by')
    .eq('id', conversationId)
    .single()

  if (!convo) throw new Error('Conversation not found')
  if (convo.participant1_id !== user.id && convo.participant2_id !== user.id) throw new Error('Not authorized')
  if (convo.initiated_by === user.id) throw new Error('Not authorized')
  if (convo.status !== 'request') throw new Error('Conversation is not a pending request')

  await admin
    .from('conversations')
    .update({ status: 'ignored', ignored_at: new Date().toISOString() })
    .eq('id', conversationId)

  await admin
    .from('notifications')
    .delete()
    .eq('user_id', user.id)
    .eq('actor_id', convo.initiated_by)
    .eq('type', 'message_request')
}
