import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getImageUrl } from '@/lib/supabase/image'
import Logo from '@/app/components/Logo'
import UserMenu from '@/app/components/UserMenu'
import NotificationBell from '@/app/components/NotificationBell'
import MessagesLink from '@/app/components/MessagesLink'
import BottomNav from '@/app/components/BottomNav'
import { getEvents } from '@/app/actions/events'
import EventsClient from './EventsClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Events & Rides — BikerOrNot' }

export default async function EventsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile?.onboarding_complete) redirect('/onboarding')

  const { events, userLat, userLng } = await getEvents()

  const avatarUrl = profile.profile_photo_url
    ? getImageUrl('avatars', profile.profile_photo_url, undefined, profile.updated_at)
    : null

  return (
    <div className="min-h-screen bg-zinc-950 pb-20 sm:pb-0">
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-4 sm:py-3 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-4">
            <Link href="/people" className="hidden sm:block text-sm text-zinc-400 hover:text-orange-400 transition-colors">
              Find Riders
            </Link>
            <Link href="/groups" className="hidden sm:block text-sm text-zinc-400 hover:text-orange-400 transition-colors">
              Groups
            </Link>
            <Link href="/events" className="hidden sm:block text-sm text-zinc-400 hover:text-orange-400 transition-colors">
              Events
            </Link>
            <Link href="/bikes" className="hidden sm:block text-sm text-zinc-400 hover:text-orange-400 transition-colors">
              Bikes
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

      <div className="max-w-2xl mx-auto sm:px-4 py-4">
        <EventsClient
          initialEvents={events}
          userLat={userLat}
          userLng={userLng}
          userZip={profile.zip_code ?? ''}
          currentUserId={user.id}
        />
      </div>
      <BottomNav />
    </div>
  )
}
