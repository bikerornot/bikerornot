import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  // Only update heartbeat for active users — not banned/suspended
  await supabase
    .from('profiles')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', user.id)
    .eq('status', 'active')

  // Log a daily session row on the first heartbeat of the day per browser.
  // Client passes ?session=1 when its localStorage flag indicates the day
  // hasn't been logged yet. The insert is idempotent (PK on user_id+day),
  // so a cold-start-induced double fire is harmless.
  if (request.nextUrl.searchParams.get('session') === '1') {
    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const today = new Date().toISOString().slice(0, 10)
    await admin
      .from('user_sessions')
      .upsert(
        { user_id: user.id, day: today },
        { onConflict: 'user_id,day', ignoreDuplicates: true }
      )
  }

  return NextResponse.json({ ok: true })
}
