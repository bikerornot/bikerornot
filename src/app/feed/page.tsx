import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getImageUrl } from '@/lib/supabase/image'
import FeedClient from './FeedClient'
import UserMenu from '@/app/components/UserMenu'
import NotificationBell from '@/app/components/NotificationBell'
import LastSeenTracker from '@/app/components/LastSeenTracker'
import MessagesLink from '@/app/components/MessagesLink'
import BottomNav from '@/app/components/BottomNav'
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
    <div className="min-h-screen bg-zinc-950 pb-20 sm:pb-0">
      <LastSeenTracker />
      {/* Header */}
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
      <BottomNav />
    </div>
  )
}
