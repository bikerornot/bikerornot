'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { geocodeZip } from '@/lib/geocode'

async function getSignupLocation(): Promise<{
  ip: string | null
  country: string | null
  countryCode: string | null
  region: string | null
  city: string | null
}> {
  const headersList = await headers()
  const forwarded = headersList.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() ?? headersList.get('x-real-ip') ?? null

  // Skip geo lookup for local/private IPs
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { ip, country: null, countryCode: null, region: null, city: null }
  }

  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city`, {
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
      }
    }
  } catch {
    // Geo lookup is best-effort — never block signup
  }

  return { ip, country: null, countryCode: null, region: null, city: null }
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

  // Geocode zip, capture IP, and store gender from signup metadata
  const zipCode = user.user_metadata?.zip_code as string | undefined
  const gender = user.user_metadata?.gender as string | undefined
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

  await admin.from('profiles').update(geoUpdate).eq('id', user.id)

  if (bikes.length > 0) {
    const { error: bikesError } = await admin
      .from('user_bikes')
      .insert(bikes.map((b) => ({ ...b, user_id: user.id })))
    if (bikesError) throw new Error(bikesError.message)
  }

  return { username }
}
