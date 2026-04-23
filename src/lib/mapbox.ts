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
  })
  if (proximity) {
    params.set('proximity', `${proximity.longitude},${proximity.latitude}`)
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
