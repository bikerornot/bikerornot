import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ count: 0 }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['moderator', 'admin', 'super_admin'].includes(profile.role)) {
    return NextResponse.json({ count: 0 }, { status: 403 })
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { count } = await admin
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')
    .gte('last_seen_at', fiveMinutesAgo)

  return NextResponse.json({ count: count ?? 0 })
}
