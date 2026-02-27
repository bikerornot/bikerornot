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

interface BikeRow {
  id?: string
  year: number
  make: string
  model: string
}

export async function saveProfileSettings(
  profileUpdates: {
    bio: string | null
    location: string | null
    zip_code: string
    relationship_status: string | null
    riding_style: string[] | null
    gender: string | null
  },
  bikes: BikeRow[],
  deletedBikeIds: string[]
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  const { error: profileError } = await admin
    .from('profiles')
    .update(profileUpdates)
    .eq('id', user.id)

  if (profileError) throw new Error(profileError.message)

  // Geocode the new zip code and store coordinates + city
  const geo = await geocodeZip(profileUpdates.zip_code)
  if (geo) {
    await admin
      .from('profiles')
      .update({ latitude: geo.lat, longitude: geo.lng, city: geo.city, state: geo.state, country: 'US' })
      .eq('id', user.id)
  }

  if (deletedBikeIds.length > 0) {
    const { error } = await admin
      .from('user_bikes')
      .delete()
      .in('id', deletedBikeIds)
      .eq('user_id', user.id)
    if (error) throw new Error(error.message)
  }

  const newBikes = bikes.filter((b) => !b.id)
  if (newBikes.length > 0) {
    const { error } = await admin
      .from('user_bikes')
      .insert(newBikes.map((b) => ({ user_id: user.id, year: b.year, make: b.make, model: b.model })))
    if (error) throw new Error(error.message)
  }
}
