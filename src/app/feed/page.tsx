import { redirect } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getImageUrl } from '@/lib/supabase/image'
import Logo from '@/app/components/Logo'
import DesktopNav from '@/app/components/DesktopNav'
import FeedClient from './FeedClient'
import BirthdayCard from '@/app/components/BirthdayCard'
import UserMenu from '@/app/components/UserMenu'
import NotificationBell from '@/app/components/NotificationBell'
import LastSeenTracker from '@/app/components/LastSeenTracker'
import MessagesLink from '@/app/components/MessagesLink'
import BottomNav from '@/app/components/BottomNav'
import DmcaBanner from '@/app/components/DmcaBanner'
import SiteBanner from '@/app/components/SiteBanner'
import { getActiveBanners } from '@/app/actions/banners'
import { getNearbyRiders } from '@/app/actions/suggestions'
import { getBlockedIds } from '@/app/actions/blocks'
import { getFriendBirthdays } from '@/app/actions/friends'

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

  // Account deletion in progress — send to cancellation page
  if (profile.deletion_scheduled_at) redirect('/account/reactivate')

  // Previously deactivated — auto-reactivate now that they've logged back in
  if (profile.deactivated_at) {
    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    await admin.from('profiles').update({ deactivated_at: null }).eq('id', user.id)
  }

  // New user with no posts and no friends — send to welcome page for guided onboarding
  if (profile.onboarding_complete) {
    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const [{ count: postCount }, { count: friendCount }] = await Promise.all([
      admin.from('posts').select('*', { count: 'exact', head: true }).eq('author_id', user.id).is('deleted_at', null),
      admin.from('friendships').select('*', { count: 'exact', head: true }).eq('status', 'accepted').or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    ])
    if ((postCount ?? 0) === 0 && (friendCount ?? 0) === 0) redirect('/welcome')
  }

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

  // Fetch blocked user IDs, friend birthdays, and site banners
  const [blockedIds, friendBirthdays, activeBanners] = await Promise.all([
    getBlockedIds(user.id, createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )),
    getFriendBirthdays(),
    getActiveBanners(),
  ])

  const avatarUrl = profile.profile_photo_url
    ? getImageUrl('avatars', profile.profile_photo_url, undefined, profile.updated_at)
    : null

  const displayName =
    profile.username ?? 'Unknown'

  return (
    <div className="min-h-screen bg-zinc-950 pb-20 sm:pb-0">
      <LastSeenTracker />
      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-4">
            <DesktopNav />
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

      <SiteBanner banners={activeBanners} />

      <div className="max-w-2xl mx-auto sm:px-4 py-6">
        <DmcaBanner
          takedowns={(dmcaTakedowns ?? []).map((n) => ({
            id: n.id,
            post_id: n.post_id,
            profile_username: profile.username,
          }))}
        />
        {friendBirthdays.length > 0 && (
          <div className="mb-2 sm:mb-4">
            <BirthdayCard birthdays={friendBirthdays} />
          </div>
        )}
        <FeedClient currentUserId={user.id} currentUserProfile={profile} userGroupIds={userGroupIds} blockedUserIds={Array.from(blockedIds)} initialRiders={nearbyRiders} friendCount={friendCount} />
      </div>
      <BottomNav />
    </div>
  )
}
