// Google Places API client. Used instead of Mapbox for check-in search
// because Google's POI data is dramatically better for "find this named
// business near me" — Mapbox is a general-purpose geocoder and returned
// irrelevant cross-country matches even with bbox filtering.
//
// Docs: https://developers.google.com/maps/documentation/places/web-service
//
// Billing:
//   - Autocomplete: $0.017 per request ($17/1000)
//   - Place Details: $0.017 per request when called after autocomplete
//   - With session tokens, BOTH calls in one user session count as ONE
//     billed request. Free $200/month Google Cloud credit covers ~12k
//     check-ins with session tokens, or ~6k without.
//
// Always pair a run of autocomplete calls + one details call with the
// same sessionToken (a v4 UUID generated client-side per picker open).

const AUTOCOMPLETE_URL =
  'https://maps.googleapis.com/maps/api/place/autocomplete/json'
const DETAILS_URL =
  'https://maps.googleapis.com/maps/api/place/details/json'

function getApiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) {
    throw new Error(
      'GOOGLE_PLACES_API_KEY env var not set — enable the Places API in ' +
        'Google Cloud Console, create an API key, and add it to .env.local + Vercel.',
    )
  }
  return key
}

export interface GooglePrediction {
  placeId: string
  primary: string // e.g. "Joe's Diner"
  secondary: string // e.g. "123 Main St, Tampa, FL, USA"
}

export interface GooglePlaceDetails {
  placeId: string
  name: string
  address: string
  latitude: number
  longitude: number
  category: string | null
}

// Autocomplete as the user types. Bias by user location if available —
// Google's `location` + `radius` pair is a strong bias (stronger than
// Mapbox's proximity parameter was) and actually filters effectively.
export async function googleAutocomplete(
  query: string,
  sessionToken: string,
  proximity?: { latitude: number; longitude: number },
): Promise<GooglePrediction[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const key = getApiKey()
  const params = new URLSearchParams({
    input: trimmed,
    sessiontoken: sessionToken,
    key,
    // types=establishment narrows to named businesses/POIs; combined with
    // region=us biases results toward US matches without hard-filtering
    // out the occasional cross-border query.
    types: 'establishment',
  })
  if (proximity) {
    params.set('location', `${proximity.latitude},${proximity.longitude}`)
    params.set('radius', '80000') // 50 mi in meters; bias, not a hard cap
    params.set('strictbounds', 'true') // make the radius an actual filter
  }

  const url = `${AUTOCOMPLETE_URL}?${params.toString()}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Google autocomplete failed ${res.status}: ${txt.slice(0, 200)}`)
  }
  const data = (await res.json()) as {
    status: string
    error_message?: string
    predictions?: Array<{
      place_id: string
      structured_formatting?: { main_text?: string; secondary_text?: string }
      description?: string
    }>
  }
  if (data.status === 'ZERO_RESULTS') return []
  if (data.status !== 'OK') {
    throw new Error(`Google autocomplete: ${data.status}${data.error_message ? ` — ${data.error_message}` : ''}`)
  }

  return (data.predictions ?? []).map((p) => ({
    placeId: p.place_id,
    primary: p.structured_formatting?.main_text ?? p.description ?? '',
    secondary: p.structured_formatting?.secondary_text ?? '',
  }))
}

// Fetch lat/lng + full address for a selected prediction. Must be called
// with the SAME sessionToken passed to googleAutocomplete during the
// typing session — that's what ties the autocompletes + details into a
// single billed "session" under Google's pricing rules.
export async function googlePlaceDetails(
  placeId: string,
  sessionToken: string,
): Promise<GooglePlaceDetails> {
  const key = getApiKey()
  const params = new URLSearchParams({
    place_id: placeId,
    sessiontoken: sessionToken,
    key,
    // Only pay for fields we actually use. Billing is tiered by which
    // field groups get requested (Basic / Contact / Atmosphere) — we
    // stay in Basic here, the cheapest tier.
    fields: 'place_id,name,formatted_address,geometry/location,types',
  })
  const url = `${DETAILS_URL}?${params.toString()}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Google details failed ${res.status}: ${txt.slice(0, 200)}`)
  }
  const data = (await res.json()) as {
    status: string
    error_message?: string
    result?: {
      place_id: string
      name?: string
      formatted_address?: string
      geometry?: { location?: { lat: number; lng: number } }
      types?: string[]
    }
  }
  if (data.status !== 'OK' || !data.result) {
    throw new Error(`Google details: ${data.status}${data.error_message ? ` — ${data.error_message}` : ''}`)
  }
  const r = data.result
  const loc = r.geometry?.location
  if (!loc) throw new Error('Google place details missing geometry')

  return {
    placeId: r.place_id,
    name: r.name ?? 'Unknown place',
    address: r.formatted_address ?? '',
    latitude: loc.lat,
    longitude: loc.lng,
    // First type is the most specific — e.g. "restaurant" rather than
    // the grab-bag "point_of_interest" / "establishment" that always
    // tail Google's types arrays. Filter those generic ones out.
    category:
      (r.types ?? []).filter((t) => t !== 'establishment' && t !== 'point_of_interest')[0] ?? null,
  }
}
