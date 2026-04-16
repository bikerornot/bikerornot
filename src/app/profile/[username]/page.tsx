import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getImageUrl } from '@/lib/supabase/image'
import Logo from '@/app/components/Logo'
import DesktopNav from '@/app/components/DesktopNav'
import AvatarLightbox from './AvatarLightbox'
import CoverPhotoUpload from './CoverPhotoUpload'
import ProfileTabs from './ProfileTabs'
import FriendButton, { type FriendshipStatus } from './FriendButton'
import UserMenu from '@/app/components/UserMenu'
import NotificationBell from '@/app/components/NotificationBell'
import LastSeenTracker from '@/app/components/LastSeenTracker'
import MessagesLink from '@/app/components/MessagesLink'
import FindRidersLink from '@/app/components/FindRidersLink'
import MessageButton from '@/app/components/MessageButton'
import MessageRequestButton from '@/app/components/MessageRequestButton'
import ContentMenu from '@/app/components/ContentMenu'
import { getMutualFriends } from '@/app/actions/suggestions'
import BottomNav from '@/app/components/BottomNav'
import { getBlockedIds } from '@/app/actions/blocks'
import VerifiedBadge from '@/app/components/VerifiedBadge'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>
}): Promise<Metadata> {
  const { username } = await params
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('username, first_name, bio, city, state, profile_photo_url, updated_at')
    .eq('username', username)
    .single()

  if (!profile) return { title: `@${username} — BikerOrNot` }

  const displayName = profile.first_name ?? profile.username ?? username
  const location = [profile.city, profile.state].filter(Boolean).join(', ')
  const description = profile.bio
    ? profile.bio.slice(0, 160)
    : location
      ? `${displayName} is a motorcycle enthusiast from ${location} on BikerOrNot.`
      : `${displayName} is a motorcycle enthusiast on BikerOrNot.`

  const avatarUrl = profile.profile_photo_url
    ? getImageUrl('avatars', profile.profile_photo_url, undefined, profile.updated_at)
    : undefined

  return {
    title: `@${profile.username} — BikerOrNot`,
    description,
    openGraph: {
      title: `@${profile.username} — BikerOrNot`,
      description,
      url: `https://www.bikerornot.com/profile/${profile.username}`,
      siteName: 'BikerOrNot',
      type: 'profile',
      ...(avatarUrl && { images: [{ url: avatarUrl, width: 400, height: 400, alt: `@${profile.username}` }] }),
    },
    twitter: {
      card: avatarUrl ? 'summary' : 'summary',
      title: `@${profile.username} — BikerOrNot`,
      description,
      ...(avatarUrl && { images: [avatarUrl] }),
    },
    alternates: {
      canonical: `https://www.bikerornot.com/profile/${profile.username}`,
    },
  }
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { username } = await params
  const { tab: defaultTab } = await searchParams
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .single()

  if (!profile) notFound()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const isOwnProfile = user?.id === profile.id

  // Banned accounts are hidden from everyone except their own view
  if (profile.status === 'banned' && !isOwnProfile) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <p className="text-zinc-500 text-sm mb-1">@{username}</p>
          <h1 className="text-white text-xl font-bold mb-3">Account no longer active</h1>
          <p className="text-zinc-400 text-sm leading-relaxed mb-6">
            This account is no longer available on BikerOrNot.
          </p>
          <Link
            href="/feed"
            className="inline-block bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
          >
            Back to feed
          </Link>
        </div>
      </div>
    )
  }

  // Deactivated accounts are invisible to everyone except their owner
  if (profile.deactivated_at && !isOwnProfile) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <p className="text-zinc-500 text-sm mb-1">@{username}</p>
          <h1 className="text-white text-xl font-bold mb-3">Account deactivated</h1>
          <p className="text-zinc-400 text-sm leading-relaxed mb-6">
            This account has been temporarily deactivated. If the owner logs back in, their profile will be restored.
          </p>
          <Link
            href="/feed"
            className="inline-block bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
          >
            Back to feed
          </Link>
        </div>
      </div>
    )
  }

  if (user && !isOwnProfile) {
    const blockAdmin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const blockedIds = await getBlockedIds(user.id, blockAdmin)
    if (blockedIds.has(profile.id)) {
      return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <h1 className="text-white text-xl font-bold mb-3">This profile is not available</h1>
            <p className="text-zinc-400 text-sm leading-relaxed mb-6">
              You cannot view this profile.
            </p>
            <Link
              href="/feed"
              className="inline-block bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
            >
              Back to feed
            </Link>
          </div>
        </div>
      )
    }
  }

  const { data: currentUserProfile } = user
    ? await supabase.from('profiles').select('*').eq('id', user.id).single()
    : { data: null }

  const { data: bikes } = await supabase
    .from('user_bikes')
    .select('*')
    .eq('user_id', profile.id)
    .order('year', { ascending: false })

  // Count other users who own the same bikes — must use service client
  // because user_bikes RLS only allows reading own rows
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const ownerCounts: Record<string, number> = {}
  if (bikes && bikes.length > 0) {
    await Promise.all(
      bikes.map(async (bike) => {
        if (bike.year && bike.make && bike.model) {
          // Get user_ids of other owners
          const { data: bikeRows } = await admin
            .from('user_bikes')
            .select('user_id')
            .eq('year', bike.year)
            .ilike('make', bike.make)
            .ilike('model', bike.model)
            .neq('user_id', profile.id)

          if (!bikeRows || bikeRows.length === 0) {
            ownerCounts[bike.id] = 0
            return
          }

          // Only count owners with active, complete profiles
          const userIds = [...new Set(bikeRows.map((r) => r.user_id))]
          const { count } = await admin
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .in('id', userIds)
            .eq('onboarding_complete', true)
            .eq('status', 'active')
            .is('deactivated_at', null)

          ownerCounts[bike.id] = count ?? 0
        }
      })
    )
  }

  // Friend count — only count friends with active, non-deactivated profiles
  const { data: friendRows } = await admin
    .from('friendships')
    .select('requester_id, addressee_id, requester:profiles!requester_id(status, deactivated_at), addressee:profiles!addressee_id(status, deactivated_at)')
    .or(`requester_id.eq.${profile.id},addressee_id.eq.${profile.id}`)
    .eq('status', 'accepted')
  const friendCount = (friendRows ?? []).filter((f: any) => {
    const other = f.requester_id === profile.id ? f.addressee : f.requester
    return other?.status === 'active' && !other?.deactivated_at
  }).length

  // Friendship status with current user
  let friendshipStatus: FriendshipStatus = 'none'
  if (user && !isOwnProfile) {
    const { data: friendship } = await supabase
      .from('friendships')
      .select('status, requester_id')
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${profile.id}),and(requester_id.eq.${profile.id},addressee_id.eq.${user.id})`
      )
      .single()

    if (friendship) {
      if (friendship.status === 'accepted') {
        friendshipStatus = 'accepted'
      } else if (friendship.requester_id === user.id) {
        friendshipStatus = 'pending_sent'
      } else {
        friendshipStatus = 'pending_received'
      }
    }
  }

  // Check if current user has public activity (required to unlock messaging)
  let viewerHasPublicActivity = true
  if (user && !isOwnProfile && friendshipStatus === 'accepted') {
    const [{ count: vPosts }, { count: vComments }] = await Promise.all([
      admin.from('posts').select('*', { count: 'exact', head: true }).eq('author_id', user.id).is('deleted_at', null),
      admin.from('comments').select('*', { count: 'exact', head: true }).eq('author_id', user.id).is('deleted_at', null),
    ])
    viewerHasPublicActivity = ((vPosts ?? 0) + (vComments ?? 0)) > 0
  }

  // Mutual friends (only when viewing someone else's profile)
  const mutualFriends = user && !isOwnProfile
    ? await getMutualFriends(profile.id)
    : []

  const avatarUrl = profile.profile_photo_url
    ? getImageUrl('avatars', profile.profile_photo_url, undefined, profile.updated_at)
    : null

  const coverUrl = profile.cover_photo_url
    ? getImageUrl('covers', profile.cover_photo_url, undefined, profile.updated_at)
    : null

  const memberSince = new Date(profile.created_at).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  const relationshipLabel: Record<string, string> = {
    single: 'Single',
    in_a_relationship: 'In a Relationship',
    married: 'Married',
    its_complicated: "It's Complicated",
  }

  const relationshipEmoji: Record<string, string> = {
    single: '🟢',
    in_a_relationship: '💑',
    married: '💍',
    its_complicated: '🤷',
  }

  const displayName = profile.username ?? 'Unknown'

  return (
    <div className="min-h-screen bg-zinc-950 pb-20 sm:pb-0">
      <LastSeenTracker />
      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-4">
            <DesktopNav />
            {user && currentUserProfile && (
              <>
                <FindRidersLink />
            <MessagesLink userId={user.id} />
                <NotificationBell userId={user.id} username={currentUserProfile.username!} />
                <UserMenu
                  username={currentUserProfile.username!}
                  displayName={currentUserProfile.username ?? 'Unknown'}
                  avatarUrl={currentUserProfile.profile_photo_url ? getImageUrl('avatars', currentUserProfile.profile_photo_url, undefined, currentUserProfile.updated_at) : null}
                  firstInitial={(currentUserProfile.first_name?.[0] ?? '?').toUpperCase()}
                  role={currentUserProfile.role}
                />
              </>
            )}
          </div>
        </div>
      </header>

      {/* Cover photo — full bar only when a cover image exists */}
      {coverUrl ? (
        <div className="relative w-full h-48 md:h-64 bg-zinc-800 overflow-hidden">
          <Image
            src={coverUrl}
            alt="Cover photo"
            fill
            className="object-cover"
            priority
          />
          {isOwnProfile && <CoverPhotoUpload userId={profile.id} />}
        </div>
      ) : isOwnProfile ? (
        /* Own profile, no cover yet — thin strip with upload prompt only */
        <div className="relative w-full h-14 bg-zinc-900 border-b border-dashed border-zinc-700">
          <CoverPhotoUpload userId={profile.id} />
        </div>
      ) : null}

      {/* Profile body */}
      <div className="max-w-2xl mx-auto px-4">
        {/* ---------- MOBILE HEADER (sm:hidden) ---------- */}
        <div className={`sm:hidden ${coverUrl ? '-mt-16' : 'pt-5'}`}>
          {/* Avatar + stats (next to avatar) */}
          <div className="flex gap-4 items-start">
            <div className="flex-shrink-0">
              <AvatarLightbox
                avatarUrl={avatarUrl}
                firstInitial={(profile.first_name?.[0] ?? '?').toUpperCase()}
                isOwnProfile={isOwnProfile}
              />
            </div>
            <div className={`flex-1 min-w-0 ${coverUrl ? 'pt-20' : 'pt-0'}`}>
              <h1 className="text-xl font-bold text-white flex items-center gap-1.5 min-w-0 mb-1.5">
                <span className="truncate">@{profile.username}</span>
                {profile.phone_verified_at && <VerifiedBadge className="w-5 h-5 flex-shrink-0" />}
              </h1>
              <div className="text-sm text-zinc-400 space-y-0.5">
                <Link
                  href={`/profile/${profile.username}?tab=Friends`}
                  className="block hover:text-white transition-colors"
                >
                  <span className="text-white font-semibold">{friendCount ?? 0}</span> Friends
                </Link>
                {mutualFriends.length > 0 && (
                  <div>
                    <span className="text-white font-medium">{mutualFriends.length}</span>{' '}
                    mutual {mutualFriends.length === 1 ? 'friend' : 'friends'}
                  </div>
                )}
                <div>
                  Member since <span className="text-white">{memberSince}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Below avatar — full-width bio, details, action buttons */}
          <div className="mt-3 space-y-2">
            {/* Bio details */}
            <div className="flex flex-wrap items-center gap-x-1.5 text-sm text-zinc-400">
              {(profile.city || profile.state) && (
                <span>{[profile.city, profile.state].filter(Boolean).join(', ')}</span>
              )}
              {(profile.city || profile.state) && profile.gender && <span className="text-zinc-600">·</span>}
              {profile.gender && (
                <span>{profile.gender === 'male' ? 'Male' : 'Female'}</span>
              )}
              {profile.gender && profile.date_of_birth && <span className="text-zinc-600">·</span>}
              {profile.date_of_birth && (
                <span>{(() => {
                  const today = new Date()
                  const birth = new Date(profile.date_of_birth)
                  let age = today.getFullYear() - birth.getFullYear()
                  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--
                  return `${age}`
                })()}</span>
              )}
              {profile.date_of_birth && profile.relationship_status && <span className="text-zinc-600">·</span>}
              {profile.relationship_status && (
                <span>{relationshipLabel[profile.relationship_status]}</span>
              )}
            </div>

            {/* Bio text */}
            {profile.bio && (
              <p className="text-zinc-300 text-sm leading-relaxed">{profile.bio}</p>
            )}

            {/* Action buttons — full-width row */}
            <div className="flex gap-2 pt-4 [&>div]:flex-1 [&>div>button]:w-full">
              {isOwnProfile ? (
                <Link
                  href="/settings"
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors border border-zinc-700 text-center"
                >
                  Edit Profile
                </Link>
              ) : (
                <>
                  {user && (
                    <FriendButton
                      profileId={profile.id}
                      initialStatus={friendshipStatus}
                    />
                  )}
                  {friendshipStatus === 'accepted' ? (
                    <MessageButton profileId={profile.id} locked={!viewerHasPublicActivity} />
                  ) : user ? (
                    <MessageRequestButton
                      profileId={profile.id}
                      username={profile.username}
                      friendsOnly={profile.message_privacy === 'friends_only'}
                    />
                  ) : null}
                  {user && (
                    <ContentMenu
                      reportType="profile"
                      reportTargetId={profile.id}
                      blockUserId={profile.id}
                      buttonClassName="bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-3 py-2 rounded-lg transition-colors border border-white/20"
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ---------- DESKTOP HEADER (hidden sm:flex) ---------- */}
        <div className={`hidden sm:flex sm:gap-5 sm:items-start ${coverUrl ? '-mt-16' : 'pt-5'}`}>
          {/* Avatar — overlaps cover photo */}
          <div className="flex-shrink-0">
            <AvatarLightbox
              avatarUrl={avatarUrl}
              firstInitial={(profile.first_name?.[0] ?? '?').toUpperCase()}
              isOwnProfile={isOwnProfile}
            />
          </div>

          {/* Info block — pushed below the cover overlap so text is always on dark bg.
              The avatar is 128px tall and overlaps by 64px (-mt-16), so the info block
              needs at least 20 (80px) of top padding to clear the cover bottom edge. */}
          <div className={`flex-1 min-w-0 ${coverUrl ? 'pt-20' : 'pt-2'}`}>
            {/* Username + buttons row */}
            <div className="flex items-center justify-between gap-3 mb-2">
              <h1 className="text-xl font-bold text-white flex items-center gap-1.5 min-w-0">
                <span className="truncate">@{profile.username}</span>
                {profile.phone_verified_at && <VerifiedBadge className="w-5 h-5 flex-shrink-0" />}
              </h1>

              <div className="flex gap-2 flex-shrink-0">
                {isOwnProfile ? (
                  <Link
                    href="/settings"
                    className="bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors border border-zinc-700"
                  >
                    Edit Profile
                  </Link>
                ) : (
                  <>
                    {user && (
                      <FriendButton
                        profileId={profile.id}
                        initialStatus={friendshipStatus}
                      />
                    )}
                    {friendshipStatus === 'accepted' ? (
                      <MessageButton profileId={profile.id} locked={!viewerHasPublicActivity} />
                    ) : user ? (
                      <MessageRequestButton
                        profileId={profile.id}
                        username={profile.username}
                        friendsOnly={profile.message_privacy === 'friends_only'}
                      />
                    ) : null}
                    {user && (
                      <ContentMenu
                        reportType="profile"
                        reportTargetId={profile.id}
                        blockUserId={profile.id}
                        buttonClassName="bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-3 py-2 rounded-lg transition-colors border border-white/20"
                      />
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Bio details — compact inline on desktop */}
            <div className="flex flex-wrap items-center gap-x-1.5 text-sm text-zinc-400 mb-2">
              {(profile.city || profile.state) && (
                <span>{[profile.city, profile.state].filter(Boolean).join(', ')}</span>
              )}
              {(profile.city || profile.state) && profile.gender && <span className="text-zinc-600">·</span>}
              {profile.gender && (
                <span>{profile.gender === 'male' ? 'Male' : 'Female'}</span>
              )}
              {profile.gender && profile.date_of_birth && <span className="text-zinc-600">·</span>}
              {profile.date_of_birth && (
                <span>{(() => {
                  const today = new Date()
                  const birth = new Date(profile.date_of_birth)
                  let age = today.getFullYear() - birth.getFullYear()
                  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--
                  return `${age}`
                })()}</span>
              )}
              {profile.date_of_birth && profile.relationship_status && <span className="text-zinc-600">·</span>}
              {profile.relationship_status && (
                <span>{relationshipLabel[profile.relationship_status]}</span>
              )}
            </div>

            {/* Stats + mutual friends */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-400 mb-2">
              <Link
                href={`/profile/${profile.username}?tab=Friends`}
                className="hover:text-white transition-colors"
              >
                <span className="text-white font-semibold">{friendCount ?? 0}</span> Friends
              </Link>
              <span>
                Member since <span className="text-white">{memberSince}</span>
              </span>
            </div>

            {/* Mutual friends */}
            {mutualFriends.length > 0 && (
              <div className="flex items-center gap-2 mb-2">
                <div className="flex -space-x-2">
                  {mutualFriends.slice(0, 3).map((mf) => {
                    const mfAvatarUrl = mf.profile_photo_url
                      ? getImageUrl('avatars', mf.profile_photo_url)
                      : null
                    return (
                      <div
                        key={mf.id}
                        className="w-6 h-6 rounded-full border-2 border-zinc-950 bg-zinc-700 overflow-hidden flex-shrink-0"
                      >
                        {mfAvatarUrl ? (
                          <Image
                            src={mfAvatarUrl}
                            alt={mf.username ?? ''}
                            width={24}
                            height={24}
                            className="object-cover w-full h-full"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold text-zinc-300">
                            {(mf.username?.[0] ?? '?').toUpperCase()}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <span className="text-sm text-zinc-400">
                  <span className="text-white font-medium">{mutualFriends.length}</span>{' '}
                  mutual {mutualFriends.length === 1 ? 'friend' : 'friends'}
                </span>
              </div>
            )}

            {/* Bio text */}
            {profile.bio && (
              <p className="text-zinc-300 text-sm leading-relaxed mb-1">{profile.bio}</p>
            )}
          </div>
        </div>

        <div className="h-6" />
      </div>

      {/* Tabs — sm:px-4 so wall posts go edge-to-edge on mobile like the feed */}
      <div className="max-w-2xl mx-auto sm:px-4">
        <ProfileTabs
          profileId={profile.id}
          isOwnProfile={isOwnProfile}
          isFriend={friendshipStatus === 'accepted'}
          currentUserId={user?.id}
          currentUserProfile={currentUserProfile}
          initialBikes={bikes ?? []}
          ownerCounts={ownerCounts}
          defaultTab={defaultTab}
          username={profile.username!}
        />

        <div className="h-12" />
      </div>
      <BottomNav />
    </div>
  )
}
