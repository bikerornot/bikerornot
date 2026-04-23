'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import {
  googleAutocomplete,
  googlePlaceDetails,
  type GooglePrediction,
} from '@/lib/google-places'
import { checkRateLimit } from '@/lib/rate-limit'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// What the PlacePicker renders while the user types. These are Google
// Autocomplete predictions — lightweight: just a place_id and a pair of
// display lines. Full lat/lng + address get resolved via selectPlace()
// once the user taps a result.
export interface PlacePrediction {
  placeId: string
  primary: string
  secondary: string
}

// The resolved place the composer chip actually uses. Saved to the
// places table on post submit via selectPlace().
export interface PlaceSearchResult {
  placeId: string
  name: string
  fullAddress: string
  latitude: number
  longitude: number
  category: string | null
}

export async function searchPlaces(
  query: string,
  sessionToken: string,
  proximity?: { latitude: number; longitude: number },
): Promise<PlacePrediction[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  checkRateLimit(`searchPlaces:${user.id}`, 60, 60_000)

  const predictions = await googleAutocomplete(query, sessionToken, proximity)
  return predictions.map((p: GooglePrediction) => ({
    placeId: p.placeId,
    primary: p.primary,
    secondary: p.secondary,
  }))
}

// Called when the user picks a prediction. Resolves the full place via
// Google's Details endpoint (closes out the billed session) and returns
// the enriched record for the composer chip. Note: uses the SAME session
// token from searchPlaces so Google counts the whole interaction as one
// billable session rather than charging per-keystroke.
export async function selectPlace(
  placeId: string,
  sessionToken: string,
): Promise<PlaceSearchResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  checkRateLimit(`selectPlace:${user.id}`, 30, 60_000)

  const details = await googlePlaceDetails(placeId, sessionToken)
  return {
    placeId: details.placeId,
    name: details.name,
    fullAddress: details.address,
    latitude: details.latitude,
    longitude: details.longitude,
    category: details.category,
  }
}

// Look up (or create) a place row for the chosen Google place. Called
// right before post submit. Dedupe on the Google place_id (stored in the
// existing `mapbox_id` column — the column name is a holdover from the
// original Mapbox implementation; it now just holds the provider id
// regardless of provider).
export async function getOrCreatePlace(
  input: PlaceSearchResult,
): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  const { data: existing } = await admin
    .from('places')
    .select('id')
    .eq('mapbox_id', input.placeId)
    .maybeSingle()
  if (existing) return existing.id

  const { data: inserted, error } = await admin
    .from('places')
    .upsert(
      {
        mapbox_id: input.placeId,
        name: input.name,
        full_address: input.fullAddress,
        latitude: input.latitude,
        longitude: input.longitude,
        category: input.category,
      },
      { onConflict: 'mapbox_id' },
    )
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return inserted.id
}
