'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function blockUser(blockedId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (user.id === blockedId) return { error: 'Cannot block yourself' }

  const admin = getServiceClient()
  const { error } = await admin
    .from('blocks')
    .insert({ blocker_id: user.id, blocked_id: blockedId })

  if (error) {
    if (error.code === '23505') return { error: 'already_blocked' }
    return { error: error.message }
  }
  return {}
}

export async function getBlockedIds(userId: string, admin: any): Promise<Set<string>> {
  const { data } = await admin
    .from('blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`)
  const ids = new Set<string>()
  for (const b of data ?? []) {
    if (b.blocker_id === userId) ids.add(b.blocked_id)
    else ids.add(b.blocker_id)
  }
  return ids
}

export async function unblockUser(blockedId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const admin = getServiceClient()
  await admin
    .from('blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedId)
}
