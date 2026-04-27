'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { geocodeZip } from '@/lib/geocode'
import { validateImageFile, checkRateLimit } from '@/lib/rate-limit'
import { moderateAndLog } from '@/lib/moderation-rejections'
import { detectBikeCategory } from '@/lib/bike-category'
import type {
  Listing,
  ListingImage,
  ListingSearchResult,
  ListingDetail,
  MyListing,
  ListingCategory,
  ListingCondition,
  PriceType,
  ClassifiedsSearchFilters,
} from '@/lib/supabase/types'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// -----------------------------------------------------------------
// CREATE LISTING (draft)
// -----------------------------------------------------------------
export async function createListing(data: {
  category: ListingCategory
  year: number
  make: string
  model: string
  trim?: string
  color?: string
  condition: ListingCondition
  mileage?: number
  vin?: string
  modifications?: string
  title: string
  description?: string
  price?: number | null
  price_type: PriceType
  trade_considered: boolean
  zip_code: string
  show_phone: boolean
  user_bike_id?: string | null
}): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Validate
  if (!data.title?.trim() || data.title.trim().length < 5) throw new Error('Title must be at least 5 characters')
  if (data.title.trim().length > 100) throw new Error('Title must be under 100 characters')
  if (data.description && data.description.length > 5000) throw new Error('Description must be under 5000 characters')
  if (data.vin && data.vin.length !== 17) throw new Error('VIN must be exactly 17 characters')
  if (!data.zip_code?.trim()) throw new Error('Zip code is required')

  // Geocode
  let city: string | null = null
  let state: string | null = null
  let latitude: number | null = null
  let longitude: number | null = null
  const geo = await geocodeZip(data.zip_code.trim())
  if (geo) {
    city = geo.city
    state = geo.state
    latitude = geo.lat
    longitude = geo.lng
  }

  const admin = getServiceClient()

  // If no garage bike linked, auto-add to garage
  let userBikeId = data.user_bike_id || null
  if (!userBikeId) {
    const { data: newBike } = await admin.from('user_bikes').insert({
      user_id: user.id,
      year: data.year,
      make: data.make.trim(),
      model: data.model.trim(),
    }).select('id').single()
    if (newBike) userBikeId = newBike.id
  }

  const { data: listing, error } = await admin.from('listings').insert({
    seller_id: user.id,
    user_bike_id: userBikeId,
    status: 'draft',
    category: data.category,
    year: data.year,
    make: data.make.trim(),
    model: data.model.trim(),
    trim: data.trim?.trim() || null,
    color: data.color?.trim() || null,
    condition: data.condition,
    mileage: data.mileage ?? null,
    vin: data.vin?.trim().toUpperCase() || null,
    modifications: data.modifications?.trim() || null,
    title: data.title.trim(),
    description: data.description?.trim() || null,
    price: data.price ?? null,
    price_type: data.price_type,
    trade_considered: data.trade_considered,
    zip_code: data.zip_code.trim(),
    city,
    state,
    latitude,
    longitude,
    show_phone: data.show_phone,
  }).select('id').single()

  if (error) throw new Error('Failed to create listing')

  // If garage bike has a photo, copy it as the first listing image
  if (userBikeId) {
    const { data: bike } = await admin.from('user_bikes')
      .select('photo_url')
      .eq('id', userBikeId)
      .single()

    if (bike?.photo_url) {
      try {
        // Download from bikes bucket
        const { data: fileData } = await admin.storage
          .from('bikes')
          .download(bike.photo_url)

        if (fileData) {
          // Upload to classifieds bucket
          const ext = bike.photo_url.split('.').pop() || 'jpg'
          const storagePath = `${listing.id}/${crypto.randomUUID()}.${ext}`
          const { error: uploadErr } = await admin.storage
            .from('classifieds')
            .upload(storagePath, fileData, { contentType: fileData.type || 'image/jpeg' })

          if (!uploadErr) {
            await admin.from('listing_images').insert({
              listing_id: listing.id,
              storage_path: storagePath,
              order_index: 0,
            })
          }
        }
      } catch {
        // Non-fatal — user can still add photos manually
      }
    }
  }

  return { id: listing.id }
}

