export interface GeoResult {
  lat: number
  lng: number
  city: string
  state: string // e.g. "CA"
}

export async function geocodeZip(zip: string): Promise<GeoResult | null> {
  const clean = zip.trim().slice(0, 5)
  if (!/^\d{5}$/.test(clean)) return null

  try {
    const res = await fetch(`https://api.zippopotam.us/us/${clean}`, {
      next: { revalidate: 86400 }, // cache for 24h
    })
    if (!res.ok) return null
    const data = await res.json()
    const place = data?.places?.[0]
    if (!place) return null
    return {
      lat: parseFloat(place.latitude),
      lng: parseFloat(place.longitude),
      city: place['place name'] ?? '',
      state: place['state abbreviation'] ?? '',
    }
  } catch {
    return null
  }
}
