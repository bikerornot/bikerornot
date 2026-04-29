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
    .is('restored_at', null)
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

// Approve a rejected image — admin override for false positives. Hashes
// the file bytes and adds them to moderation_image_allowlist so a future
// upload of the exact same bytes bypasses sightengine. Marks the rejection
// as restored so it drops off the queue. The user still has to re-upload —
// we can't fabricate the original post / profile photo / event flyer they
// were trying to create.
export async function approveModerationRejection(id: string): Promise<{ ok: true } | { error: string }> {
  const adminUser = await requireAdmin()
  const admin = getServiceClient()

  const { data: row } = await admin
    .from('moderation_rejections')
    .select('storage_path')
    .eq('id', id)
    .single()
  if (!row?.storage_path) return { error: 'Rejection row not found' }

  // Pull the bytes back from the private bucket and hash them.
  const { data: blob, error: downloadErr } = await admin.storage
    .from(REJECTION_BUCKET)
    .download(row.storage_path)
  if (downloadErr || !blob) return { error: `Could not read image: ${downloadErr?.message ?? 'missing'}` }
  const bytes = await blob.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')

  // Upsert allowlist entry. Multiple rejections of the same image (rare
  // but possible) just overwrite the metadata.
  await admin.from('moderation_image_allowlist').upsert(
    {
      hash,
      approved_by: adminUser.id,
      source_rejection_id: id,
    },
    { onConflict: 'hash' },
  )

  await admin
    .from('moderation_rejections')
    .update({ restored_at: new Date().toISOString(), restored_by: adminUser.id })
    .eq('id', id)

  return { ok: true }
}

// Admin tester: upload an image and see what sightengine returns. If it's
// rejected, moderateAndLog stashes it in the rejections queue automatically
// so the admin can review side-by-side with real user-uploaded rejections.
// Approved / pending results just return inline without logging.
export interface ModerationTestResult {
  verdict: 'approved' | 'pending' | 'rejected'
  reason: string | null
  scores: Record<string, number> | null
}

export async function testImageModeration(formData: FormData): Promise<ModerationTestResult | { error: string }> {
  const adminUser = await requireAdmin()
  const file = formData.get('file') as File | null
  if (!file || !(file instanceof File) || file.size === 0) {
    return { error: 'No file provided' }
  }
  if (file.size > 10 * 1024 * 1024) {
    return { error: 'File too large (10 MB max)' }
  }
  if (!file.type.startsWith('image/')) {
    return { error: 'Not an image' }
  }

  const { moderateAndLog } = await import('@/lib/moderation-rejections')
  const bytes = await file.arrayBuffer()
  const result = await moderateAndLog(bytes, file.type, 'admin_test', adminUser.id)
  return {
    verdict: result.verdict,
    reason: result.reason,
    scores: result.scores ? (result.scores as unknown as Record<string, number>) : null,
  }
}
