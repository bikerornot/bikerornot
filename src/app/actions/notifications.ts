'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { Notification } from '@/lib/supabase/types'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function getNotifications(): Promise<Notification[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const admin = getServiceClient()
  const { data } = await admin
    .from('notifications')
    .select('*, actor:profiles!actor_id(*), group:groups!group_id(id, name, slug)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30)

  return (data ?? []).filter((n: any) => n.actor?.status === 'active') as Notification[]
}

export async function markRead(notificationId: string): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const admin = getServiceClient()
  await admin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', user.id) // safety: only mark your own
}

export async function markAllRead(): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const admin = getServiceClient()
  await admin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null)
}
