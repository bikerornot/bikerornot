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

export interface BlockedProfile {
  id: string
  username: string | null
  first_name: string | null
  last_name: string | null
  profile_photo_url: string | null
  blocked_at: string
}

export async function getMyBlockedUsers(): Promise<BlockedProfile[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = getServiceClient()
  const { data } = await admin
    .from('blocks')
    .select('blocked_id, created_at, blocked:profiles!blocked_id(id, username, first_name, last_name, profile_photo_url)')
    .eq('blocker_id', user.id)
    .order('created_at', { ascending: false })

  return (data ?? [])
    .filter((row: any) => row.blocked)
    .map((row: any) => ({
      id: row.blocked.id,
      username: row.blocked.username,
      first_name: row.blocked.first_name,
      last_name: row.blocked.last_name,
      profile_photo_url: row.blocked.profile_photo_url,
      blocked_at: row.created_at,
    }))
}