// -----------------------------------------------------------------
// UPDATE LISTING
// -----------------------------------------------------------------
export async function updateListing(listingId: string, data: {
  category?: ListingCategory
  year?: number
  make?: string
  model?: string
  trim?: string | null
  color?: string | null
  condition?: ListingCondition
  mileage?: number | null
  vin?: string | null
  modifications?: string | null
  title?: string
  description?: string | null
  price?: number | null
  price_type?: PriceType
  trade_considered?: boolean
  zip_code?: string
  show_phone?: boolean
}): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  // Verify ownership
  const { data: existing } = await admin.from('listings')
    .select('seller_id, zip_code')
    .eq('id', listingId)
    .is('deleted_at', null)
    .single()
  if (!existing || existing.seller_id !== user.id) throw new Error('Listing not found')

  if (data.title !== undefined) {
    if (!data.title.trim() || data.title.trim().length < 5) throw new Error('Title must be at least 5 characters')
    if (data.title.trim().length > 100) throw new Error('Title must be under 100 characters')
  }
  if (data.description && data.description.length > 5000) throw new Error('Description must be under 5000 characters')
  if (data.vin !== undefined && data.vin !== null && data.vin.length > 0 && data.vin.length !== 17) throw new Error('VIN must be exactly 17 characters')

  const updates: Record<string, unknown> = {}
  if (data.category !== undefined) updates.category = data.category
  if (data.year !== undefined) updates.year = data.year
  if (data.make !== undefined) updates.make = data.make.trim()
  if (data.model !== undefined) updates.model = data.model.trim()
  if (data.trim !== undefined) updates.trim = data.trim?.trim() || null
  if (data.color !== undefined) updates.color = data.color?.trim() || null
  if (data.condition !== undefined) updates.condition = data.condition
  if (data.mileage !== undefined) updates.mileage = data.mileage
  if (data.vin !== undefined) updates.vin = data.vin?.trim().toUpperCase() || null
  if (data.modifications !== undefined) updates.modifications = data.modifications?.trim() || null
  if (data.title !== undefined) updates.title = data.title.trim()
  if (data.description !== undefined) updates.description = data.description?.trim() || null
  if (data.price !== undefined) updates.price = data.price
  if (data.price_type !== undefined) updates.price_type = data.price_type
  if (data.trade_considered !== undefined) updates.trade_considered = data.trade_considered
  if (data.show_phone !== undefined) updates.show_phone = data.show_phone

  // Re-geocode if zip changed
  if (data.zip_code !== undefined && data.zip_code !== existing.zip_code) {
    updates.zip_code = data.zip_code.trim()
    const geo = await geocodeZip(data.zip_code.trim())
    if (geo) {
      updates.city = geo.city
      updates.state = geo.state
      updates.latitude = geo.lat
      updates.longitude = geo.lng
    }
  }

  if (Object.keys(updates).length === 0) return

  const { error } = await admin.from('listings').update(updates).eq('id', listingId)
  if (error) throw new Error('Failed to update listing')
}

// -----------------------------------------------------------------
// PUBLISH LISTING
// -----------------------------------------------------------------
export async function publishListing(listingId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  // Check SMS verification
  const { data: profile } = await admin.from('profiles')
    .select('phone_verified_at')
    .eq('id', user.id)
    .single()
  if (!profile?.phone_verified_at) throw new Error('Phone verification required to publish listings')

  // Verify ownership and check it has images
  const { data: listing } = await admin.from('listings')
    .select('seller_id, status, year, make, model, price, price_type')
    .eq('id', listingId)
    .is('deleted_at', null)
    .single()
  if (!listing || listing.seller_id !== user.id) throw new Error('Listing not found')
  if (listing.status !== 'draft') throw new Error('Only draft listings can be published')

  const { count: imageCount } = await admin.from('listing_images')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', listingId)
  if (!imageCount || imageCount < 1) throw new Error('At least one photo is required')

  // Enforce 3-listing limit
  const { count: activeCount } = await admin.from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('seller_id', user.id)
    .eq('status', 'active')
    .neq('id', listingId)
  if (activeCount !== null && activeCount >= 3) {
    throw new Error('You already have 3 active listings. Mark one as sold or delete it first.')
  }

  const { error } = await admin.from('listings').update({
    status: 'active',
    published_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  }).eq('id', listingId)
  if (error) throw new Error('Failed to publish listing')

  // Create feed story with the first listing image
  const bikeName = `${listing.year} ${listing.make} ${listing.model}`
  const priceStr = listing.price != null
    ? listing.price_type === 'obo'
      ? `$${listing.price.toLocaleString()} OBO`
      : `$${listing.price.toLocaleString()}`
    : ''
  const priceNote = priceStr ? ` — ${priceStr}` : ''

  const { data: post } = await admin.from('posts').insert({
    author_id: user.id,
    content: `Listed my ${bikeName} for sale${priceNote}\n\nhttps://bikerornot.com/classifieds/${listingId}`,
  }).select('id').single()

  // Attach the first listing image to the feed post
  if (post) {
    const { data: firstImage } = await admin.from('listing_images')
      .select('storage_path')
      .eq('listing_id', listingId)
      .order('order_index', { ascending: true })
      .limit(1)
      .single()

    if (firstImage) {
      // Copy from classifieds bucket to posts bucket
      const { data: fileData } = await admin.storage
        .from('classifieds')
        .download(firstImage.storage_path)

      if (fileData) {
        const ext = firstImage.storage_path.split('.').pop() ?? 'jpg'
        const postImagePath = `${user.id}/${post.id}/0.${ext}`
        await admin.storage
          .from('posts')
          .upload(postImagePath, fileData, { contentType: `image/${ext}`, upsert: true })

        await admin.from('post_images').insert({
          post_id: post.id,
          storage_path: postImagePath,
          order_index: 0,
        })
      }
    }
  }
}

