'use server'

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { ConversationSummary, Message } from '@/lib/supabase/types'
import { scanMessageForScam } from '@/app/actions/scam-scan'
import { checkRateLimit } from '@/lib/rate-limit'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function getOrCreateConversation(otherUserId: string): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  if (user.id === otherUserId) throw new Error('Cannot message yourself')

  const admin = getServiceClient()

  // Only friends can message each other
  const { data: friendship } = await admin
    .from('friendships')
    .select('id')
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},addressee_id.eq.${user.id})`
    )
    .eq('status', 'accepted')
    .single()

  if (!friendship) throw new Error('You can only message friends')

  // Block messaging banned/suspended/deactivated accounts
  const { data: otherUser } = await admin
    .from('profiles')
    .select('status, deactivated_at')
    .eq('id', otherUserId)
    .single()

  if (!otherUser || otherUser.status !== 'active' || otherUser.deactivated_at) {
    throw new Error('Cannot message this user')
  }

  const [p1, p2] = [user.id, otherUserId].sort() // enforce ordering

  const { data: existing } = await admin
    .from('conversations')
    .select('id')
    .eq('participant1_id', p1)
    .eq('participant2_id', p2)
    .single()

  if (existing) return existing.id

  const { data: convo, error } = await admin
    .from('conversations')
    .insert({ participant1_id: p1, participant2_id: p2 })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return convo.id
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
    .order('last_message_at', { ascending: false })

  if (!convos || convos.length === 0) return []

  // Batch fetch unread counts
  const convoIds = convos.map((c) => c.id)
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

  return convos
    .map((c) => ({
      id: c.id,
      other_user: c.participant1_id === user.id ? c.participant2 : c.participant1,
      last_message_preview: c.last_message_preview,
      last_message_at: c.last_message_at,
      unread_count: unreadByConvo[c.id] ?? 0,
    }))
    .filter((c) => {
      const other = c.other_user as any
      return other?.status === 'active' && !other?.deactivated_at
    }) as ConversationSummary[]
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = getServiceClient()

  const { data: convo } = await admin
    .from('conversations')
    .select('participant1_id, participant2_id')
    .eq('id', conversationId)
    .single()

  if (!convo || (convo.participant1_id !== user.id && convo.participant2_id !== user.id)) {
    throw new Error('Not authorized')
  }

  const { data } = await admin
    .from('messages')
    .select('*, sender:profiles!sender_id(*)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(200)

  return (data ?? []) as Message[]
}

export async function sendMessage(conversationId: string, content: string): Promise<Message> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  checkRateLimit(`sendMessage:${user.id}`, 30, 60_000)

  const admin = getServiceClient()

  const { data: convo } = await admin
    .from('conversations')
    .select('participant1_id, participant2_id')
    .eq('id', conversationId)
    .single()

  if (!convo || (convo.participant1_id !== user.id && convo.participant2_id !== user.id)) {
    throw new Error('Not authorized')
  }

  // Block sending to banned/suspended/deactivated accounts
  const recipientId = convo.participant1_id === user.id ? convo.participant2_id : convo.participant1_id
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

  const { data: message, error } = await admin
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: user.id, content: trimmed })
    .select('*, sender:profiles!sender_id(*)')
    .single()

  if (error) throw new Error(error.message)

  await admin
    .from('conversations')
    .update({
      last_message_at: message.created_at,
      last_message_preview: trimmed.slice(0, 100),
    })
    .eq('id', conversationId)

  // Async scam scan — runs after response is sent, never blocks the user
  after(() => scanMessageForScam(message.id, user.id, trimmed))

  return message as Message
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const admin = getServiceClient()
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
    .select('id')
    .or(`participant1_id.eq.${user.id},participant2_id.eq.${user.id}`)

  if (!convos || convos.length === 0) return 0

  const { count } = await admin
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .in('conversation_id', convos.map((c) => c.id))
    .neq('sender_id', user.id)
    .is('read_at', null)

  return count ?? 0
}
