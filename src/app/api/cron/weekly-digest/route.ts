import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWeeklyDigestEmail } from '@/lib/email'

export const maxDuration = 300

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getServiceClient()
  const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const url = new URL(request.url)
  const testUsername = url.searchParams.get('test')
  const batchStart = parseInt(url.searchParams.get('start') ?? '0')
  const batchSize = parseInt(url.searchParams.get('size') ?? '500')

  // 1. Fetch new signups (active, not deactivated, not banned)
  const { data: newSignups } = await admin
    .from('profiles')
    .select('id, username, first_name, city, state, latitude, longitude, profile_photo_url')
    .eq('onboarding_complete', true)
    .eq('status', 'active')
    .is('deactivated_at', null)
    .not('latitude', 'is', null)
    .gte('created_at', oneWeekAgo)

  if (!newSignups || newSignups.length === 0) {
    return NextResponse.json({ message: 'No new signups this week', sent: 0 })
  }

  const newIds = newSignups.map((s) => s.id)

  // 2. Fetch bikes for new signups
  const { data: bikes } = await admin
    .from('user_bikes')
    .select('user_id, year, make, model')
    .in('user_id', newIds)
  const bikeMap: Record<string, string> = {}
  for (const b of bikes ?? []) {
    if (!bikeMap[b.user_id] && b.year && b.make && b.model) {
      bikeMap[b.user_id] = `${b.year} ${b.make} ${b.model}`
    }
  }

  // 3. Fetch recipients
  const recipients: any[] = []
  if (testUsername) {
    const { data: testUser } = await admin
      .from('profiles')
      .select('id, first_name, latitude, longitude, email_weekly_digest')
      .eq('username', testUsername)
      .single()
    if (testUser) recipients.push(testUser)
  } else {
    const { data: chunk } = await admin
      .from('profiles')
      .select('id, first_name, latitude, longitude, email_weekly_digest')
      .eq('onboarding_complete', true)
      .eq('status', 'active')
      .is('deactivated_at', null)
      .not('latitude', 'is', null)
      .order('created_at', { ascending: true })
      .range(batchStart, batchStart + batchSize - 1)
    if (chunk) recipients.push(...chunk)
  }

  // 4. Fetch emails for this batch of recipients only
  const emailMap = new Map<string, string>()
  const recipientBatchIds = recipients.map((r) => r.id)
  // Fetch emails in chunks of 50 to avoid overloading auth API
  for (let i = 0; i < recipientBatchIds.length; i += 50) {
    const chunk = recipientBatchIds.slice(i, i + 50)
    const results = await Promise.all(
      chunk.map((id) => admin.auth.admin.getUserById(id).then(({ data }) => ({ id, email: data?.user?.email })))
    )
    for (const r of results) {
      if (r.email) emailMap.set(r.id, r.email)
    }
  }

  // 5. Pre-fetch ALL pending friend requests in one query
  const { data: allPending } = await admin
    .from('friendships')
    .select('addressee_id')
    .eq('status', 'pending')
  const pendingMap = new Map<string, number>()
  for (const p of allPending ?? []) {
    pendingMap.set(p.addressee_id, (pendingMap.get(p.addressee_id) ?? 0) + 1)
  }

  // 6. Pre-fetch ALL friendships for friend exclusion
  const { data: allFriendships } = await admin
    .from('friendships')
    .select('requester_id, addressee_id')

  // Build friend sets per user (only for users in recipients)
  const recipientIds = new Set(recipients.map((r) => r.id))
  const friendSets = new Map<string, Set<string>>()
  for (const f of allFriendships ?? []) {
    if (recipientIds.has(f.requester_id)) {
      if (!friendSets.has(f.requester_id)) friendSets.set(f.requester_id, new Set())
      friendSets.get(f.requester_id)!.add(f.addressee_id)
    }
    if (recipientIds.has(f.addressee_id)) {
      if (!friendSets.has(f.addressee_id)) friendSets.set(f.addressee_id, new Set())
      friendSets.get(f.addressee_id)!.add(f.requester_id)
    }
  }

  // 7. Process each recipient
  let sent = 0
  let skipped = 0

  for (const user of recipients) {
    if (user.email_weekly_digest === false) { skipped++; continue }
    if (newIds.includes(user.id)) continue

    const friendIds = friendSets.get(user.id) ?? new Set()
    const pendingRequests = pendingMap.get(user.id) ?? 0

    const nearby = newSignups
      .filter((s) => {
        if (!s.latitude || !s.longitude) return false
        if (friendIds.has(s.id)) return false
        return haversine(user.latitude, user.longitude, s.latitude, s.longitude) <= 50
      })
      .sort((a, b) =>
        haversine(user.latitude, user.longitude, a.latitude!, a.longitude!) -
        haversine(user.latitude, user.longitude, b.latitude!, b.longitude!)
      )

    if (nearby.length === 0 && pendingRequests === 0) { skipped++; continue }

    const email = emailMap.get(user.id)
    if (!email) { skipped++; continue }

    const riderList = nearby.slice(0, 5).map((r) => ({
      username: r.username ?? 'unknown',
      firstName: r.first_name ?? '',
      city: r.city,
      state: r.state,
      bike: bikeMap[r.id] ?? null,
      profilePhotoUrl: r.profile_photo_url,
    }))

    try {
      await sendWeeklyDigestEmail({
        toEmail: email,
        toName: user.first_name ?? 'there',
        nearbyRiders: riderList,
        totalNearby: nearby.length,
        pendingRequests,
      })
      sent++
    } catch (err) {
      console.error(`Weekly digest failed for ${user.id}:`, err)
    }

    // Rate limit: pause every 10 emails
    if (sent % 10 === 0) {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  return NextResponse.json({
    message: 'Weekly digest complete',
    newSignups: newSignups.length,
    batchStart,
    batchSize,
    recipients: recipients.length,
    sent,
    skipped,
    nextBatch: recipients.length === batchSize ? batchStart + batchSize : null,
  })
}
