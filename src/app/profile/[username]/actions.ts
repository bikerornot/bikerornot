'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { moderateImage } from '@/lib/sightengine'
import { validateImageFile } from '@/lib/rate-limit'
import { detectWebPresence } from '@/lib/google-vision'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function uploadProfilePhoto(formData: FormData): Promise<{ error: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const file = formData.get('file') as File
  if (!file) throw new Error('No file provided')
  validateImageFile(file)

  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${user.id}/avatar.${ext}`

  const admin = getServiceClient()
  const arrayBuffer = await file.arrayBuffer()

  // Moderate before storing
  const moderation = await moderateImage(arrayBuffer, file.type)
  if (moderation === 'rejected') {
    return { error: 'This image was rejected by our content filter. Please choose a different photo.' }
  }

  const { error: uploadError } = await admin.storage
    .from('avatars')
    .upload(path, arrayBuffer, { contentType: file.type, upsert: true })

  if (uploadError) throw new Error(uploadError.message)

  // Auto-approve if SightEngine approved; leave null for borderline (admin review for pornography)
  const reviewedAt = moderation === 'approved' ? new Date().toISOString() : null

  const { error: updateError } = await admin
    .from('profiles')
    .update({
      profile_photo_url: path,
      avatar_reviewed_at: reviewedAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (updateError) throw new Error(updateError.message)

  // Run Google Vision web detection in background (fire-and-forget)
  // If the image appears on other sites, force into review queue
  detectWebPresence(arrayBuffer, file.type)
    .then(async (result) => {
      if (!result) return
      const update: Record<string, unknown> = { avatar_web_detection: result }
      // If image found on other sites, force admin review regardless of SightEngine result
      if (result.isSuspicious) update.avatar_reviewed_at = null
      await admin.from('profiles').update(update).eq('id', user.id)
    })
    .catch(() => {})

  return null
}

export async function uploadCoverPhoto(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const file = formData.get('file') as File
  if (!file) throw new Error('No file provided')
  validateImageFile(file)

  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${user.id}/cover.${ext}`

  const admin = getServiceClient()
  const arrayBuffer = await file.arrayBuffer()

  // Moderate before storing
  const moderation = await moderateImage(arrayBuffer, file.type)
  if (moderation === 'rejected') {
    throw new Error('This image was rejected by our content filter. Please choose a different photo.')
  }

  const { error: uploadError } = await admin.storage
    .from('covers')
    .upload(path, arrayBuffer, { contentType: file.type, upsert: true })

  if (uploadError) throw new Error(uploadError.message)

  const { error: updateError } = await admin
    .from('profiles')
    .update({ cover_photo_url: path, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (updateError) throw new Error(updateError.message)
}
