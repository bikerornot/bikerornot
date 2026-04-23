// Thin wrapper around Mapbox's Geocoding API for place search + retrieve.
// Kept server-side so the access token never reaches the browser — the
// `@mapbox` prefix is reserved for Mapbox's own SDK which we don't need.
//
// Docs: https://docs.mapbox.com/api/search/geocoding-v5/
//
// We use the older Geocoding API (not the newer Search Box) because its
// free tier is a straight 100k requests/month with no session-token
// accounting, which is simpler to reason about at our scale. If traffic
// grows enough that POI ranking quality matters more than simplicity,
// migrate to Search Box v1 and add session tokens.

const GEOCODING_ENDPOINT = 'https://api.mapbox.com/geocoding/v5/mapbox.places'

function getAccessToken(): string {
  const token = process.env.MAPBOX_ACCESS_TOKEN
  if (!token) {
    throw new Error(
      'MAPBOX_ACCESS_TOKEN env var not set — sign up at https://mapbox.com, ' +
        'create a token with the Geocoding scope, and add it to .env.local + Vercel.',
    )
  }
  return token
}

export interface MapboxFeature {
  id: string // e.g. "poi.123456789"
  text: string // "Joe's Diner"
  place_name: string // "Joe's Diner, 123 Main St, Tampa, FL 33601, United States"
  center: [number, number] // [longitude, latitude]
  properties?: {
    category?: string
  }
}

// Free-form search. Returns a ranked list of POIs + places. Proximity
// biases results toward the user's current location — critical for
// check-ins where "Starbucks" needs to resolve to the one across the
// street, not the one in Seattle.
export async function searchPlaces(
  query: string,
  proximity?: { latitude: number; longitude: number },
  limit = 8,
): Promise<MapboxFeature[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const token = getAccessToken()
  const params = new URLSearchParams({
    access_token: token,
    autocomplete: 'true',
    limit: String(limit),
    types: 'poi,address',
    // Restrict to US/Canada by default — the biker user base is primarily
    // North American, and without this filter Mapbox happily returns the
    // London or Sydney branch of a chain even when proximity is set.
    country: 'us,ca',
  })
  if (proximity) {
    params.set('proximity', `${proximity.longitude},${proximity.latitude}`)
    // Also pass a bounding box ~50 miles around the user as a HARD filter
    // (proximity is only a relevance bias, so without a bbox we still get
    // cross-country matches slipping in). 0.75 degrees ≈ 50 mi of latitude
    // and ~50 mi of longitude at mid-US latitudes, tight enough to feel
    // local but loose enough to catch the next town over.
    const lngDelta = 0.75
    const latDelta = 0.75
    const minLng = proximity.longitude - lngDelta
    const minLat = proximity.latitude - latDelta
    const maxLng = proximity.longitude + lngDelta
    const maxLat = proximity.latitude + latDelta
    params.set('bbox', `${minLng},${minLat},${maxLng},${maxLat}`)
  }

  const url = `${GEOCODING_ENDPOINT}/${encodeURIComponent(trimmed)}.json?${params.toString()}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Mapbox search failed ${res.status}: ${txt.slice(0, 200)}`)
  }

  const data = (await res.json()) as { features?: MapboxFeature[] }
  return data.features ?? []
}

// Reverse-geocode a set of coordinates to a list of actual nearby POIs.
// Used when the user taps "Use current location" without typing — a free-
// form search with `proximity` is just a relevance bias, not a filter, so
// it can still return places on the other side of the country. Reverse
// geocoding is guaranteed to be at the requested lat/lng.
export async function nearbyPlaces(
  latitude: number,
  longitude: number,
  limit = 10,
): Promise<MapboxFeature[]> {
  const token = getAccessToken()
  const params = new URLSearchParams({
    access_token: token,
    limit: String(limit),
    types: 'poi',
  })
  const url = `${GEOCODING_ENDPOINT}/${longitude},${latitude}.json?${params.toString()}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Mapbox reverse geocode failed ${res.status}: ${txt.slice(0, 200)}`)
  }
  const data = (await res.json()) as { features?: MapboxFeature[] }
  return data.features ?? []
}
