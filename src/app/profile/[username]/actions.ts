'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function uploadProfilePhoto(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const file = formData.get('file') as File
  if (!file) throw new Error('No file provided')

  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${user.id}/avatar.${ext}`

  const admin = getServiceClient()
  const arrayBuffer = await file.arrayBuffer()

  const { error: uploadError } = await admin.storage
    .from('avatars')
    .upload(path, arrayBuffer, { contentType: file.type, upsert: true })

  if (uploadError) throw new Error(uploadError.message)

  const { error: updateError } = await admin
    .from('profiles')
    .update({ profile_photo_url: path })
    .eq('id', user.id)

  if (updateError) throw new Error(updateError.message)
}

export async function uploadCoverPhoto(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const file = formData.get('file') as File
  if (!file) throw new Error('No file provided')

  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${user.id}/cover.${ext}`

  const admin = getServiceClient()
  const arrayBuffer = await file.arrayBuffer()

  const { error: uploadError } = await admin.storage
    .from('covers')
    .upload(path, arrayBuffer, { contentType: file.type, upsert: true })

  if (uploadError) throw new Error(uploadError.message)

  const { error: updateError } = await admin
    .from('profiles')
    .update({ cover_photo_url: path })
    .eq('id', user.id)

  if (updateError) throw new Error(updateError.message)
}
