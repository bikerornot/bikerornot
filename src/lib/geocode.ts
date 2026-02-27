export interface GeoResult {
  lat: number
  lng: number
  city: string
  state: string // e.g. "CA"
}

export async function geocodeCity(city: string, stateAbbr: string): Promise<GeoResult | null> {
  const q = encodeURIComponent(`${city.trim()}, ${stateAbbr.trim()}, US`)
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=us`,
      {
        headers: { 'User-Agent': 'BikerOrNot/1.0 (bikerornot.com)' },
        next: { revalidate: 86400 },
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    const place = data?.[0]
    if (!place) return null
    return {
      lat: parseFloat(place.lat),
      lng: parseFloat(place.lon),
      city: city.trim(),
      state: stateAbbr.trim().toUpperCase(),
    }
  } catch {
    return null
  }
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
