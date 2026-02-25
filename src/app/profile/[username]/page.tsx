import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getImageUrl } from '@/lib/supabase/image'
import ProfilePhotoUpload from './ProfilePhotoUpload'
import CoverPhotoUpload from './CoverPhotoUpload'
import ProfileTabs from './ProfileTabs'
import FriendButton, { type FriendshipStatus } from './FriendButton'
import UserMenu from '@/app/components/UserMenu'
import NotificationBell from '@/app/components/NotificationBell'
import MessagesLink from '@/app/components/MessagesLink'
import MessageButton from '@/app/components/MessageButton'
import ContentMenu from '@/app/components/ContentMenu'
import { getMutualFriends } from '@/app/actions/suggestions'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  return { title: `@${username} — BikerOrNot` }
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
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

  const { data: currentUserProfile } = user
    ? await supabase.from('profiles').select('*').eq('id', user.id).single()
    : { data: null }

  const { data: bikes } = await supabase
    .from('user_bikes')
    .select('*')
    .eq('user_id', profile.id)
    .order('year', { ascending: false })

  // Friend count
  const { count: friendCount } = await supabase
    .from('friendships')
    .select('*', { count: 'exact', head: true })
    .or(`requester_id.eq.${profile.id},addressee_id.eq.${profile.id}`)
    .eq('status', 'accepted')

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
    its_complicated: "It's Complicated",
  }

  const relationshipEmoji: Record<string, string> = {
    single: '🟢',
    in_a_relationship: '💑',
    its_complicated: '🤷',
  }

  const displayName = profile.username ?? 'Unknown'

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
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
            {user && currentUserProfile && (
              <>
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

      {/* Cover photo */}
      <div className="relative w-full h-48 md:h-64 bg-zinc-800 overflow-hidden">
        {coverUrl && (
          <Image
            src={coverUrl}
            alt="Cover photo"
            fill
            className="object-cover"
            priority
          />
        )}
        {isOwnProfile && <CoverPhotoUpload userId={profile.id} />}
      </div>

      {/* Profile body */}
      <div className="max-w-4xl mx-auto px-4">
        {/* Avatar + action buttons row */}
        <div className="flex items-end justify-between -mt-16 mb-3">
          {/* Avatar */}
          <div className="relative w-32 h-32 rounded-full border-4 border-zinc-950 bg-zinc-800 overflow-hidden flex-shrink-0">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={displayName}
                fill
                className="object-cover"
                priority
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-zinc-600">
                {profile.first_name[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            {isOwnProfile && <ProfilePhotoUpload userId={profile.id} />}
          </div>

          {/* Action buttons */}
          <div className="pb-2 flex gap-2">
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
                {friendshipStatus === 'accepted' && (
                  <MessageButton profileId={profile.id} />
                )}
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

        {/* Username — full width so it never gets truncated on mobile */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-white">@{profile.username}</h1>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-5 text-sm text-zinc-400 mb-4">
          <span>
            <span className="text-white font-semibold">{friendCount ?? 0}</span> Friends
          </span>
          <span>
            Member since <span className="text-white">{memberSince}</span>
          </span>
        </div>

        {/* Mutual friends */}
        {mutualFriends.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            {/* Avatar stack */}
            <div className="flex -space-x-2">
              {mutualFriends.slice(0, 3).map((mf) => {
                const mfAvatarUrl = mf.profile_photo_url
                  ? getImageUrl('avatars', mf.profile_photo_url)
                  : null
                return (
                  <div
                    key={mf.id}
                    className="w-7 h-7 rounded-full border-2 border-zinc-950 bg-zinc-700 overflow-hidden flex-shrink-0"
                  >
                    {mfAvatarUrl ? (
                      <Image
                        src={mfAvatarUrl}
                        alt={mf.username ?? ''}
                        width={28}
                        height={28}
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

        {/* Info card */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 mb-4 space-y-3">
          {profile.bio && (
            <p className="text-zinc-300 text-sm leading-relaxed">{profile.bio}</p>
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-400">
            {(profile.city || profile.state) && (
              <div className="flex items-center gap-1.5">
                <span>📍</span>
                <span>{[profile.city, profile.state].filter(Boolean).join(', ')}</span>
              </div>
            )}

            {profile.gender && (
              <div className="flex items-center gap-1.5">
                <span>{profile.gender === 'male' ? '♂️' : '♀️'}</span>
                <span>{profile.gender === 'male' ? 'Male' : 'Female'}</span>
              </div>
            )}

            {profile.date_of_birth && (
              <div className="flex items-center gap-1.5">
                <span>🎂</span>
                <span>{(() => {
                  const today = new Date()
                  const birth = new Date(profile.date_of_birth)
                  let age = today.getFullYear() - birth.getFullYear()
                  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--
                  return `${age} years old`
                })()}</span>
              </div>
            )}

            {profile.relationship_status && (
              <div className="flex items-center gap-1.5">
                <span>{relationshipEmoji[profile.relationship_status]}</span>
                <span>{relationshipLabel[profile.relationship_status]}</span>
              </div>
            )}
          </div>

          {bikes && bikes.length > 0 && (
            <div className="border-t border-zinc-800 pt-3">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Garage
              </p>
              <ul className="space-y-1">
                {bikes.map((bike) => (
                  <li key={bike.id} className="flex items-center gap-2 text-sm text-zinc-300">
                    <span>🏍</span>
                    {bike.year} {bike.make} {bike.model}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!profile.bio && !profile.city && !profile.state && !profile.gender &&
            !profile.date_of_birth && !profile.relationship_status &&
            (!bikes || bikes.length === 0) && (
            <p className="text-zinc-500 text-sm text-center py-2">No profile info yet.</p>
          )}
        </div>

        {/* Tabs */}
        <ProfileTabs
          profileId={profile.id}
          isOwnProfile={isOwnProfile}
          isFriend={friendshipStatus === 'accepted'}
          currentUserId={user?.id}
          currentUserProfile={currentUserProfile}
        />

        <div className="h-12" />
      </div>
    </div>
  )
}
