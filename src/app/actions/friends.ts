'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { sendFriendRequestEmail, sendFriendAcceptedEmail } from '@/lib/email'
import { checkRateLimit } from '@/lib/rate-limit'
import { notifyIfActive } from '@/lib/notify'

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

  checkRateLimit(`sendFriendRequest:${user.id}`, 20, 60_000)

  const admin = getServiceClient()

  // Gate 2: New accounts (<7 days) — max 5 friend requests per day
  const { data: senderProfile } = await admin
    .from('profiles').select('created_at').eq('id', user.id).single()
  const accountAgeDays = (Date.now() - new Date(senderProfile!.created_at).getTime()) / 86_400_000
  if (accountAgeDays < 7) {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { count: requestsToday } = await admin
      .from('friendships')
      .select('*', { count: 'exact', head: true })
      .eq('requester_id', user.id)
      .gte('created_at', todayStart.toISOString())
    if ((requestsToday ?? 0) >= 5) {
      throw new Error('New accounts can send up to 5 friend requests per day.')
    }
  }

  const { error } = await admin
    .from('friendships')
    .insert({ requester_id: user.id, addressee_id: addresseeId })

  if (error && error.code !== '23505') throw new Error(error.message)
  if (error) return // already exists, skip notification

  await notifyIfActive(user.id, {
    user_id: addresseeId,
    type: 'friend_request',
    actor_id: user.id,
  })

  // Send email notification (fire and forget)
  const [{ data: requesterProfile }, { data: addresseeAuth }, { data: addresseeProfile }] = await Promise.all([
    admin.from('profiles').select('username, first_name').eq('id', user.id).single(),
    admin.auth.admin.getUserById(addresseeId),
    admin.from('profiles').select('first_name, email_friend_requests').eq('id', addresseeId).single(),
  ])
  const addresseeEmail = addresseeAuth.user?.email
  if (addresseeEmail && requesterProfile?.username && addresseeProfile?.email_friend_requests !== false) {
    sendFriendRequestEmail({
      toEmail: addresseeEmail,
      toName: addresseeProfile?.first_name ?? 'there',
      fromUsername: requesterProfile.username,
    }).catch(() => {})
  }
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
  const { data: updated, error } = await admin
    .from('friendships')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('requester_id', requesterId)
    .eq('addressee_id', user.id)
    .eq('status', 'pending')
    .select('id')

  if (error) throw new Error(error.message)

  // Only notify if we actually transitioned a pending request — prevents
  // duplicate notifications if the request was already accepted.
  if (!updated || updated.length === 0) return

  await notifyIfActive(user.id, {
    user_id: requesterId,
    type: 'friend_accepted',
    actor_id: user.id,
  })

  // Send email notification (fire and forget)
  const [{ data: accepterProfile }, { data: requesterAuth }, { data: requesterProfile }] = await Promise.all([
    admin.from('profiles').select('username, first_name').eq('id', user.id).single(),
    admin.auth.admin.getUserById(requesterId),
    admin.from('profiles').select('first_name, email_friend_accepted').eq('id', requesterId).single(),
  ])
  const requesterEmail = requesterAuth.user?.email
  if (requesterEmail && accepterProfile?.username && requesterProfile?.email_friend_accepted !== false) {
    sendFriendAcceptedEmail({
      toEmail: requesterEmail,
      toName: requesterProfile?.first_name ?? 'there',
      fromUsername: accepterProfile.username,
    }).catch(() => {})
  }
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
