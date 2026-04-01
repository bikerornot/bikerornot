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

  // Build and randomize welcome post templates — show 3 of many to reduce feed repetition
  const location = [profile.city, profile.state].filter(Boolean).join(', ')
  const allTemplates = buildWelcomeTemplates(profile.first_name, location, bikeString)
  const templates = pickRandom(allTemplates, 3)

  return (
    <WelcomeClient
      firstName={profile.first_name}
      city={profile.city}
      state={profile.state}
      bikeString={bikeString}
      bikePhotoPath={bikePhotoPath}
      riders={riders}
      currentUserId={user.id}
      templates={templates}
    />
  )
}

function buildWelcomeTemplates(firstName: string, location: string, bikeString: string | null): string[] {
  const loc = location || 'around'

  if (bikeString) {
    return [
      `Hey everyone! I'm ${firstName} from ${loc}. I ride a ${bikeString}. Looking forward to connecting with fellow riders!`,
      `${firstName} here, riding a ${bikeString} out of ${loc}. Stoked to find this community!`,
      `New member alert! I'm ${firstName}, proud owner of a ${bikeString}. Who else is riding near ${loc}?`,
      `Rubber side down! I'm ${firstName} from ${loc} with a ${bikeString}. Who wants to ride?`,
      `Just joined BikerOrNot! I'm ${firstName} from ${loc} and I ride a ${bikeString}. Let's connect!`,
    ]
  }

  return [
    `Hey everyone! I'm ${firstName} from ${loc}. Just joined BikerOrNot and looking forward to meeting fellow riders!`,
    `${firstName} here from ${loc}. Excited to connect with the riding community!`,
    `New to BikerOrNot! I'm ${firstName} from ${loc} — looking to meet riders in my area.`,
    `Just signed up! I'm ${firstName} from ${loc}. Any riders nearby? Let's connect!`,
    `${firstName} from ${loc} checking in! Ready to meet some fellow riders and find new roads.`,
  ]
}

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, count)
}
