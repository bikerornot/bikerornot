'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { validateImageFile } from '@/lib/rate-limit'
import { moderateImage } from '@/lib/sightengine'
import { normalizeMake } from '@/lib/normalize-make'
import type { BikePhoto } from '@/lib/supabase/types'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const CURRENT_YEAR = new Date().getFullYear()

function validateBikeFields(year: number, make: string, model: string) {
  if (!Number.isInteger(year) || year < 1885 || year > CURRENT_YEAR + 2) throw new Error('Invalid year')
  if (!make.trim() || make.length > 100) throw new Error('Invalid make')
  if (!model.trim() || model.length > 100) throw new Error('Invalid model')
}

export async function addBike(year: number, make: string, model: string): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const canonicalMake = normalizeMake(make)
  validateBikeFields(year, canonicalMake, model)

  const admin = getServiceClient()
  const { data, error } = await admin
    .from('user_bikes')
    .insert({ user_id: user.id, year, make: canonicalMake, model })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  // Create a feed story so friends see the new bike
  const bikeName = `${year} ${canonicalMake} ${model}`
  await admin.from('posts').insert({
    author_id: user.id,
    content: `Added a ${bikeName} to my garage! 🏍️`,
  })

  return data.id
}

export async function updateBike(id: string, year: number, make: string, model: string, description?: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const canonicalMake = normalizeMake(make)
  validateBikeFields(year, canonicalMake, model)

  const trimmed = description?.trim() || null
  if (trimmed && trimmed.length > 2000) throw new Error('Description must be under 2000 characters')

  const admin = getServiceClient()
  const { error } = await admin
    .from('user_bikes')
    .update({ year, make: canonicalMake, model, description: trimmed })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
}

export async function deleteBike(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { error } = await admin
    .from('user_bikes')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)
}

export async function uploadBikePhoto(bikeId: string, formData: FormData): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const file = formData.get('file') as File
  if (!file) throw new Error('No file provided')
  validateImageFile(file)

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${user.id}/${bikeId}.${ext}`
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const moderation = await moderateImage(arrayBuffer, file.type)
  if (moderation === 'rejected') throw new Error('This image was rejected by our content filter. Please choose a different photo.')

  const admin = getServiceClient()
  const { error: uploadError } = await admin.storage
    .from('bikes')
    .upload(path, buffer, { contentType: file.type, upsert: true })
  if (uploadError) throw new Error(uploadError.message)

  const { error: updateError } = await admin
    .from('user_bikes')
    .update({ photo_url: path })
    .eq('id', bikeId)
    .eq('user_id', user.id)
  if (updateError) throw new Error(updateError.message)

  // Sync bike_photos table — upsert the primary photo
  const { data: existing } = await admin
    .from('bike_photos')
    .select('id')
    .eq('bike_id', bikeId)
    .eq('is_primary', true)
    .single()

  if (existing) {
    await admin.from('bike_photos').update({ storage_path: path }).eq('id', existing.id)
  } else {
    await admin.from('bike_photos').insert({
      bike_id: bikeId,
      user_id: user.id,
      storage_path: path,
      is_primary: true,
    })
  }

  return path
}

// ── Bike Gallery Photo actions ─────────────────────────────────────────────────

export async function getBikePhotos(bikeId: string): Promise<BikePhoto[]> {
  const admin = getServiceClient()
  const { data, error } = await admin
    .from('bike_photos')
    .select('*')
    .eq('bike_id', bikeId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as BikePhoto[]
}

export async function uploadBikeGalleryPhoto(bikeId: string, formData: FormData): Promise<BikePhoto> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Verify ownership
  const admin = getServiceClient()
  const { data: bike } = await admin
    .from('user_bikes')
    .select('id')
    .eq('id', bikeId)
    .eq('user_id', user.id)
    .single()
  if (!bike) throw new Error('Bike not found or not owned by you')

  const file = formData.get('file') as File
  if (!file) throw new Error('No file provided')
  validateImageFile(file)

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const photoId = crypto.randomUUID()
  const path = `${user.id}/${bikeId}/${photoId}.${ext}`
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const moderation = await moderateImage(arrayBuffer, file.type)
  if (moderation === 'rejected') throw new Error('This image was rejected by our content filter. Please choose a different photo.')

  const { error: uploadError } = await admin.storage
    .from('bikes')
    .upload(path, buffer, { contentType: file.type })
  if (uploadError) throw new Error(uploadError.message)

  // Check if this is the first photo for auto-primary
  const { count } = await admin
    .from('bike_photos')
    .select('*', { count: 'exact', head: true })
    .eq('bike_id', bikeId)
  const isFirst = (count ?? 0) === 0

  const { data: photo, error: insertError } = await admin
    .from('bike_photos')
    .insert({
      bike_id: bikeId,
      user_id: user.id,
      storage_path: path,
      is_primary: isFirst,
    })
    .select()
    .single()
  if (insertError) throw new Error(insertError.message)

  // If first photo, also set as user_bikes.photo_url
  if (isFirst) {
    await admin.from('user_bikes').update({ photo_url: path }).eq('id', bikeId)
  }

  return photo as BikePhoto
}

export async function deleteBikePhoto(photoId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { data: photo } = await admin
    .from('bike_photos')
    .select('*')
    .eq('id', photoId)
    .eq('user_id', user.id)
    .single()
  if (!photo) throw new Error('Photo not found')

  // Delete from storage
  await admin.storage.from('bikes').remove([photo.storage_path])

  // Delete from DB
  await admin.from('bike_photos').delete().eq('id', photoId)

  // If this was the primary, promote the next photo
  if (photo.is_primary) {
    const { data: next } = await admin
      .from('bike_photos')
      .select('id, storage_path')
      .eq('bike_id', photo.bike_id)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (next) {
      await admin.from('bike_photos').update({ is_primary: true }).eq('id', next.id)
      await admin.from('user_bikes').update({ photo_url: next.storage_path }).eq('id', photo.bike_id)
    } else {
      // No photos left
      await admin.from('user_bikes').update({ photo_url: null }).eq('id', photo.bike_id)
    }
  }
}

export async function setBikePrimaryPhoto(photoId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { data: photo } = await admin
    .from('bike_photos')
    .select('bike_id, storage_path')
    .eq('id', photoId)
    .eq('user_id', user.id)
    .single()
  if (!photo) throw new Error('Photo not found')

  // Unset current primary
  await admin
    .from('bike_photos')
    .update({ is_primary: false })
    .eq('bike_id', photo.bike_id)
    .eq('is_primary', true)

  // Set new primary
  await admin.from('bike_photos').update({ is_primary: true }).eq('id', photoId)

  // Sync user_bikes.photo_url
  await admin.from('user_bikes').update({ photo_url: photo.storage_path }).eq('id', photo.bike_id)
}
