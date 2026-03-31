import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getNearbyRiders } from '@/app/actions/suggestions'
import WelcomeClient from './WelcomeClient'

export const metadata = { title: 'Welcome — BikerOrNot' }

export default async function WelcomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile?.onboarding_complete) redirect('/onboarding')

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Check if user already has posts or friends — if so, skip to feed
  const [{ count: postCount }, { count: friendCount }] = await Promise.all([
    admin.from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('author_id', user.id)
      .is('deleted_at', null),
    admin.from('friendships')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
  ])

  if ((postCount ?? 0) > 0 || (friendCount ?? 0) > 0) redirect('/feed')

  // Fetch rider suggestions and user's bike for template
  const { riders } = await getNearbyRiders()

  // Get user's first bike if they added one during onboarding
  const { data: bikes } = await admin
    .from('user_bikes')
    .select('id, year, make, model')
    .eq('user_id', user.id)
    .limit(1)

  const bike = bikes?.[0] ?? null
  const bikeString = bike ? `${bike.year} ${bike.make} ${bike.model}` : null

  // Fetch bike photo if available
  let bikePhotoPath: string | null = null
  if (bike) {
    const { data: photos } = await admin
      .from('bike_photos')
      .select('storage_path')
      .eq('bike_id', bike.id)
      .eq('is_primary', true)
      .limit(1)
    bikePhotoPath = photos?.[0]?.storage_path ?? null
  }

  return (
    <WelcomeClient
      firstName={profile.first_name}
      city={profile.city}
      state={profile.state}
      bikeString={bikeString}
      bikePhotoPath={bikePhotoPath}
      riders={riders}
      currentUserId={user.id}
    />
  )
}
