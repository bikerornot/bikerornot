import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getImageUrl } from '@/lib/supabase/image'
import { findBikeOwners, type BikeOwner } from '@/app/actions/bikes'
import BikeSearch from './BikeSearch'
import UserMenu from '@/app/components/UserMenu'
import NotificationBell from '@/app/components/NotificationBell'
import LastSeenTracker from '@/app/components/LastSeenTracker'
import MessagesLink from '@/app/components/MessagesLink'
import BottomNav from '@/app/components/BottomNav'

export const metadata = { title: 'Find Bike Owners — BikerOrNot' }

export default async function BikesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; make?: string; model?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile?.onboarding_complete) redirect('/onboarding')

  const { year, make, model } = await searchParams

  const defaultSearch = { year: year ?? '', make: make ?? '', model: model ?? '' }

  // Pre-run search server-side if make is present
  let initialOwners: BikeOwner[] = []
  let initialError: string | null = null
  let initialLimited = false
  if (make) {
    const result = await findBikeOwners(make, year ? parseInt(year) : null, model || null)
    initialOwners = result.owners
    initialError = result.error
    initialLimited = result.limited
  }

  const avatarUrl = profile.profile_photo_url
    ? getImageUrl('avatars', profile.profile_photo_url, undefined, profile.updated_at)
    : null

  return (
    <div className="min-h-screen bg-zinc-950 pb-20 sm:pb-0">
      <LastSeenTracker />
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/feed" className="text-xl font-bold text-white tracking-tight">
            BikerOrNot
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/people" className="hidden sm:block text-sm text-zinc-400 hover:text-orange-400 transition-colors" title="Find Riders">
              Find Riders
            </Link>
            <Link href="/groups" className="hidden sm:block text-sm text-zinc-400 hover:text-orange-400 transition-colors" title="Groups">
              Groups
            </Link>
            <MessagesLink userId={user.id} />
            <NotificationBell userId={user.id} username={profile.username!} />
            <UserMenu
              username={profile.username!}
              displayName={profile.username ?? 'Unknown'}
              avatarUrl={avatarUrl}
              firstInitial={(profile.first_name?.[0] ?? '?').toUpperCase()}
              role={profile.role}
            />
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-white mb-1">Find Bike Owners</h1>
        <p className="text-zinc-500 text-sm mb-6">
          Search by year, make, and model to find other riders with the same bike
        </p>
        <BikeSearch
          defaultSearch={defaultSearch}
          initialOwners={initialOwners}
          initialError={initialError}
          initialLimited={initialLimited}
        />
      </div>
      <BottomNav />
    </div>
  )
}