// -----------------------------------------------------------------
// MARK AS SOLD
// -----------------------------------------------------------------
export async function markAsSold(listingId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { data: listing } = await admin.from('listings')
    .select('seller_id, status')
    .eq('id', listingId)
    .single()
  if (!listing || listing.seller_id !== user.id) throw new Error('Listing not found')
  if (listing.status !== 'active') throw new Error('Only active listings can be marked as sold')

  await admin.from('listings').update({
    status: 'sold',
    sold_at: new Date().toISOString(),
  }).eq('id', listingId)
}

// -----------------------------------------------------------------
// DEACTIVATE LISTING (pause — hides from search, freezes expiry timer)
// -----------------------------------------------------------------
export async function deactivateListing(listingId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { data: listing } = await admin.from('listings')
    .select('seller_id, status, expires_at')
    .eq('id', listingId)
    .single()
  if (!listing || listing.seller_id !== user.id) throw new Error('Listing not found')
  if (listing.status !== 'active') throw new Error('Only active listings can be deactivated')

  // Store remaining days so we can restore them on reactivation
  let remainingDays: number | null = null
  if (listing.expires_at) {
    remainingDays = Math.max(0, Math.ceil((new Date(listing.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
  }

  const { error } = await admin.from('listings').update({
    status: 'inactive',
    deactivated_at: new Date().toISOString(),
    remaining_days: remainingDays,
  }).eq('id', listingId)
  if (error) throw new Error(`Failed to deactivate listing: ${error.message}`)
}

// -----------------------------------------------------------------
// REACTIVATE LISTING (resume — back to active, restores expiry timer)
// -----------------------------------------------------------------
export async function reactivateListing(listingId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { data: listing } = await admin.from('listings')
    .select('seller_id, status, remaining_days')
    .eq('id', listingId)
    .single()
  if (!listing || listing.seller_id !== user.id) throw new Error('Listing not found')
  if (listing.status !== 'inactive') throw new Error('Only inactive listings can be reactivated')

  // Enforce 3-listing limit
  const { count: activeCount } = await admin.from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('seller_id', user.id)
    .eq('status', 'active')
  if (activeCount !== null && activeCount >= 3) {
    throw new Error('You already have 3 active listings. Mark one as sold or deactivate it first.')
  }

  // Restore expiry from remaining days
  const days = listing.remaining_days ?? 90
  const newExpiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

  await admin.from('listings').update({
    status: 'active',
    expires_at: newExpiry,
    deactivated_at: null,
    remaining_days: null,
  }).eq('id', listingId)
}

// -----------------------------------------------------------------
// DELETE LISTING (soft delete)
// -----------------------------------------------------------------
export async function deleteListing(listingId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { data: listing } = await admin.from('listings')
    .select('seller_id')
    .eq('id', listingId)
    .single()
  if (!listing || listing.seller_id !== user.id) throw new Error('Listing not found')

  await admin.from('listings').update({
    deleted_at: new Date().toISOString(),
    status: 'removed',
  }).eq('id', listingId)
}

// -----------------------------------------------------------------
// RENEW LISTING
// -----------------------------------------------------------------
export async function renewListing(listingId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { data: listing } = await admin.from('listings')
    .select('seller_id, status')
    .eq('id', listingId)
    .single()
  if (!listing || listing.seller_id !== user.id) throw new Error('Listing not found')
  if (!['active', 'expired'].includes(listing.status)) throw new Error('Listing cannot be renewed')

  await admin.from('listings').update({
    status: 'active',
    expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    renewal_email_sent_at: null,
  }).eq('id', listingId)
}

// -----------------------------------------------------------------
// UPLOAD LISTING IMAGES
// -----------------------------------------------------------------
export async function uploadListingImages(
  listingId: string,
  formData: FormData
): Promise<ListingImage[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  // Verify ownership
  const { data: listing } = await admin.from('listings')
    .select('seller_id')
    .eq('id', listingId)
    .is('deleted_at', null)
    .single()
  if (!listing || listing.seller_id !== user.id) throw new Error('Listing not found')

  // Check current image count
  const { count: currentCount } = await admin.from('listing_images')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', listingId)

  const files = formData.getAll('images') as File[]
  if (!files.length) throw new Error('No images provided')
  if ((currentCount ?? 0) + files.length > 24) throw new Error('Maximum 24 images per listing')

  const uploaded: ListingImage[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    await validateImageFile(file)

    // Read bytes for moderation
    const bytes = await file.arrayBuffer()
    const { verdict } = await moderateAndLog(bytes, file.type, 'classifieds', user.id)
    if (verdict === 'rejected') throw new Error('Image rejected by content moderation')

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const storagePath = `${user.id}/${listingId}/${crypto.randomUUID()}.${ext}`

    const { error: uploadError } = await admin.storage
      .from('classifieds')
      .upload(storagePath, bytes, { contentType: file.type })
    if (uploadError) throw new Error('Failed to upload image')

    const orderIndex = (currentCount ?? 0) + i
    const { data: img, error: insertError } = await admin.from('listing_images').insert({
      listing_id: listingId,
      storage_path: storagePath,
      order_index: orderIndex,
    }).select().single()
    if (insertError) throw new Error('Failed to save image record')

    uploaded.push(img)
  }

  return uploaded
}

// -----------------------------------------------------------------
// DELETE LISTING IMAGE
// -----------------------------------------------------------------
export async function deleteListingImage(imageId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  const { data: image } = await admin.from('listing_images')
    .select('id, listing_id, storage_path, listings!inner(seller_id)')
    .eq('id', imageId)
    .single()

  if (!image || (image as any).listings?.seller_id !== user.id) throw new Error('Image not found')

  await admin.storage.from('classifieds').remove([image.storage_path])
  await admin.from('listing_images').delete().eq('id', imageId)
}

// -----------------------------------------------------------------
// REORDER LISTING IMAGES
// -----------------------------------------------------------------
export async function reorderListingImages(
  listingId: string,
  orderedImageIds: string[]
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { data: listing } = await admin.from('listings')
    .select('seller_id')
    .eq('id', listingId)
    .single()
  if (!listing || listing.seller_id !== user.id) throw new Error('Listing not found')

  for (let i = 0; i < orderedImageIds.length; i++) {
    await admin.from('listing_images')
      .update({ order_index: i })
      .eq('id', orderedImageIds[i])
      .eq('listing_id', listingId)
  }
}

// -----------------------------------------------------------------
// SAVE / UNSAVE LISTING
// -----------------------------------------------------------------
export async function saveListing(listingId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  await admin.from('saved_listings').upsert(
    { user_id: user.id, listing_id: listingId },
    { onConflict: 'user_id,listing_id' }
  )
}

export async function unsaveListing(listingId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  await admin.from('saved_listings')
    .delete()
    .eq('user_id', user.id)
    .eq('listing_id', listingId)
}

// -----------------------------------------------------------------
// RECORD VIEW
// -----------------------------------------------------------------
export async function recordView(listingId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = getServiceClient()
  await admin.rpc('increment_listing_view', {
    p_listing_id: listingId,
    p_viewer_id: user?.id ?? null,
  })
}

// -----------------------------------------------------------------
// GET LISTING DETAIL
// -----------------------------------------------------------------
export async function getListingDetail(listingId: string): Promise<ListingDetail | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = getServiceClient()

  const { data: listing } = await admin.from('listings')
    .select('*, listing_images(*)')
    .eq('id', listingId)
    .is('deleted_at', null)
    .single()
  if (!listing) return null

  // If sold > 30 days ago, don't show
  if (listing.status === 'sold' && listing.sold_at) {
    const daysSinceSold = (Date.now() - new Date(listing.sold_at).getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceSold > 30) return null
  }

  // If not active/sold/draft/inactive(owner only), hide
  if (!['active', 'sold'].includes(listing.status)) {
    if (['draft', 'inactive'].includes(listing.status) && user?.id === listing.seller_id) {
      // Owner can see their own draft or inactive listing
    } else {
      return null
    }
  }

  // Get seller profile
  const { data: seller } = await admin.from('profiles')
    .select('username, first_name, last_name, profile_photo_url, phone_verified_at, phone_number, created_at')
    .eq('id', listing.seller_id)
    .single()
  if (!seller) return null

  // Count seller's sold listings
  const { count: soldCount } = await admin.from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('seller_id', listing.seller_id)
    .eq('status', 'sold')

  // Check if current user saved this listing
  let isSaved = false
  if (user) {
    const { data: saved } = await admin.from('saved_listings')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('listing_id', listingId)
      .maybeSingle()
    isSaved = !!saved
  }

  // Compute mutual friends (same pattern as suggestions.ts)
  let mutualFriendCount = 0
  if (user && user.id !== listing.seller_id) {
    const [{ data: myFriends }, { data: sellerFriends }] = await Promise.all([
      admin.from('friendships')
        .select('requester_id, addressee_id')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
        .eq('status', 'accepted'),
      admin.from('friendships')
        .select('requester_id, addressee_id')
        .or(`requester_id.eq.${listing.seller_id},addressee_id.eq.${listing.seller_id}`)
        .eq('status', 'accepted'),
    ])

    const myFriendIds = new Set(
      (myFriends ?? []).map(f => f.requester_id === user.id ? f.addressee_id : f.requester_id)
    )
    const sellerFriendIds = new Set(
      (sellerFriends ?? []).map(f => f.requester_id === listing.seller_id ? f.addressee_id : f.requester_id)
    )
    for (const id of myFriendIds) {
      if (sellerFriendIds.has(id)) mutualFriendCount++
    }
  }

  // Sort images by order_index
  const images = (listing.listing_images ?? []).sort(
    (a: ListingImage, b: ListingImage) => a.order_index - b.order_index
  )

  return {
    id: listing.id,
    seller_id: listing.seller_id,
    user_bike_id: listing.user_bike_id,
    status: listing.status,
    category: listing.category,
    year: listing.year,
    make: listing.make,
    model: listing.model,
    trim: listing.trim,
    color: listing.color,
    vin: listing.vin,
    mileage: listing.mileage,
    condition: listing.condition,
    modifications: listing.modifications,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    price_type: listing.price_type,
    trade_considered: listing.trade_considered,
    zip_code: listing.zip_code,
    city: listing.city,
    state: listing.state,
    latitude: listing.latitude,
    longitude: listing.longitude,
    show_phone: listing.show_phone,
    view_count: listing.view_count,
    save_count: listing.save_count,
    published_at: listing.published_at,
    expires_at: listing.expires_at,
    sold_at: listing.sold_at,
    created_at: listing.created_at,
    updated_at: listing.updated_at,
    seller_username: seller.username ?? 'Unknown',
    seller_first_name: seller.first_name,
    seller_last_name: seller.last_name,
    seller_photo: seller.profile_photo_url,
    seller_verified: !!seller.phone_verified_at,
    seller_member_since: seller.created_at,
    seller_listings_sold: soldCount ?? 0,
    is_saved: isSaved,
    is_own_listing: user?.id === listing.seller_id,
    mutual_friend_count: mutualFriendCount,
    images,
    seller_phone: listing.show_phone ? seller.phone_number : null,
  }
}

// -----------------------------------------------------------------
// GET MY LISTINGS
// -----------------------------------------------------------------
export async function getMyListings(): Promise<MyListing[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { data: listings } = await admin.from('listings')
    .select('*, listing_images(*)')
    .eq('seller_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (!listings) return []

  // Get DM message counts for each listing (conversations that mention the listing)
  // For now, return 0 as message_count — proper tracking would need a listing_id on conversations
  return listings.map((l: any) => ({
    ...l,
    images: (l.listing_images ?? []).sort((a: ListingImage, b: ListingImage) => a.order_index - b.order_index),
    message_count: 0,
  }))
}

// -----------------------------------------------------------------
// GET SAVED LISTINGS
// -----------------------------------------------------------------
export async function getSavedListings(): Promise<ListingSearchResult[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { data: saved } = await admin.from('saved_listings')
    .select(`
      listing_id,
      listings!inner(
        id, seller_id, category, year, make, model, trim, color, mileage,
        condition, title, price, price_type, trade_considered, city, state,
        view_count, save_count, published_at, expires_at, created_at, status
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (!saved) return []

  const results: ListingSearchResult[] = []
  for (const s of saved) {
    const listing = (s as any).listings
    if (!listing || listing.status === 'removed') continue

    // Get seller info
    const { data: seller } = await admin.from('profiles')
      .select('username, profile_photo_url, phone_verified_at, created_at')
      .eq('id', listing.seller_id)
      .single()

    // Get cover image
    const { data: coverImg } = await admin.from('listing_images')
      .select('storage_path')
      .eq('listing_id', listing.id)
      .order('order_index', { ascending: true })
      .limit(1)
      .maybeSingle()

    results.push({
      id: listing.id,
      seller_id: listing.seller_id,
      seller_username: seller?.username ?? 'Unknown',
      seller_photo: seller?.profile_photo_url ?? null,
      seller_verified: !!seller?.phone_verified_at,
      seller_member_since: seller?.created_at ?? '',
      category: listing.category,
      year: listing.year,
      make: listing.make,
      model: listing.model,
      trim: listing.trim,
      color: listing.color,
      mileage: listing.mileage,
      condition: listing.condition,
      title: listing.title,
      price: listing.price,
      price_type: listing.price_type,
      trade_considered: listing.trade_considered,
      city: listing.city,
      state: listing.state,
      distance_miles: null,
      cover_image_path: coverImg?.storage_path ?? null,
      view_count: listing.view_count,
      save_count: listing.save_count,
      is_saved: true,
      published_at: listing.published_at,
      expires_at: listing.expires_at,
      created_at: listing.created_at,
    })
  }

  return results
}

// -----------------------------------------------------------------
// SEARCH LISTINGS (calls RPC)
// -----------------------------------------------------------------
export async function searchListings(
  filters: ClassifiedsSearchFilters,
  cursorDate?: string,
  cursorId?: string,
  limit: number = 20
): Promise<{ results: ListingSearchResult[]; hasMore: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = getServiceClient()

  // Get user lat/lng for distance
  let userLat: number | null = null
  let userLng: number | null = null
  if (user) {
    const { data: profile } = await admin.from('profiles')
      .select('latitude, longitude')
      .eq('id', user.id)
      .single()
    if (profile) {
      userLat = profile.latitude
      userLng = profile.longitude
    }
  }

  const { data, error } = await admin.rpc('search_listings', {
    p_category: filters.category ?? null,
    p_make: filters.make === '__other__' ? '__other__' : (filters.make ?? null),
    p_model: filters.model ?? null,
    p_year_min: filters.year_min ?? null,
    p_year_max: filters.year_max ?? null,
    p_price_min: filters.price_min ?? null,
    p_price_max: filters.price_max ?? null,
    p_mileage_max: filters.mileage_max ?? null,
    p_condition: filters.condition ?? null,
    p_trade_only: filters.trade_only ?? false,
    p_lat: (filters.radius_miles != null || filters.sort === 'nearest') ? userLat : null,
    p_lng: (filters.radius_miles != null || filters.sort === 'nearest') ? userLng : null,
    p_radius_miles: filters.radius_miles ?? null,
    p_search_term: filters.search_term ?? null,
    p_sort: filters.sort ?? 'newest',
    p_cursor_date: cursorDate ?? null,
    p_cursor_id: cursorId ?? null,
    p_limit: limit + 1,
    p_current_user_id: user?.id ?? null,
  })

  if (error) throw new Error('Search failed')

  const rows = (data ?? []) as ListingSearchResult[]
  const hasMore = rows.length > limit
  const results = hasMore ? rows.slice(0, limit) : rows

  return { results, hasMore }
}

// -----------------------------------------------------------------
// GET USER GARAGE BIKES (for import picker)
// -----------------------------------------------------------------
export async function getMyGarageBikes(): Promise<{
  id: string
  year: number | null
  make: string | null
  model: string | null
  photo_url: string | null
}[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { data: bikes } = await admin.from('user_bikes')
    .select('id, year, make, model, photo_url')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return bikes ?? []
}

// -----------------------------------------------------------------
// CHECK LISTING ELIGIBILITY
// -----------------------------------------------------------------
export async function checkListingEligibility(): Promise<{
  eligible: boolean
  reason?: string
  activeCount: number
  isVerified: boolean
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { eligible: false, reason: 'Not authenticated', activeCount: 0, isVerified: false }

  const admin = getServiceClient()

  const { data: profile } = await admin.from('profiles')
    .select('phone_verified_at')
    .eq('id', user.id)
    .single()

  const isVerified = !!profile?.phone_verified_at

  const { count: activeCount } = await admin.from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('seller_id', user.id)
    .eq('status', 'active')

  const count = activeCount ?? 0

  if (!isVerified) {
    return { eligible: false, reason: 'sms_required', activeCount: count, isVerified }
  }
  if (count >= 3) {
    return { eligible: false, reason: 'limit_reached', activeCount: count, isVerified }
  }

  return { eligible: true, activeCount: count, isVerified }
}

// -----------------------------------------------------------------
// SEND LISTING INQUIRY (creates DM with listing context)
// -----------------------------------------------------------------
export async function sendListingInquiry(
  listingId: string,
  message: string
): Promise<{ conversationId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  checkRateLimit(`listingInquiry:${user.id}`, 10, 60_000)

  const trimmed = message.trim()
  if (!trimmed) throw new Error('Message cannot be empty')
  if (trimmed.length > 2000) throw new Error('Message too long (max 2000 characters)')

  const admin = getServiceClient()

  // Get listing info
  const { data: listing } = await admin.from('listings')
    .select('id, seller_id, title, year, make, model, price, price_type')
    .eq('id', listingId)
    .is('deleted_at', null)
    .single()
  if (!listing) throw new Error('Listing not found')
  if (listing.seller_id === user.id) throw new Error('Cannot message yourself')

  // Check blocks
  const { data: blocks } = await admin.from('blocks')
    .select('id')
    .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${listing.seller_id}),and(blocker_id.eq.${listing.seller_id},blocked_id.eq.${user.id})`)
    .limit(1)
  if (blocks && blocks.length > 0) throw new Error('Cannot message this seller')

  // Get or create conversation (no friends-only gate for classifieds)
  const ids = [user.id, listing.seller_id].sort()

  const { data: existing } = await admin.from('conversations')
    .select('id')
    .eq('participant1_id', ids[0])
    .eq('participant2_id', ids[1])
    .maybeSingle()

  let conversationId: string
  if (existing) {
    conversationId = existing.id
  } else {
    const { data: newConvo, error: createErr } = await admin.from('conversations')
      .insert({ participant1_id: ids[0], participant2_id: ids[1] })
      .select('id')
      .single()
    if (createErr || !newConvo) throw new Error('Failed to create conversation')
    conversationId = newConvo.id
  }

  // Build message with listing context header
  const priceStr = listing.price_type === 'offer'
    ? 'Make an Offer'
    : listing.price != null
      ? `$${listing.price.toLocaleString()}${listing.price_type === 'obo' ? ' OBO' : ''}`
      : 'Contact for Price'

  const contextHeader = `Re: ${listing.year} ${listing.make} ${listing.model} — ${priceStr}`
  const fullMessage = `${contextHeader}\n\n${trimmed}`

  // Insert message
  const { data: msg, error: msgErr } = await admin.from('messages')
    .insert({ conversation_id: conversationId, sender_id: user.id, content: fullMessage })
    .select()
    .single()
  if (msgErr) throw new Error('Failed to send message')

  // Update conversation
  await admin.from('conversations')
    .update({
      last_message_at: msg.created_at,
      last_message_preview: fullMessage.slice(0, 100),
    })
    .eq('id', conversationId)

  return { conversationId }
}
