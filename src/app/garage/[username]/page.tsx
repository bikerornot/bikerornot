import { redirect, notFound } from 'next/navigation'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { bikeSluggify } from '@/lib/bike-slug'

// Legacy route. The garage used to live here and had two shapes:
//   /garage/<username>              → a user's list of bikes
//   /garage/<username>?bike=<slug>  → one bike's detail page
//
// Both were replaced by canonical routes:
//   /profile/<username>?tab=Garage  (user's list)
//   /bikes/<bikeId>                 (bike detail)
//
// This page only exists to redirect old bookmarks and shared links so they
// keep working. Once external links have rotated away (or we decide we
// don't care), this whole folder can be deleted.

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export default async function LegacyGarageRoute({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>
  searchParams: Promise<{ bike?: string }>
}) {
  const { username } = await params
  const { bike: bikeSlug } = await searchParams

  // No ?bike= → redirect to the profile's Garage tab.
  if (!bikeSlug) {
    redirect(`/profile/${username}?tab=Garage`)
  }

  // Look up the bike by (owner username, slug). Slugs are deterministic
  // from year+make+model (via bikeSluggify), so we fetch the user's bikes
  // and match the first one whose slug matches. Same logic the old page
  // used before, just used here only to derive the bikeId for the new URL.
  const admin = getServiceClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle()

  if (!profile) notFound()

  const { data: bikes } = await admin
    .from('user_bikes')
    .select('id, year, make, model')
    .eq('user_id', profile.id)

  const match = (bikes ?? []).find((b) => {
    if (!b.year || !b.make || !b.model) return false
    return bikeSluggify(b.year, b.make, b.model) === bikeSlug
  })

  if (!match) {
    // Slug didn't resolve — fall back to the profile garage tab so the
    // user still lands somewhere useful instead of a 404.
    redirect(`/profile/${username}?tab=Garage`)
  }

  redirect(`/bikes/${match.id}`)
}
