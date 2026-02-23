'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function sendFriendRequest(addresseeId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  if (user.id === addresseeId) throw new Error('Cannot friend yourself')

  const admin = getServiceClient()
  const { error } = await admin
    .from('friendships')
    .insert({ requester_id: user.id, addressee_id: addresseeId })

  if (error && error.code !== '23505') throw new Error(error.message)
  if (error) return // already exists, skip notification

  await admin.from('notifications').insert({
    user_id: addresseeId,
    type: 'friend_request',
    actor_id: user.id,
  }).catch(() => {})
}

export async function cancelFriendRequest(addresseeId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { error } = await admin
    .from('friendships')
    .delete()
    .eq('requester_id', user.id)
    .eq('addressee_id', addresseeId)
    .eq('status', 'pending')

  if (error) throw new Error(error.message)
}

export async function acceptFriendRequest(requesterId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { error } = await admin
    .from('friendships')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('requester_id', requesterId)
    .eq('addressee_id', user.id)
    .eq('status', 'pending')

  if (error) throw new Error(error.message)

  await admin.from('notifications').insert({
    user_id: requesterId,
    type: 'friend_accepted',
    actor_id: user.id,
  }).catch(() => {})
}

export async function declineFriendRequest(requesterId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { error } = await admin
    .from('friendships')
    .delete()
    .eq('requester_id', requesterId)
    .eq('addressee_id', user.id)
    .eq('status', 'pending')

  if (error) throw new Error(error.message)
}

export async function unfriend(otherUserId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { error } = await admin
    .from('friendships')
    .delete()
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},addressee_id.eq.${user.id})`
    )

  if (error) throw new Error(error.message)
}
