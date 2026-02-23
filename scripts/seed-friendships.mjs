/**
 * Seed script: creates friend requests between test users.
 *
 * Usage:
 *   node scripts/seed-friendships.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// ---------------------------------------------------------------------------
// Load .env.local
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')
const envVars = {}
const raw = readFileSync(envPath, 'utf-8')
for (const line of raw.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq === -1) continue
  const key = trimmed.slice(0, eq).trim()
  const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
  envVars[key] = val
}

const admin = createClient(envVars['NEXT_PUBLIC_SUPABASE_URL'], envVars['SUPABASE_SERVICE_ROLE_KEY'], {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ---------------------------------------------------------------------------
// Look up user IDs by username
// ---------------------------------------------------------------------------
async function getUserId(username) {
  const { data, error } = await admin.from('profiles').select('id').eq('username', username).single()
  if (error) throw new Error(`Could not find user @${username}: ${error.message}`)
  return data.id
}

// ---------------------------------------------------------------------------
// Insert friendship row (idempotent)
// ---------------------------------------------------------------------------
async function sendRequest(requesterId, addresseeId, label) {
  const { error } = await admin.from('friendships').insert({
    requester_id: requesterId,
    addressee_id: addresseeId,
    status: 'pending',
  })
  if (error && error.code === '23505') {
    console.log(`  ⚠  ${label} — already exists, skipping`)
  } else if (error) {
    throw new Error(`${label}: ${error.message}`)
  } else {
    console.log(`  ✓ ${label}`)
  }
}

async function acceptRequest(requesterId, addresseeId, label) {
  const { error } = await admin.from('friendships').update({
    status: 'accepted',
    updated_at: new Date().toISOString(),
  }).eq('requester_id', requesterId).eq('addressee_id', addresseeId)
  if (error) throw new Error(`Accept ${label}: ${error.message}`)
  console.log(`  ✓ Accepted: ${label}`)
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
console.log('=== Seeding friendships ===\n')

const jake  = await getUserId('jakethrottle')
const maya  = await getUserId('mayaspeedwell')
const carlos = await getUserId('carlosdirtman')

console.log('Sending friend requests:')
// jake → maya  (pending — so you can test accepting in the UI)
await sendRequest(jake, maya, 'jakethrottle → mayaspeedwell (pending)')

// carlos → jake  (accepted — so you can see a confirmed friendship)
await sendRequest(carlos, jake, 'carlosdirtman → jakethrottle')
await acceptRequest(carlos, jake, 'carlosdirtman ↔ jakethrottle (accepted)')

console.log('\n=== Done! ===')
console.log('State:')
console.log('  @jakethrottle  sent a pending request to  @mayaspeedwell')
console.log('  @carlosdirtman ↔ @jakethrottle  are now friends')
