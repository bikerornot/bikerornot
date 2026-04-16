import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getImageUrl } from '@/lib/supabase/image'
import Logo from '@/app/components/Logo'
import DesktopNav from '@/app/components/DesktopNav'
import { getMessages } from '@/app/actions/messages'
import ChatWindow from './ChatWindow'
import UserMenu from '@/app/components/UserMenu'
import NotificationBell from '@/app/components/NotificationBell'
import LastSeenTracker from '@/app/components/LastSeenTracker'
import MessagesLink from '@/app/components/MessagesLink'
import FindRidersLink from '@/app/components/FindRidersLink'
import VerifiedBadge from '@/app/components/VerifiedBadge'
import OnlineIndicator from '@/app/components/OnlineIndicator'
import ContentMenu from '@/app/components/ContentMenu'
import MessageRequestActions from './MessageRequestActions'
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

  // Don't show conversations with banned/suspended users
  if (otherUser.status !== 'active' || otherUser.deactivated_at) redirect('/messages')

  // Ignored conversations are dead to both sides — bounce back to inbox
  if ((convo as any).status === 'ignored') redirect('/messages')

  const isPendingRequest = (convo as any).status === 'request'
  const isRequestRecipient = isPendingRequest && (convo as any).initiated_by !== user.id
  const isRequestSender = isPendingRequest && (convo as any).initiated_by === user.id

  const { messages, hasMore } = await getMessages(conversationId)

  const otherAvatarUrl = otherUser.profile_photo_url
    ? getImageUrl('avatars', otherUser.profile_photo_url)
    : null
  const otherInitial = (otherUser.username?.[0] ?? '?').toUpperCase()

  const myAvatarUrl = currentUserProfile?.profile_photo_url
    ? getImageUrl('avatars', currentUserProfile.profile_photo_url, undefined, currentUserProfile.updated_at)
    : null

  return (
    <div className="h-dvh bg-zinc-950 flex flex-col overflow-hidden">
      <LastSeenTracker />
      {/* Main nav header — hidden on mobile to free up vertical space inside a conversation */}
      <header className="hidden sm:block bg-zinc-900 border-b border-zinc-800 flex-shrink-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-4">
            <DesktopNav />
            <FindRidersLink />
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

          <Link href={`/profile/${otherUser.username}`} className="flex items-center gap-2.5 group flex-1 min-w-0">
            <div className="w-8 h-8 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
              {otherAvatarUrl ? (
                <Image src={otherAvatarUrl} alt={otherInitial} width={32} height={32} className="object-cover w-full h-full" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm font-bold text-zinc-300">
                  {otherInitial}
                </div>
              )}
            </div>
            <span className="text-white font-semibold text-sm group-hover:text-orange-400 transition-colors truncate inline-flex items-center gap-1.5">
              @{otherUser.username}
              {otherUser.phone_verified_at && <VerifiedBadge className="w-3.5 h-3.5 flex-shrink-0" />}
              <OnlineIndicator userId={otherUser.id} initialLastSeen={otherUser.last_seen_at ?? null} initialShowOnline={otherUser.show_online_status ?? true} />
            </span>
          </Link>

          <ContentMenu
            reportType="profile"
            reportTargetId={otherUser.id}
            blockUserId={otherUser.id}
          />
        </div>
      </div>

      {/* Pending-request action bar (recipient only) */}
      {isRequestRecipient && (
        <div className="max-w-2xl mx-auto w-full">
          <MessageRequestActions
            conversationId={conversationId}
            senderId={otherUser.id}
            senderUsername={otherUser.username}
          />
        </div>
      )}

      {/* Chat area — fills remaining height */}
      <div className="flex-1 overflow-hidden max-w-2xl mx-auto w-full flex flex-col">
        <ChatWindow
          conversationId={conversationId}
          initialMessages={messages}
          initialHasMore={hasMore}
          currentUserId={user.id}
          otherUser={otherUser}
          composeDisabledReason={
            isRequestRecipient
              ? 'Accept this request to reply'
              : isRequestSender
                ? 'Waiting for a reply to your earlier message'
                : null
          }
        />
      </div>
    </div>
  )
}
