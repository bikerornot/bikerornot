'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const REJECTION_BUCKET = 'moderation-rejections'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    throw new Error('Not authorized')
  }
  return user
}

export interface ModerationRejectionRow {
  id: string
  user_id: string | null
  user_username: string | null
  surface: string
  signed_url: string | null
  content_type: string | null
  byte_size: number | null
  reason: string | null
  scores: Record<string, number> | null
  created_at: string
  expires_at: string
}

export async function listModerationRejections(): Promise<ModerationRejectionRow[]> {
  await requireAdmin()
  const admin = getServiceClient()

  // Lazy purge — sweep anything past its 24h before we list. Cheap and means
  // we never need a separate cron.
  await admin.rpc('purge_expired_moderation_rejections' as any)

  const { data: rows } = await admin
    .from('moderation_rejections')
    .select('id, user_id, surface, storage_path, content_type, byte_size, reason, scores, created_at, expires_at, user:profiles!user_id(username)')
    .order('created_at', { ascending: false })
    .limit(200)

  if (!rows || rows.length === 0) return []

  // Sign each storage object so the admin UI can display it inline. The
  // bucket is private, so the public URL pattern won't work.
  const out: ModerationRejectionRow[] = []
  for (const r of rows as any[]) {
    const { data: signed } = await admin.storage
      .from(REJECTION_BUCKET)
      .createSignedUrl(r.storage_path, 60 * 10) // 10 min — page session
    out.push({
      id: r.id,
      user_id: r.user_id,
      user_username: r.user?.username ?? null,
      surface: r.surface,
      signed_url: signed?.signedUrl ?? null,
      content_type: r.content_type,
      byte_size: r.byte_size,
      reason: r.reason,
      scores: r.scores,
      created_at: r.created_at,
      expires_at: r.expires_at,
    })
  }
  return out
}

// Remove a single rejection NOW (before its 24h expiration). Used when the
// admin has reviewed it and doesn't want it sitting around. Deletes both
// the row and the storage object.
export async function deleteModerationRejection(id: string): Promise<void> {
  await requireAdmin()
  const admin = getServiceClient()

  const { data: row } = await admin
    .from('moderation_rejections')
    .select('storage_path')
    .eq('id', id)
    .single()
  if (row?.storage_path) {
    await admin.storage.from(REJECTION_BUCKET).remove([row.storage_path])
  }
  await admin.from('moderation_rejections').delete().eq('id', id)
}
