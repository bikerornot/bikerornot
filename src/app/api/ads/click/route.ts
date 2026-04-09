import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { after } from 'next/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const adId = searchParams.get('ad')
  const fallback = NextResponse.redirect(new URL('/feed', request.url))

  if (!adId || !UUID_RE.test(adId)) return fallback

  // Look up the ad's stored destination — never trust a query param for the redirect target.
  // This prevents anyone from using bikerornot.com as an open-redirect laundering service.
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: ad } = await admin
    .from('ads')
    .select('destination_url, status')
    .eq('id', adId)
    .maybeSingle()

  if (!ad || ad.status !== 'active' || !ad.destination_url) return fallback

  // Sanity-check the stored URL is HTTPS — defends against a poisoned DB row.
  let dest: URL
  try {
    dest = new URL(ad.destination_url)
    if (dest.protocol !== 'https:') return fallback
  } catch {
    return fallback
  }

  // Non-blocking click recording
  after(async () => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    await admin.from('ad_clicks').insert({
      ad_id: adId,
      user_id: user?.id ?? null,
    })
  })

  return NextResponse.redirect(dest.toString())
}
