import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { after } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const adId = searchParams.get('ad')
  const dest = searchParams.get('dest')

  if (!adId || !dest) {
    return NextResponse.redirect(new URL('/feed', request.url))
  }

  // Validate destination URL
  try {
    const url = new URL(dest)
    if (url.protocol !== 'https:') {
      return NextResponse.redirect(new URL('/feed', request.url))
    }
  } catch {
    return NextResponse.redirect(new URL('/feed', request.url))
  }

  // Non-blocking click recording
  after(async () => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    await admin.from('ad_clicks').insert({
      ad_id: adId,
      user_id: user?.id ?? null,
    })
  })

  return NextResponse.redirect(dest)
}
