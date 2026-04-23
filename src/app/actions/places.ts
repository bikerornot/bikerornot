'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { searchPlaces as mapboxSearch } from '@/lib/mapbox'
import { checkRateLimit } from '@/lib/rate-limit'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export interface PlaceSearchResult {
  mapboxId: string
  name: string
  fullAddress: string
  latitude: number
  longitude: number
  category: string | null
}

// Search Mapbox for place suggestions as the user types in the check-in
// picker. Rate-limited per user because each search is a paid external call
// — 30/minute is plenty for interactive typing (debounced to 300ms) and
// covers 500+ keystrokes/min in aggressive cases, well under our free-tier
// headroom.
export async function searchPlaces(
  query: string,
  proximity?: { latitude: number; longitude: number },
): Promise<PlaceSearchResult[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  checkRateLimit(`searchPlaces:${user.id}`, 30, 60_000)

  const features = await mapboxSearch(query, proximity)
  return features.map((f) => ({
    mapboxId: f.id,
    name: f.text,
    // place_name is "Joe's Diner, 123 Main St, Tampa, FL 33601, United States"
    // — strip the leading name so the address line renders as a separate
    // context row in the UI (we already show the name prominently).
    fullAddress: stripLeadingName(f.place_name, f.text),
    latitude: f.center[1],
    longitude: f.center[0],
    category: f.properties?.category ?? null,
  }))
}

function stripLeadingName(placeName: string, name: string): string {
  if (placeName.startsWith(`${name}, `)) return placeName.slice(name.length + 2)
  return placeName
}

// Look up (or create) a place row for a chosen Mapbox feature. Called right
// before a post with a check-in is created — dedupe is keyed on mapbox_id
// so every real-world place ends up with exactly one row no matter how
// many users check in there.
export async function getOrCreatePlace(
  input: PlaceSearchResult,
): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  // Fast path: place already cached.
  const { data: existing } = await admin
    .from('places')
    .select('id')
    .eq('mapbox_id', input.mapboxId)
    .maybeSingle()
  if (existing) return existing.id

  // Insert. UNIQUE on mapbox_id protects us from a race between two users
  // checking in at a brand-new place simultaneously — the conflict just
  // surfaces the existing row.
  const { data: inserted, error } = await admin
    .from('places')
    .upsert(
      {
        mapbox_id: input.mapboxId,
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
