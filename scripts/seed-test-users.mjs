/**
 * Seed script: creates test users in Supabase, bypassing email verification.
 *
 * Usage:
 *   node scripts/seed-test-users.mjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
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
try {
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
} catch {
  console.error('Could not read .env.local — make sure it exists')
  process.exit(1)
}

const SUPABASE_URL = envVars['NEXT_PUBLIC_SUPABASE_URL']
const SERVICE_ROLE_KEY = envVars['SUPABASE_SERVICE_ROLE_KEY']

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ---------------------------------------------------------------------------
// Test user definitions
// ---------------------------------------------------------------------------
const TEST_PASSWORD = 'TestUser1!'   // meets all password rules

const TEST_USERS = [
  {
    email: 'rider1@test.com',
    firstName: 'Jake',
    lastName: 'Throttle',
    username: 'jakethrottle',
    dateOfBirth: '1990-06-15',
    zipCode: '90210',
    relationshipStatus: 'single',
    ridingStyle: ['Cruiser', 'Touring'],
    bio: 'Born to ride. Living the two-wheel life since day one.',
    bikes: [
      { year: 2019, make: 'Harley-Davidson', model: 'Iron 883' },
      { year: 2021, make: 'Indian', model: 'Scout Bobber' },
    ],
  },
  {
    email: 'rider2@test.com',
    firstName: 'Maya',
    lastName: 'Speedwell',
    username: 'mayaspeedwell',
    dateOfBirth: '1995-03-22',
    zipCode: '10001',
    relationshipStatus: 'in_a_relationship',
    ridingStyle: ['Sport / Supersport', 'Naked / Streetfighter'],
    bio: 'Track days and canyon runs. Always chasing the apex.',
    bikes: [
      { year: 2022, make: 'Kawasaki', model: 'Ninja ZX-6R' },
    ],
  },
  {
    email: 'rider3@test.com',
    firstName: 'Carlos',
    lastName: 'Dirtman',
    username: 'carlosdirtman',
    dateOfBirth: '1988-11-05',
    zipCode: '85001',
    relationshipStatus: 'its_complicated',
    ridingStyle: ['Dirt / Motocross', 'Adventure / Dual-Sport'],
    bio: 'If it has two wheels and goes off-road, I want it.',
    bikes: [
      { year: 2020, make: 'KTM', model: '500 EXC-F' },
      { year: 2023, make: 'Honda', model: 'Africa Twin' },
    ],
  },
]

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
async function createTestUser(userData) {
  const { email, firstName, lastName, username, dateOfBirth, zipCode,
          relationshipStatus, ridingStyle, bio, bikes } = userData

  console.log(`\nCreating user: ${email}`)

  // 1. Create auth user (email_confirm bypassed via admin API)
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,           // skip email verification
    user_metadata: {
      first_name: firstName,
      last_name: lastName,
      date_of_birth: dateOfBirth,
      zip_code: zipCode,
      relationship_status: relationshipStatus,
    },
  })

  if (authError) {
    if (authError.message.includes('already been registered')) {
      console.log(`  ⚠  ${email} already exists — skipping`)
      return
    }
    throw new Error(`Auth error for ${email}: ${authError.message}`)
  }

  const userId = authData.user.id
  console.log(`  ✓ Auth user created: ${userId}`)

  // 2. Update profile (created automatically by DB trigger on signup)
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      username,
      display_name: `${firstName} ${lastName}`,
      bio,
      riding_style: ridingStyle,
      onboarding_complete: true,
    })
    .eq('id', userId)

  if (profileError) throw new Error(`Profile error for ${email}: ${profileError.message}`)
  console.log(`  ✓ Profile updated (username: ${username})`)

  // 3. Insert bikes
  if (bikes.length > 0) {
    const { error: bikesError } = await admin
      .from('user_bikes')
      .insert(bikes.map((b) => ({ ...b, user_id: userId })))
    if (bikesError) throw new Error(`Bikes error for ${email}: ${bikesError.message}`)
    console.log(`  ✓ ${bikes.length} bike(s) added`)
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
console.log('=== BikerOrNot: Seeding test users ===')
console.log(`Password for all test accounts: ${TEST_PASSWORD}\n`)

for (const user of TEST_USERS) {
  await createTestUser(user)
}

console.log('\n=== Done! ===')
console.log('Test accounts:')
for (const u of TEST_USERS) {
  console.log(`  ${u.email}  /  ${TEST_PASSWORD}  (@${u.username})`)
}
