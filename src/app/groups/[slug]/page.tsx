import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { getImageUrl } from '@/lib/supabase/image'
import { getGroup, getGroupPosts, getGroupMembers, getPendingRequests } from '@/app/actions/groups'
import UserMenu from '@/app/components/UserMenu'
import NotificationBell from '@/app/components/NotificationBell'
import LastSeenTracker from '@/app/components/LastSeenTracker'
import MessagesLink from '@/app/components/MessagesLink'
import BottomNav from '@/app/components/BottomNav'
import JoinButton from './JoinButton'
import InviteButton from './InviteButton'
import EditGroupPanel from './EditGroupPanel'
import GroupTabs from './GroupTabs'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return { title: `Group — BikerOrNot` }
}

export default async function GroupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: currentUserProfile } = user
    ? await supabase.from('profiles').select('*').eq('id', user.id).single()
    : { data: null }

  const group = await getGroup(slug, user?.id)
  if (!group) notFound()

  const isMember = group.member_status === 'active'
  const isAdmin = group.member_role === 'admin'

  // Fetch initial data in parallel
  const canSeePosts = isMember || group.privacy === 'public'

  const [initialPosts, initialMembers, initialRequests] = await Promise.all([
    canSeePosts && user ? getGroupPosts(group.id) : Promise.resolve([]),
    canSeePosts ? getGroupMembers(group.id) : Promise.resolve([]),
    isAdmin && group.privacy === 'private' ? getPendingRequests(group.id) : Promise.resolve([]),
  ])

  const coverUrl = group.cover_photo_url
    ? getImageUrl('covers', group.cover_photo_url)
    : null

  const myAvatarUrl = currentUserProfile?.profile_photo_url
    ? getImageUrl('avatars', currentUserProfile.profile_photo_url, undefined, currentUserProfile.updated_at)
    : null

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
            {user && currentUserProfile && (
              <>
                <MessagesLink userId={user.id} />
                <NotificationBell userId={user.id} username={currentUserProfile.username!} />
                <UserMenu
                  username={currentUserProfile.username!}
                  displayName={currentUserProfile.username ?? 'Unknown'}
                  avatarUrl={myAvatarUrl}
                  firstInitial={(currentUserProfile.first_name?.[0] ?? '?').toUpperCase()}
                  role={currentUserProfile.role}
                />
              </>
            )}
          </div>
        </div>
      </header>

      {/* Group cover */}
      <div className="relative w-full h-40 md:h-56 bg-zinc-800 overflow-hidden">
        {coverUrl ? (
          <Image src={coverUrl} alt={group.name} fill className="object-cover" priority />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-6xl">🏍</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
      </div>

      <div className="max-w-2xl mx-auto px-4">
        {/* Group header */}
        <div className="py-4">
          <h1 className="text-2xl font-bold text-white">{group.name}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-sm text-zinc-400">
              {group.privacy === 'private' ? '🔒 Private' : '🌐 Public'}
            </span>
            <span className="text-zinc-700">·</span>
            <span className="text-sm text-zinc-400">
              {group.member_count ?? 0} member{group.member_count !== 1 ? 's' : ''}
            </span>
          </div>
          {group.description && (
            <p className="text-zinc-300 text-sm mt-2">{group.description}</p>
          )}
          {user && (
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-2">
                {isAdmin && <InviteButton groupId={group.id} />}
                <JoinButton
                  groupId={group.id}
                  privacy={group.privacy}
                  initialStatus={
                    group.member_status === 'active'
                      ? 'active'
                      : group.member_status === 'pending'
                      ? 'pending'
                      : 'none'
                  }
                  initialRole={group.member_role ?? null}
                />
              </div>
              {isAdmin && (
                <EditGroupPanel
                  groupId={group.id}
                  currentDescription={group.description}
                  currentPrivacy={group.privacy}
                  currentCoverUrl={coverUrl}
                />
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <GroupTabs
          group={group}
          currentUserId={user?.id ?? null}
          currentUserProfile={currentUserProfile}
          initialPosts={initialPosts}
          initialMembers={initialMembers}
          initialRequests={initialRequests}
          isMember={isMember}
          isAdmin={isAdmin}
        />

        <div className="h-12" />
      </div>
      <BottomNav />
    </div>
  )
}
