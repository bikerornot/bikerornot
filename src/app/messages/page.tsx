import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getImageUrl } from '@/lib/supabase/image'
import Logo from '@/app/components/Logo'
import DesktopNav from '@/app/components/DesktopNav'
import { getConversations, getMessageRequests } from '@/app/actions/messages'
import InboxTabs from './InboxTabs'
import UserMenu from '@/app/components/UserMenu'
import NotificationBell from '@/app/components/NotificationBell'
import LastSeenTracker from '@/app/components/LastSeenTracker'
import BottomNav from '@/app/components/BottomNav'

export const metadata = { title: 'Messages — BikerOrNot' }

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const initialTab = tab === 'requests' ? 'requests' : 'messages'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile?.onboarding_complete) redirect('/onboarding')

  const [conversations, requests] = await Promise.all([
    getConversations(),
    getMessageRequests(),
  ])

  const avatarUrl = profile.profile_photo_url
    ? getImageUrl('avatars', profile.profile_photo_url, undefined, profile.updated_at)
    : null

  return (
    <div className="min-h-screen bg-zinc-950 pb-20 sm:pb-0">
      <LastSeenTracker />
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-4">
            <DesktopNav />
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

      <div className="max-w-2xl mx-auto px-4 py-4">
        <h1 className="text-xl font-bold text-white mb-4">Messages</h1>
        <InboxTabs
          initialConversations={conversations}
          initialRequests={requests}
          currentUserId={user.id}
          initialTab={initialTab}
        />
      </div>
      <BottomNav />
    </div>
  )
}
