import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { getImageUrl } from '@/lib/supabase/image'
import FeedClient from './FeedClient'
import UserMenu from '@/app/components/UserMenu'
import NotificationBell from '@/app/components/NotificationBell'
import LastSeenTracker from '@/app/components/LastSeenTracker'
import MessagesLink from '@/app/components/MessagesLink'
import RidersWidget from '@/app/components/RidersWidget'
import DmcaBanner from '@/app/components/DmcaBanner'
import { getNearbyRiders } from '@/app/actions/suggestions'

export const metadata = { title: 'Feed — BikerOrNot' }

export default async function FeedPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile?.onboarding_complete) redirect('/onboarding')

  // Fetch user's active group IDs for feed filtering
  const { data: groupMemberships } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', user.id)
    .eq('status', 'active')

  const userGroupIds = (groupMemberships ?? []).map((m) => m.group_id)

  // Fetch unread DMCA takedown notifications for this user
  const { data: dmcaTakedowns } = await supabase
    .from('notifications')
    .select('id, post_id')
    .eq('user_id', user.id)
    .eq('type', 'dmca_takedown')
    .is('read_at', null)

  // Fetch rider suggestions (only used when friendCount < 15)
  const { riders: nearbyRiders, friendCount } = await getNearbyRiders()

  const avatarUrl = profile.profile_photo_url
    ? getImageUrl('avatars', profile.profile_photo_url, undefined, profile.updated_at)
    : null

  const displayName =
    profile.username ?? 'Unknown'

  return (
    <div className="min-h-screen bg-zinc-950">
      <LastSeenTracker />
      {/* Header */}
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
            <Link href="/bikes" className="text-zinc-400 hover:text-orange-400 transition-colors" title="Find Bike Owners">
              <svg className="w-5 h-5 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75a4.5 4.5 0 01-4.884 4.484c-1.076-.091-2.264.071-2.95.904l-7.152 8.684a2.548 2.548 0 11-3.586-3.586l8.684-7.152c.833-.686.995-1.874.904-2.95a4.5 4.5 0 016.336-4.486l-3.276 3.276a3.004 3.004 0 002.25 2.25l3.276-3.276c.256.565.398 1.192.398 1.852z" />
              </svg>
              <span className="hidden sm:block text-sm">Bikes</span>
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
        <DmcaBanner
          takedowns={(dmcaTakedowns ?? []).map((n) => ({
            id: n.id,
            post_id: n.post_id,
            profile_username: profile.username,
          }))}
        />
        <RidersWidget initialRiders={nearbyRiders} friendCount={friendCount} />
        <FeedClient currentUserId={user.id} currentUserProfile={profile} userGroupIds={userGroupIds} />
      </div>
    </div>
  )
}
