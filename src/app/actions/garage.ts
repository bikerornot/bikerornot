'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { validateImageFile } from '@/lib/rate-limit'
import { moderateAndLog } from '@/lib/moderation-rejections'
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

/**
 * Find the "Added a bike to my garage" feed post and attach a photo to it.
 * Only attaches if the post exists and has no images yet.
 */
async function attachPhotoToGaragePost(
  admin: ReturnType<typeof getServiceClient>,
  userId: string,
  bikeId: string,
  imageBuffer: Buffer,
  contentType: string,
) {
  // Get bike info to match the announcement text
  const { data: bike } = await admin
    .from('user_bikes')
    .select('year, make, model')
    .eq('id', bikeId)
    .single()
  if (!bike) return

  const bikeName = `${bike.year} ${bike.make} ${bike.model}`
  const contentPrefix = `Added a ${bikeName} to my garage! 🏍️`

  // Find the announcement post (created within last 24h, no bike_id, matching content)
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: post } = await admin
    .from('posts')
    .select('id')
    .eq('author_id', userId)
    .like('content', `${contentPrefix}%`)
    .is('bike_id', null)
    .gte('created_at', dayAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!post) return

  // Check if already has images
  const { count } = await admin
    .from('post_images')
    .select('*', { count: 'exact', head: true })
    .eq('post_id', post.id)
  if ((count ?? 0) > 0) return

  // Upload a copy to the posts bucket
  const ext = contentType.split('/')[1] ?? 'jpg'
  const postImagePath = `${userId}/${post.id}/0.${ext}`
  await admin.storage
    .from('posts')
    .upload(postImagePath, imageBuffer, { contentType, upsert: true })

  // Insert post_images row
  await admin.from('post_images').insert({
    post_id: post.id,
    storage_path: postImagePath,
    order_index: 0,
  })
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

  // Create a feed story so friends see the new bike (no bike_id so it appears in main feed)
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
  await validateImageFile(file)

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${user.id}/${bikeId}.${ext}`
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { verdict } = await moderateAndLog(arrayBuffer, file.type, 'bike_photo', user.id)
  if (verdict === 'rejected') throw new Error('This image was rejected by our content filter. Please choose a different photo.')

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

  // Attach photo to the "Added a bike" feed story if it exists and has no images yet
  await attachPhotoToGaragePost(admin, user.id, bikeId, buffer, file.type)

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
  await validateImageFile(file)

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const photoId = crypto.randomUUID()
  const path = `${user.id}/${bikeId}/${photoId}.${ext}`
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { verdict } = await moderateAndLog(arrayBuffer, file.type, 'bike_photo', user.id)
  if (verdict === 'rejected') throw new Error('This image was rejected by our content filter. Please choose a different photo.')

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

  // If first photo, also set as user_bikes.photo_url and attach to feed story
  if (isFirst) {
    await admin.from('user_bikes').update({ photo_url: path }).eq('id', bikeId)
    await attachPhotoToGaragePost(admin, user.id, bikeId, buffer, file.type)
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

  // Delete from DB first. game_answers.bike_photo_id references this row
  // with no ON DELETE rule, so a photo that's ever appeared in the
  // guess-the-bike game can't be hard-deleted. We need to fail loud here
  // and bail BEFORE touching storage — otherwise the file gets removed
  // but the row stays, and the bike page renders a broken image.
  // Soft-delete the row instead in that case so the photo stops showing
  // up in feeds/garage but game history keeps its FK.
  const { error: dbDeleteError } = await admin.from('bike_photos').delete().eq('id', photoId)
  if (dbDeleteError) {
    if (dbDeleteError.code === '23503') {
      // FK violation — photo is referenced by game_answers. Soft-delete
      // instead: mark non-primary and game_approved=false so the bike
      // detail page filter hides it.
      await admin
        .from('bike_photos')
        .update({
          is_primary: false,
          game_approved: false,
          game_reviewed_at: new Date().toISOString(),
        })
        .eq('id', photoId)
      // Storage file can still be removed — nothing in the DB will
      // resolve to it after the soft-delete above.
      await admin.storage.from('bikes').remove([photo.storage_path])
    } else {
      throw new Error(dbDeleteError.message)
    }
  } else {
    // Hard-delete succeeded; clean up the file.
    await admin.storage.from('bikes').remove([photo.storage_path])
  }

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
