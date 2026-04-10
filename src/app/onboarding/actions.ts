'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { geocodeZip } from '@/lib/geocode'
import { validateImageFile } from '@/lib/rate-limit'
import { moderateImage } from '@/lib/sightengine'
import { detectWebPresence } from '@/lib/google-vision'
import { normalizeMake } from '@/lib/normalize-make'
import { validateUsername } from '@/lib/username-rules'

async function getSignupLocation(): Promise<{
  ip: string | null
  country: string | null
  countryCode: string | null
  region: string | null
  city: string | null
  continent: string | null
}> {
  const headersList = await headers()
  const forwarded = headersList.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() ?? headersList.get('x-real-ip') ?? null

  // Skip geo lookup for local/private IPs or invalid formats
  const isPrivate = !ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')
  const isValidFormat = /^[\d.]+$/.test(ip ?? '') || /^[0-9a-f:]+$/i.test(ip ?? '')
  if (isPrivate || !isValidFormat) {
    return { ip, country: null, countryCode: null, region: null, city: null, continent: null }
  }

  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,continent`, {
      next: { revalidate: 0 },
    })
    const data = await res.json()
    if (data.status === 'success') {
      return {
        ip,
        country: data.country ?? null,
        countryCode: data.countryCode ?? null,
        region: data.regionName ?? null,
        city: data.city ?? null,
        continent: data.continent ?? null,
      }
    }
  } catch {
    // Geo lookup is best-effort — never block signup
  }

  return { ip, country: null, countryCode: null, region: null, city: null, continent: null }
}

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
  if (!file) throw new Error('No file provided')
  await validateImageFile(file)

  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${user.id}/avatar.${ext}`

  const admin = getServiceClient()
  const arrayBuffer = await file.arrayBuffer()

  const moderation = await moderateImage(arrayBuffer, file.type)
  if (moderation === 'rejected') throw new Error('This image was rejected by our content filter. Please choose a different photo.')

  const { error } = await admin.storage
    .from('avatars')
    .upload(path, arrayBuffer, { contentType: file.type, upsert: true })

  if (error) throw error

  // Auto-approve if Sightengine approved; leave null for borderline (admin review)
  if (moderation === 'approved') {
    await admin.from('profiles').update({
      avatar_reviewed_at: new Date().toISOString(),
    }).eq('id', user.id)
  }

  // Run Google Vision web detection in background (fire-and-forget)
  detectWebPresence(arrayBuffer, file.type)
    .then(async (result) => {
      if (!result) return
      const update: Record<string, unknown> = { avatar_web_detection: result }
      if (result.isSuspicious) update.avatar_reviewed_at = null
      await admin.from('profiles').update(update).eq('id', user.id)
    })
    .catch(() => {})

  return path
}

export interface SignupAttribution {
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_content?: string | null
  utm_term?: string | null
  fbclid?: string | null
  gclid?: string | null
  landing_path?: string | null
  referrer?: string | null
}

