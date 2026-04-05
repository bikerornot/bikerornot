import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getImageUrl } from '@/lib/supabase/image'
import AvatarLightbox from '@/app/profile/[username]/AvatarLightbox'
import ProfileTabs from '@/app/profile/[username]/ProfileTabs'
import FriendButton, { type FriendshipStatus } from '@/app/profile/[username]/FriendButton'
import MessageButton from '@/app/components/MessageButton'
import ContentMenu from '@/app/components/ContentMenu'
import { getMutualFriends } from '@/app/actions/suggestions'
import { getBlockedIds } from '@/app/actions/blocks'
import VerifiedBadge from '@/app/components/VerifiedBadge'
import ModalOverlay from '@/app/components/ModalOverlay'

export default async function ModalProfilePage({
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

  const { data: { user } } = await supabase.auth.getUser()
  const isOwnProfile = user?.id === profile.id

  // Banned/deactivated — show simple message in modal
  if ((profile.status === 'banned' || profile.deactivated_at) && !isOwnProfile) {
    return (
      <ModalOverlay>
        <div className="flex items-center justify-center p-12">
          <div className="text-center">
            <p className="text-zinc-500 text-sm mb-1">@{username}</p>
            <h1 className="text-white text-xl font-bold mb-3">Profile not available</h1>
          </div>
        </div>
      </ModalOverlay>
    )
  }

  // Block check
  if (user && !isOwnProfile) {
    const blockAdmin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const blockedIds = await getBlockedIds(user.id, blockAdmin)
    if (blockedIds.has(profile.id)) {
      return (
        <ModalOverlay>
          <div className="flex items-center justify-center p-12">
            <div className="text-center">
              <h1 className="text-white text-xl font-bold mb-3">Profile not available</h1>
            </div>
          </div>
        </ModalOverlay>
      )
    }
  }

  const { data: currentUserProfile } = user
    ? await supabase.from('profiles').select('*').eq('id', user.id).single()
    : { data: null }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: bikes } = await supabase
    .from('user_bikes')
    .select('*')
    .eq('user_id', profile.id)
    .order('year', { ascending: false })

  const ownerCounts: Record<string, number> = {}
  if (bikes && bikes.length > 0) {
    await Promise.all(
      bikes.map(async (bike) => {
        if (bike.year && bike.make && bike.model) {
          const { data: bikeRows } = await admin
            .from('user_bikes')
            .select('user_id')
            .eq('year', bike.year)
            .ilike('make', bike.make)
            .ilike('model', bike.model)
            .neq('user_id', profile.id)
          if (!bikeRows || bikeRows.length === 0) { ownerCounts[bike.id] = 0; return }
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

  const { data: friendRows } = await admin
    .from('friendships')
    .select('requester_id, addressee_id, requester:profiles!requester_id(status, deactivated_at), addressee:profiles!addressee_id(status, deactivated_at)')
    .or(`requester_id.eq.${profile.id},addressee_id.eq.${profile.id}`)
    .eq('status', 'accepted')
  const friendCount = (friendRows ?? []).filter((f: any) => {
    const other = f.requester_id === profile.id ? f.addressee : f.requester
    return other?.status === 'active' && !other?.deactivated_at
  }).length

  let friendshipStatus: FriendshipStatus = 'none'
  if (user && !isOwnProfile) {
    const { data: friendship } = await supabase
      .from('friendships')
      .select('status, requester_id')
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${profile.id}),and(requester_id.eq.${profile.id},addressee_id.eq.${user.id})`)
      .single()
    if (friendship) {
      if (friendship.status === 'accepted') friendshipStatus = 'accepted'
      else if (friendship.requester_id === user.id) friendshipStatus = 'pending_sent'
      else friendshipStatus = 'pending_received'
    }
  }

  let viewerHasPublicActivity = true
  if (user && !isOwnProfile && friendshipStatus === 'accepted') {
    const [{ count: vPosts }, { count: vComments }] = await Promise.all([
      admin.from('posts').select('*', { count: 'exact', head: true }).eq('author_id', user.id).is('deleted_at', null),
      admin.from('comments').select('*', { count: 'exact', head: true }).eq('author_id', user.id).is('deleted_at', null),
    ])
    viewerHasPublicActivity = ((vPosts ?? 0) + (vComments ?? 0)) > 0
  }

  const mutualFriends = user && !isOwnProfile ? await getMutualFriends(profile.id) : []

  const avatarUrl = profile.profile_photo_url
    ? getImageUrl('avatars', profile.profile_photo_url, undefined, profile.updated_at)
    : null

  const coverUrl = profile.cover_photo_url
    ? getImageUrl('covers', profile.cover_photo_url, undefined, profile.updated_at)
    : null

  const memberSince = new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const relationshipLabel: Record<string, string> = {
    single: 'Single', in_a_relationship: 'In a Relationship',
    married: 'Married', its_complicated: "It's Complicated",
  }
  const relationshipEmoji: Record<string, string> = {
    single: '🟢', in_a_relationship: '💑', married: '💍', its_complicated: '🤷',
  }

  return (
    <ModalOverlay>
      {/* Cover photo */}
      {coverUrl && (
        <div className="relative w-full h-36 md:h-48 bg-zinc-800 overflow-hidden rounded-t-2xl sm:rounded-t-2xl">
          <Image src={coverUrl} alt="Cover photo" fill className="object-cover" priority />
        </div>
      )}

      {/* Profile body */}
      <div className="px-4">
        {/* Avatar + action buttons */}
        <div className={`flex items-end justify-between mb-3 ${coverUrl ? '-mt-14' : 'pt-4'}`}>
          <AvatarLightbox
            avatarUrl={avatarUrl}
            firstInitial={(profile.first_name?.[0] ?? '?').toUpperCase()}
            isOwnProfile={isOwnProfile}
          />
          <div className="pb-2 flex gap-2">
            {isOwnProfile ? (
              <Link href="/settings" className="bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors border border-zinc-700">
                Edit Profile
              </Link>
            ) : (
              <>
                {user && <FriendButton profileId={profile.id} initialStatus={friendshipStatus} />}
                {friendshipStatus === 'accepted' && <MessageButton profileId={profile.id} locked={!viewerHasPublicActivity} />}
                {user && (
                  <ContentMenu reportType="profile" reportTargetId={profile.id} blockUserId={profile.id}
                    buttonClassName="bg-white/10 hover:bg-white/20 text-white text-sm font-semibold px-3 py-2 rounded-lg transition-colors border border-white/20" />
                )}
              </>
            )}
          </div>
        </div>

        {/* Username */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-white flex items-center gap-1.5">
            @{profile.username}
            {profile.phone_verified_at && <VerifiedBadge className="w-5 h-5" />}
          </h1>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-5 text-sm text-zinc-400 mb-4">
          <span><span className="text-white font-semibold">{friendCount ?? 0}</span> Friends</span>
          <span>Member since <span className="text-white">{memberSince}</span></span>
        </div>

        {/* Mutual friends */}
        {mutualFriends.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <div className="flex -space-x-2">
              {mutualFriends.slice(0, 3).map((mf) => {
                const mfAvatarUrl = mf.profile_photo_url ? getImageUrl('avatars', mf.profile_photo_url) : null
                return (
                  <div key={mf.id} className="w-7 h-7 rounded-full border-2 border-zinc-950 bg-zinc-700 overflow-hidden flex-shrink-0">
                    {mfAvatarUrl ? (
                      <Image src={mfAvatarUrl} alt={mf.username ?? ''} width={28} height={28} className="object-cover w-full h-full" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm font-bold text-zinc-300">
                        {(mf.username?.[0] ?? '?').toUpperCase()}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <span className="text-sm text-zinc-400">
              <span className="text-white font-medium">{mutualFriends.length}</span> mutual {mutualFriends.length === 1 ? 'friend' : 'friends'}
            </span>
          </div>
        )}

        {/* Info card */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 mb-4 space-y-3">
          {profile.bio && <p className="text-zinc-300 text-sm leading-relaxed">{profile.bio}</p>}
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-400">
            {(profile.city || profile.state) && (
              <div className="flex items-center gap-1.5"><span>📍</span><span>{[profile.city, profile.state].filter(Boolean).join(', ')}</span></div>
            )}
            {profile.gender && (
              <div className="flex items-center gap-1.5"><span>{profile.gender === 'male' ? '♂️' : '♀️'}</span><span>{profile.gender === 'male' ? 'Male' : 'Female'}</span></div>
            )}
            {profile.date_of_birth && (
              <div className="flex items-center gap-1.5"><span>🎂</span><span>{(() => {
                const today = new Date(); const birth = new Date(profile.date_of_birth)
                let age = today.getFullYear() - birth.getFullYear()
                if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--
                return `${age} years old`
              })()}</span></div>
            )}
            {profile.relationship_status && (
              <div className="flex items-center gap-1.5"><span>{relationshipEmoji[profile.relationship_status]}</span><span>{relationshipLabel[profile.relationship_status]}</span></div>
            )}
          </div>
          {!profile.bio && !profile.city && !profile.state && !profile.gender && !profile.date_of_birth && !profile.relationship_status && (
            <p className="text-zinc-500 text-sm text-center py-2">No profile info yet.</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="sm:px-4">
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
    </ModalOverlay>
  )
}
