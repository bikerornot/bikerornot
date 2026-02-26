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
    <div className="min-h-screen bg-zinc-950">
      <LastSeenTracker />
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/feed" className="text-xl font-bold text-white tracking-tight">
            BikerOrNot
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/people" className="text-zinc-400 hover:text-orange-400 transition-colors" title="Find Riders">
              <svg className="w-5 h-5 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
              <span className="hidden sm:block text-sm">Find Riders</span>
            </Link>
            <Link href="/groups" className="text-zinc-400 hover:text-orange-400 transition-colors" title="Groups">
              <svg className="w-5 h-5 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
              <span className="hidden sm:block text-sm">Groups</span>
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
    </div>
  )
}
