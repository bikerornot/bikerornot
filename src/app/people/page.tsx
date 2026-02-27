import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getImageUrl } from '@/lib/supabase/image'
import PeopleSearch from './PeopleSearch'
import UserMenu from '@/app/components/UserMenu'
import NotificationBell from '@/app/components/NotificationBell'
import LastSeenTracker from '@/app/components/LastSeenTracker'
import MessagesLink from '@/app/components/MessagesLink'
import BottomNav from '@/app/components/BottomNav'
import { getDefaultPeopleResults } from '@/app/actions/people'

export const metadata = { title: 'Find Riders — BikerOrNot' }

export default async function PeoplePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile?.onboarding_complete) redirect('/onboarding')

  const defaultResults = await getDefaultPeopleResults()

  const avatarUrl = profile.profile_photo_url
    ? getImageUrl('avatars', profile.profile_photo_url, undefined, profile.updated_at)
    : null

  const displayName = profile.username ?? 'Unknown'

  return (
    <div className="min-h-screen bg-zinc-950 pb-20 sm:pb-0">
      <LastSeenTracker />
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/feed" className="text-xl font-bold text-white tracking-tight">
            BikerOrNot
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/groups" className="hidden sm:block text-sm text-zinc-400 hover:text-orange-400 transition-colors" title="Groups">
              Groups
            </Link>
            <Link href="/bikes" className="hidden sm:block text-sm text-zinc-400 hover:text-orange-400 transition-colors" title="Find Bike Owners">
              Bikes
            </Link>
            <MessagesLink userId={user.id} />
            <NotificationBell userId={user.id} username={profile.username!} />
            <UserMenu
              username={profile.username!}
              displayName={displayName}
              avatarUrl={avatarUrl}
              firstInitial={(profile.first_name?.[0] ?? '?').toUpperCase()}
              role={profile.role}
            />
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-white mb-1">Find Riders</h1>
        <p className="text-zinc-500 text-sm mb-6">Discover riders near you and send friend requests</p>
        <PeopleSearch defaultZip={profile.zip_code ?? ''} initialResults={defaultResults} />
      </div>
      <BottomNav />
    </div>
  )
}
