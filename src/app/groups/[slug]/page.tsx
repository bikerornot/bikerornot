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

export default async function GroupPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ invite?: string }> }) {
  const { slug } = await params
  const { invite } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: currentUserProfile } = user
    ? await supabase.from('profiles').select('*').eq('id', user.id).single()
    : { data: null }

  const group = await getGroup(slug, user?.id)
  if (!group) notFound()

  // Show suspended state — group is off but not deleted
  if (group.status === 'suspended') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="text-white text-xl font-bold mb-2">{group.name}</h1>
          <p className="text-zinc-400 text-sm leading-relaxed">
            This group has been suspended by the platform administrators and is no longer available.
          </p>
          <Link
            href="/groups"
            className="inline-block mt-6 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
          >
            Browse Groups
          </Link>
        </div>
      </div>
    )
  }

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
                {isMember && <InviteButton groupId={group.id} autoOpen={invite === '1'} />}
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
