/**
 * Backfill latitude/longitude for all profiles that have a zip code but no coordinates.
 *
 * Usage:
 *   node scripts/backfill-coordinates.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')
const envVars = {}
const raw = readFileSync(envPath, 'utf-8')
for (const line of raw.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq === -1) continue
  envVars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
}

const admin = createClient(envVars['NEXT_PUBLIC_SUPABASE_URL'], envVars['SUPABASE_SERVICE_ROLE_KEY'], {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function geocodeZip(zip) {
  const clean = zip.trim().slice(0, 5)
  if (!/^\d{5}$/.test(clean)) return null
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${clean}`)
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

console.log('=== Backfilling coordinates ===\n')

const { data: profiles, error } = await admin
  .from('profiles')
  .select('id, username, zip_code')
  .not('zip_code', 'is', null)
  .is('city', null)

if (error) {
  console.error('Failed to fetch profiles:', error.message)
  process.exit(1)
}

if (!profiles || profiles.length === 0) {
  console.log('No profiles need backfilling.')
  process.exit(0)
}

console.log(`Found ${profiles.length} profile(s) to geocode.\n`)

for (const profile of profiles) {
  process.stdout.write(`  @${profile.username ?? profile.id} (${profile.zip_code}) → `)
  const coords = await geocodeZip(profile.zip_code)
  if (!coords) {
    console.log('could not geocode, skipping')
  } else {
    const { error: updateError } = await admin
      .from('profiles')
      .update({ latitude: coords.lat, longitude: coords.lng, city: coords.city, state: coords.state })
      .eq('id', profile.id)
    if (updateError) {
      console.log(`error: ${updateError.message}`)
    } else {
      console.log(`${coords.city}, ${coords.state} ✓`)
    }
  }
  await sleep(300)
}

console.log('\n=== Done! ===')
