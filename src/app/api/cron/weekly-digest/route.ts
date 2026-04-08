import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWeeklyDigestEmail } from '@/lib/email'

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

export const maxDuration = 300 // 5 minutes max for Vercel Pro

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getServiceClient()
  const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

  // Optional: test mode — only send to a specific user
  const url = new URL(request.url)
  const testUsername = url.searchParams.get('test')

  // Fetch all new signups from the last 7 days with coordinates
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

  // Fetch bikes for new signups
  const newIds = newSignups.map((s) => s.id)
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

  // Fetch recipients — test mode sends to one user, full mode paginates all
  const recipients: any[] = []
  if (testUsername) {
    const { data: testUser } = await admin
      .from('profiles')
      .select('id, first_name, latitude, longitude, email_weekly_digest')
      .eq('username', testUsername)
      .single()
    if (testUser) recipients.push(testUser)
  } else {
    let page = 0
    const PAGE_SIZE = 1000
    while (true) {
      const { data: chunk } = await admin
        .from('profiles')
        .select('id, first_name, latitude, longitude, email_weekly_digest')
        .eq('onboarding_complete', true)
        .eq('status', 'active')
        .is('deactivated_at', null)
        .not('latitude', 'is', null)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      if (!chunk || chunk.length === 0) break
      recipients.push(...chunk)
      if (chunk.length < PAGE_SIZE) break
      page++
    }
  }

  let sent = 0
  let skipped = 0

  for (const user of recipients) {
    // Skip users who opted out
    if (user.email_weekly_digest === false) { skipped++; continue }

    // Skip new signups themselves — don't tell them about themselves
    if (newIds.includes(user.id)) continue

    // Find new signups within 50 miles of this user
    const nearby = newSignups
      .filter((s) => {
        if (!s.latitude || !s.longitude) return false
        return haversine(user.latitude, user.longitude, s.latitude, s.longitude) <= 50
      })
      .sort((a, b) => {
        const distA = haversine(user.latitude, user.longitude, a.latitude!, a.longitude!)
        const distB = haversine(user.latitude, user.longitude, b.latitude!, b.longitude!)
        return distA - distB
      })

    // Skip if no new riders nearby
    if (nearby.length === 0) { skipped++; continue }

    // Get user's email from auth
    const { data: authData } = await admin.auth.admin.getUserById(user.id)
    const email = authData?.user?.email
    if (!email) { skipped++; continue }

    // Build rider list (show up to 5)
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
      })
      sent++
    } catch (err) {
      console.error(`Weekly digest failed for ${user.id}:`, err)
    }

    // Rate limit: small delay between emails to avoid hitting Resend limits
    if (sent % 10 === 0) {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  return NextResponse.json({
    message: `Weekly digest complete`,
    newSignups: newSignups.length,
    sent,
    skipped,
  })
}
