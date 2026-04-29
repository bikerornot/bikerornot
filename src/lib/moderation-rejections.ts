import 'server-only'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { moderateImageDetailed, type ModerationDetails } from './sightengine'

// Surfaces a moderation rejection can come from. Used to label rows in
// the admin queue so you can tell whether the false positive was on a
// post photo, a profile avatar, an event flyer, etc.
export type ModerationSurface =
  | 'post'
  | 'avatar'
  | 'bike_photo'
  | 'event_flyer'
  | 'group_cover'
  | 'classifieds'
  | 'admin_test'

const REJECTION_BUCKET = 'moderation-rejections'

function admin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Inspect the image with sightengine and, when the result is a rejection,
// stash the bytes in a private bucket + log metadata in moderation_rejections
// for 24-hour admin review. Returns the moderation details so callers can
// continue with the existing approve / pending / reject branching.
//
// Failures here MUST NOT block the upload pipeline: if logging fails for any
// reason we fall back to the verdict alone, matching the prior behavior.
async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function moderateAndLog(
  bytes: ArrayBuffer,
  contentType: string,
  surface: ModerationSurface,
  userId: string | null,
): Promise<ModerationDetails> {
  // Admin-approved images get an allowlist entry by hash. If the user
  // re-uploads the exact same bytes, skip sightengine entirely so the
  // false positive doesn't loop.
  let hash: string | null = null
  try {
    hash = await sha256Hex(bytes)
    const a = admin()
    const { data: allowed } = await a
      .from('moderation_image_allowlist')
      .select('hash')
      .eq('hash', hash)
      .maybeSingle()
    if (allowed) {
      return { verdict: 'approved', reason: 'admin_allowlist', scores: null }
    }
  } catch {
    // Hashing failure is non-fatal — fall through to normal moderation
  }

  const result = await moderateImageDetailed(bytes, contentType)
  if (result.verdict !== 'rejected') return result

  try {
    const ext = contentType.includes('png') ? 'png'
      : contentType.includes('webp') ? 'webp'
      : contentType.includes('gif') ? 'gif'
      : 'jpg'
    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`

    const a = admin()
    const { error: uploadError } = await a.storage
      .from(REJECTION_BUCKET)
      .upload(path, new Blob([bytes], { type: contentType }), {
        contentType,
        upsert: false,
      })
    if (uploadError) {
      console.warn('[mod-rejection] upload failed', uploadError.message)
      return result
    }

    await a.from('moderation_rejections').insert({
      user_id: userId,
      surface,
      storage_path: path,
      content_type: contentType,
      byte_size: bytes.byteLength,
      reason: result.reason,
      scores: result.scores,
    })
  } catch (err) {
    console.warn('[mod-rejection] logging failed', err)
  }

  return result
}
