import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getImageUrl } from '@/lib/supabase/image'
import { getMessages } from '@/app/actions/messages'
import ChatWindow from './ChatWindow'
import UserMenu from '@/app/components/UserMenu'
import NotificationBell from '@/app/components/NotificationBell'
import LastSeenTracker from '@/app/components/LastSeenTracker'
import MessagesLink from '@/app/components/MessagesLink'
import BottomNav from '@/app/components/BottomNav'
import type { Profile } from '@/lib/supabase/types'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  return { title: 'Chat — BikerOrNot' }
}

export default async function ChatPage({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const { conversationId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: currentUserProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: convo } = await admin
    .from('conversations')
    .select('*, participant1:profiles!participant1_id(*), participant2:profiles!participant2_id(*)')
    .eq('id', conversationId)
    .single()

  if (!convo) notFound()
  if (convo.participant1_id !== user.id && convo.participant2_id !== user.id) notFound()

  const otherUser: Profile = convo.participant1_id === user.id ? convo.participant2 : convo.participant1

  const messages = await getMessages(conversationId)

  const otherAvatarUrl = otherUser.profile_photo_url
    ? getImageUrl('avatars', otherUser.profile_photo_url)
    : null
  const otherInitial = (otherUser.username?.[0] ?? '?').toUpperCase()

  const myAvatarUrl = currentUserProfile?.profile_photo_url
    ? getImageUrl('avatars', currentUserProfile.profile_photo_url, undefined, currentUserProfile.updated_at)
    : null

  return (
    <div className="h-screen bg-zinc-950 flex flex-col overflow-hidden pb-20 sm:pb-0">
      <LastSeenTracker />
      {/* Main nav header */}
      <header className="bg-zinc-900 border-b border-zinc-800 flex-shrink-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/feed" className="text-xl font-bold text-white tracking-tight">
            BikerOrNot
          </Link>
          <div className="flex items-center gap-2">
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
            <NotificationBell userId={user.id} username={currentUserProfile?.username ?? ''} />
            <UserMenu
              username={currentUserProfile?.username ?? ''}
              displayName={currentUserProfile?.username ?? 'Unknown'}
              avatarUrl={myAvatarUrl}
              firstInitial={(currentUserProfile?.first_name?.[0] ?? '?').toUpperCase()}
              role={currentUserProfile?.role}
            />
          </div>
        </div>
      </header>

      {/* Conversation sub-header */}
      <div className="bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
        <div className="max-w-2xl mx-auto px-4 py-2 flex items-center gap-3">
          <Link
            href="/messages"
            className="text-zinc-400 hover:text-white transition-colors flex-shrink-0"
            aria-label="Back to messages"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </Link>

          <Link href={`/profile/${otherUser.username}`} className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
              {otherAvatarUrl ? (
                <Image src={otherAvatarUrl} alt={otherInitial} width={32} height={32} className="object-cover w-full h-full" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs font-bold text-zinc-300">
                  {otherInitial}
                </div>
              )}
            </div>
            <span className="text-white font-semibold text-sm group-hover:text-orange-400 transition-colors">
              @{otherUser.username}
            </span>
          </Link>
        </div>
      </div>

      {/* Chat area — fills remaining height */}
      <div className="flex-1 overflow-hidden max-w-2xl mx-auto w-full flex flex-col">
        <ChatWindow
          conversationId={conversationId}
          initialMessages={messages}
          currentUserId={user.id}
          otherUser={otherUser}
        />
      </div>
      <BottomNav />
    </div>
  )
}
