import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendConfirmEmailReminder, sendOnboardingReminder } from '@/lib/email'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Vercel Cron calls this with the CRON_SECRET as a Bearer token.
// Schedule is defined in vercel.json.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getServiceClient()

  // Find profiles where onboarding is incomplete and account was created
  // between 23 and 49 hours ago (so we email ~once, around the 24h mark).
  const now = new Date()
  const windowEnd = new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString()
  const windowStart = new Date(now.getTime() - 49 * 60 * 60 * 1000).toISOString()

  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, first_name, reminder_sent_at')
    .eq('onboarding_complete', false)
    .gte('created_at', windowStart)
    .lte('created_at', windowEnd)
    // Only send once — skip any profile that already got a reminder
    .is('reminder_sent_at', null)

  if (error) {
    console.error('[signup-reminders] Failed to fetch profiles:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  const userIds = profiles.map((p) => p.id)

  // Fetch auth users for these IDs to get email + email_confirmed_at
  // Supabase admin.listUsers() is paginated — fetch all pages
  const authUserMap: Record<string, { email: string; email_confirmed_at: string | null }> = {}
  let page = 1
  const perPage = 1000
  while (true) {
    const { data: { users }, error: authErr } = await admin.auth.admin.listUsers({ page, perPage })
    if (authErr) {
      console.error('[signup-reminders] Failed to list auth users:', authErr)
      break
    }
    for (const u of users) {
      if (userIds.includes(u.id)) {
        authUserMap[u.id] = {
          email: u.email ?? '',
          email_confirmed_at: u.email_confirmed_at ?? null,
        }
      }
    }
    if (users.length < perPage) break
    page++
  }

  let groupASent = 0
  let groupBSent = 0
  const errors: string[] = []
  const reminded: string[] = []

  for (const profile of profiles) {
    const authUser = authUserMap[profile.id]
    if (!authUser?.email) continue

    const firstName = profile.first_name ?? 'there'

    try {
      if (!authUser.email_confirmed_at) {
        // Group A: email never confirmed
        await sendConfirmEmailReminder({ toEmail: authUser.email, firstName })
        groupASent++
      } else {
        // Group B: email confirmed but onboarding incomplete — send magic link
        const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
          type: 'magiclink',
          email: authUser.email,
          options: { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.bikerornot.com'}/onboarding` },
        })
        if (linkErr || !linkData?.properties?.action_link) {
          errors.push(`${profile.id}: magic link failed`)
          continue
        }
        await sendOnboardingReminder({
          toEmail: authUser.email,
          firstName,
          magicLink: linkData.properties.action_link,
        })
        groupBSent++
      }
      reminded.push(profile.id)
    } catch (err) {
      errors.push(`${profile.id}: ${err instanceof Error ? err.message : 'send failed'}`)
    }
  }

  // Mark all successfully emailed profiles so we don't re-send
  if (reminded.length > 0) {
    await admin
      .from('profiles')
      .update({ reminder_sent_at: now.toISOString() })
      .in('id', reminded)
  }

  console.log(`[signup-reminders] Group A: ${groupASent}, Group B: ${groupBSent}, errors: ${errors.length}`)
  if (errors.length > 0) console.error('[signup-reminders] Errors:', errors)

  return NextResponse.json({ groupA: groupASent, groupB: groupBSent, errors })
}
