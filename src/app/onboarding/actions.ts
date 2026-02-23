'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { geocodeZip } from '@/lib/geocode'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function uploadAvatar(formData: FormData): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const file = formData.get('file') as File
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${user.id}/avatar.${ext}`

  const admin = getServiceClient()
  const arrayBuffer = await file.arrayBuffer()
  const { error } = await admin.storage
    .from('avatars')
    .upload(path, arrayBuffer, { contentType: file.type, upsert: true })

  if (error) throw error
  return path
}

export async function completeOnboarding(
  username: string,
  photoPath: string | null,
  bikes: Array<{ year: number; make: string; model: string }>
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  const { error: profileError } = await admin
    .from('profiles')
    .update({
      username,
      display_name: username,
      ...(photoPath ? { profile_photo_url: photoPath } : {}),
      onboarding_complete: true,
    })
    .eq('id', user.id)

  if (profileError) {
    if (profileError.code === '23505') throw new Error('USERNAME_TAKEN')
    throw new Error(profileError.message)
  }

  // Geocode zip and store coordinates + city; also store gender from signup metadata
  const zipCode = user.user_metadata?.zip_code as string | undefined
  const gender = user.user_metadata?.gender as string | undefined
  const geoUpdate: Record<string, unknown> = {}
  if (gender) geoUpdate.gender = gender
  if (zipCode) {
    const geo = await geocodeZip(zipCode)
    if (geo) {
      geoUpdate.latitude = geo.lat
      geoUpdate.longitude = geo.lng
      geoUpdate.city = geo.city
      geoUpdate.state = geo.state
    }
  }
  if (Object.keys(geoUpdate).length > 0) {
    await admin.from('profiles').update(geoUpdate).eq('id', user.id)
  }

  if (bikes.length > 0) {
    const { error: bikesError } = await admin
      .from('user_bikes')
      .insert(bikes.map((b) => ({ ...b, user_id: user.id })))
    if (bikesError) throw new Error(bikesError.message)
  }

  return { username }
}
