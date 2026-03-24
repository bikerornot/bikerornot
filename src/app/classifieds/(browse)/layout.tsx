import { createClient } from '@/lib/supabase/server'
import { getImageUrl } from '@/lib/supabase/image'
import Logo from '@/app/components/Logo'
import Link from 'next/link'
import UserMenu from '@/app/components/UserMenu'
import NotificationBell from '@/app/components/NotificationBell'
import LastSeenTracker from '@/app/components/LastSeenTracker'
import MessagesLink from '@/app/components/MessagesLink'
import BottomNav from '@/app/components/BottomNav'
import ClassifiedsNav from './ClassifiedsNav'

export default async function ClassifiedsBrowseLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile = null
  let avatarUrl = null

  if (user) {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    profile = data
    if (profile?.profile_photo_url) {
      avatarUrl = getImageUrl('avatars', profile.profile_photo_url, undefined, profile.updated_at)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 pb-20 sm:pb-0">
      {user && <LastSeenTracker />}
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-4">
            {user && profile ? (
              <>
                <Link href="/people" className="hidden sm:block text-sm text-zinc-400 hover:text-orange-400 transition-colors">Find Riders</Link>
                <Link href="/bikes" className="hidden sm:block text-sm text-zinc-400 hover:text-orange-400 transition-colors">Bikes</Link>
                <Link href="/groups" className="hidden sm:block text-sm text-zinc-400 hover:text-orange-400 transition-colors">Groups</Link>
                <MessagesLink userId={user.id} />
                <NotificationBell userId={user.id} username={profile.username!} />
                <UserMenu
                  username={profile.username!}
                  displayName={profile.username ?? 'Unknown'}
                  avatarUrl={avatarUrl}
                  firstInitial={(profile.first_name?.[0] ?? '?').toUpperCase()}
                  role={profile.role}
                />
              </>
            ) : (
              <Link href="/login" className="text-sm text-orange-400 hover:text-orange-300 font-medium">Log In</Link>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Title row */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Classifieds</h1>
            <p className="text-zinc-500 text-sm mt-0.5">Motorcycles for sale by riders</p>
          </div>
          {user && (
            <Link
              href="/classifieds/new"
              className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              + Sell Your Bike
            </Link>
          )}
        </div>

        {/* Sub-nav tabs */}
        {user && (
          <div className="mb-5">
            <ClassifiedsNav />
          </div>
        )}

        {children}
      </div>
      {user && <BottomNav />}
    </div>
  )
}