export async function saveOnboardingData(
  username: string,
  photoPath: string | null,
  bikes: Array<{ year: number; make: string; model: string }>,
  refUrl?: string | null,
  attribution?: SignupAttribution | null
): Promise<{ username: string; bikeIds: string[]; phoneRequired: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  if (!/^[a-z0-9_]{4,20}$/.test(username)) throw new Error('Invalid username')

  const usernameError = validateUsername(username)
  if (usernameError) throw new Error(usernameError)

  const admin = getServiceClient()

  // Determine if phone verification is required (female under 40)
  const gender = user.user_metadata?.gender as string | undefined
  const dob = user.user_metadata?.date_of_birth as string | undefined
  let phoneRequired = false
  if (gender === 'female' && dob) {
    const age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86_400_000))
    if (age < 40) phoneRequired = true
  }

  const { error: profileError } = await admin
    .from('profiles')
    .update({
      username,
      display_name: username,
      ...(photoPath ? { profile_photo_url: photoPath } : {}),
      ...(phoneRequired ? { phone_verification_required: true } : { onboarding_complete: true }),
    })
    .eq('id', user.id)

  if (profileError) {
    if (profileError.code === '23505') throw new Error('USERNAME_TAKEN')
    throw new Error(profileError.message)
  }

  // Geocode zip, capture IP, and store gender from signup metadata
  const zipCode = user.user_metadata?.zip_code as string | undefined
  const geoUpdate: Record<string, unknown> = {}
  if (gender) geoUpdate.gender = gender

  const [geo, location] = await Promise.all([
    zipCode ? geocodeZip(zipCode) : Promise.resolve(null),
    getSignupLocation(),
  ])

  if (geo) {
    geoUpdate.latitude = geo.lat
    geoUpdate.longitude = geo.lng
    geoUpdate.city = geo.city
    geoUpdate.state = geo.state
    geoUpdate.country = 'US' // zip geocoding only works for US zips
  } else {
    // Fall back to IP-detected country code, default US
    geoUpdate.country = location.countryCode ?? 'US'
  }

  geoUpdate.signup_ip = location.ip
  geoUpdate.signup_country = location.country
  geoUpdate.signup_region = location.region
  geoUpdate.signup_city = location.city
  geoUpdate.signup_ref_url = refUrl ?? null

  // Structured attribution (UTM / click IDs / landing path) — lets us slice
  // paid cohorts in SQL without parsing the freeform signup_ref_url string.
  // Truncate long values defensively so a bad actor can't stuff the DB.
  if (attribution) {
    const trunc = (v: string | null | undefined) =>
      (typeof v === 'string' && v.length > 0) ? v.slice(0, 512) : null
    geoUpdate.signup_utm_source = trunc(attribution.utm_source)
    geoUpdate.signup_utm_medium = trunc(attribution.utm_medium)
    geoUpdate.signup_utm_campaign = trunc(attribution.utm_campaign)
    geoUpdate.signup_utm_content = trunc(attribution.utm_content)
    geoUpdate.signup_utm_term = trunc(attribution.utm_term)
    geoUpdate.signup_fbclid = trunc(attribution.fbclid)
    geoUpdate.signup_gclid = trunc(attribution.gclid)
    geoUpdate.signup_landing_path = trunc(attribution.landing_path)
  }

  await admin.from('profiles').update(geoUpdate).eq('id', user.id)

  // Auto-ban accounts signing up from Africa or Asia
  if (location.continent === 'Africa' || location.continent === 'Asia') {
    await admin
      .from('profiles')
      .update({ status: 'banned', ban_reason: 'Auto-banned: signup IP in restricted region' })
      .eq('id', user.id)
  }

  let bikeIds: string[] = []
  if (bikes.length > 0) {
    const { data: insertedBikes, error: bikesError } = await admin
      .from('user_bikes')
      .insert(bikes.map((b) => ({ ...b, make: normalizeMake(b.make), user_id: user.id })))
      .select('id')
    if (bikesError) throw new Error(bikesError.message)
    bikeIds = (insertedBikes ?? []).map((b: { id: string }) => b.id)
  }

  return { username, bikeIds, phoneRequired }
}

/** For backwards compatibility — calls saveOnboardingData and always finalizes */
export async function completeOnboarding(
  username: string,
  photoPath: string | null,
  bikes: Array<{ year: number; make: string; model: string }>,
  refUrl?: string | null
) {
  return saveOnboardingData(username, photoPath, bikes, refUrl)
}

/** Finalize onboarding after phone verification (for users who required it) */
export async function finalizeOnboarding() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  await admin
    .from('profiles')
    .update({ onboarding_complete: true })
    .eq('id', user.id)
}

export async function uploadOnboardingBikePhoto(bikeId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  // Verify ownership
  const { data: bike } = await admin
    .from('user_bikes')
    .select('id')
    .eq('id', bikeId)
    .eq('user_id', user.id)
    .single()
  if (!bike) throw new Error('Bike not found')

  const file = formData.get('file') as File
  if (!file) throw new Error('No file provided')
  await validateImageFile(file)

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

  await admin.from('bike_photos').insert({
    bike_id: bikeId,
    user_id: user.id,
    storage_path: path,
    is_primary: true,
  })

  // Set as the bike's photo_url
  await admin.from('user_bikes').update({ photo_url: path }).eq('id', bikeId)
}
