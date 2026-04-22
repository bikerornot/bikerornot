import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// POSTed by the native Android shell on app launch (MainActivity) — the
// WebView's session cookies forward into this Route Handler the same way
// any in-app fetch would, so auth.getUser() resolves to the logged-in
// profile. On conflict we bump last_seen_at so Phase 2 can prune tokens
// that haven't checked in for N days.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const token = (body as { token?: unknown })?.token
  const platform = (body as { platform?: unknown })?.platform

  if (typeof token !== 'string' || token.length < 10 || token.length > 4096) {
    return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 400 })
  }
  if (platform !== 'android' && platform !== 'ios') {
    return NextResponse.json({ ok: false, error: 'invalid_platform' }, { status: 400 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await admin
    .from('device_tokens')
    .upsert(
      {
        user_id: user.id,
        token,
        platform,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'token' }
    )

  if (error) {
    return NextResponse.json({ ok: false, error: 'db_error' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
