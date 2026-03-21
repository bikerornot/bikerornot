import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import Image from 'next/image'
import { getImageUrl } from '@/lib/supabase/image'
import Logo from '@/app/components/Logo'
import GaragePage from './GaragePage'
import UserMenu from '@/app/components/UserMenu'
import NotificationBell from '@/app/components/NotificationBell'
import LastSeenTracker from '@/app/components/LastSeenTracker'
import MessagesLink from '@/app/components/MessagesLink'
import MessageButton from '@/app/components/MessageButton'
import BottomNav from '@/app/components/BottomNav'
import FriendButton, { type FriendshipStatus } from '@/app/profile/[username]/FriendButton'
import type { UserBike, BikePhoto, Profile } from '@/lib/supabase/types'
import { bikeSluggify } from '@/lib/bike-slug'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  return { title: `@${username}'s Garage — BikerOrNot` }
}

export default async function GaragePageRoute({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>
  searchParams: Promise<{ bike?: string }>
}) {
  const { username } = await params
  const { bike: bikeSlugParam } = await searchParams

  const admin = getServiceClient()

  // Fetch profile
  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('username', username)
    .single()

  if (!profile) notFound()

  // Banned/deactivated checks
  if (profile.status === 'banned') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <h1 className="text-white text-xl font-bold mb-3">Account banned</h1>
          <p className="text-zinc-400 text-sm mb-6">This account has been banned from BikerOrNot.</p>
          <Link href="/feed" className="inline-block bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors">
            Back to feed
          </Link>
        </div>
      </div>
    )
  }

  if (profile.deactivated_at) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <h1 className="text-white text-xl font-bold mb-3">Account deactivated</h1>
          <p className="text-zinc-400 text-sm mb-6">This account has been temporarily deactivated.</p>
          <Link href="/feed" className="inline-block bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors">
            Back to feed
          </Link>
        </div>
      </div>
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isOwnGarage = user?.id === profile.id

  // Friend count
  const { count: friendCount } = await admin
    .from('friendships')
    .select('*', { count: 'exact', head: true })
    .or(`requester_id.eq.${profile.id},addressee_id.eq.${profile.id}`)
    .eq('status', 'accepted')

  // Friendship status with current user
  let friendshipStatus: FriendshipStatus = 'none'
  if (user && !isOwnGarage) {
    const { data: friendship } = await admin
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

  // Fetch bikes
  const { data: bikes } = await admin
    .from('user_bikes')
    .select('*')
    .eq('user_id', profile.id)
    .order('year', { ascending: false })

  const userBikes = (bikes ?? []) as UserBike[]

  // Fetch current user profile
  const currentUserProfile = user
    ? ((await admin.from('profiles').select('*').eq('id', user.id).single()).data as Profile | null)
    : null

  // Fetch all bike photos
  const bikeIds = userBikes.map((b) => b.id)
  const { data: allPhotos } = bikeIds.length > 0
    ? await admin
        .from('bike_photos')
        .select('*')
        .in('bike_id', bikeIds)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true })
    : { data: [] }

  const bikePhotosMap: Record<string, BikePhoto[]> = {}
  for (const b of userBikes) bikePhotosMap[b.id] = []
  for (const p of (allPhotos ?? []) as BikePhoto[]) {
    bikePhotosMap[p.bike_id]?.push(p)
  }

  // Fetch owner counts and initial owners for each bike
  const ownerCountsMap: Record<string, number> = {}
  const initialOwnersMap: Record<string, { id: string; username: string | null; first_name: string; last_name: string; profile_photo_url: string | null; city: string | null; state: string | null; updated_at: string }[]> = {}

  await Promise.all(
    userBikes.map(async (b) => {
      if (!b.year || !b.make || !b.model) {
        ownerCountsMap[b.id] = 0
        initialOwnersMap[b.id] = []
        return
      }

      // Fetch ALL user_ids who own this bike (not paginated — typically small)
      const { data: bikeRows } = await admin
        .from('user_bikes')
        .select('user_id')
        .eq('year', b.year)
        .ilike('make', b.make)
        .ilike('model', b.model)

      if (!bikeRows || bikeRows.length === 0) {
        ownerCountsMap[b.id] = 0
        initialOwnersMap[b.id] = []
        return
      }

      const userIds = [...new Set(bikeRows.map((r) => r.user_id))]

      // Fetch matching active profiles — this is the true count
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, username, first_name, last_name, profile_photo_url, city, state, updated_at')
        .in('id', userIds)
        .eq('onboarding_complete', true)
        .eq('status', 'active')

      const allOwners = (profiles ?? []) as typeof initialOwnersMap[string]
      ownerCountsMap[b.id] = allOwners.length
      initialOwnersMap[b.id] = allOwners.slice(0, 12)
    })
  )

  // Determine default bike from ?bike= slug
  let defaultBikeId: string | undefined
  if (bikeSlugParam && userBikes.length > 0) {
    const match = userBikes.find((b) => {
      if (!b.year || !b.make || !b.model) return false
      return bikeSluggify(b.year, b.make, b.model) === bikeSlugParam
    })
    if (match) defaultBikeId = match.id
  }

  return (
    <div className="min-h-screen bg-zinc-950 pb-20 sm:pb-0">
      <LastSeenTracker />

      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-4">
            <Link href="/people" className="hidden sm:block text-sm text-zinc-400 hover:text-orange-400 transition-colors">
              Find Riders
            </Link>
            <Link href="/groups" className="hidden sm:block text-sm text-zinc-400 hover:text-orange-400 transition-colors">
              Groups
            </Link>
            <Link href="/bikes" className="hidden sm:block text-sm text-zinc-400 hover:text-orange-400 transition-colors">
              Bikes
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

      {/* Profile header + content */}
      <div className="max-w-4xl mx-auto px-4">
        {/* Avatar + action buttons row */}
        <div className="flex items-end justify-between mb-3 pt-5">
          {/* Avatar */}
          <Link href={`/profile/${username}`}>
            <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 border-zinc-950 bg-zinc-800 overflow-hidden flex-shrink-0">
              {profile.profile_photo_url ? (
                <Image
                  src={getImageUrl('avatars', profile.profile_photo_url, undefined, profile.updated_at)}
                  alt={username}
                  fill
                  className="object-cover"
                  sizes="128px"
                  priority
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-zinc-600">
                  {(profile.first_name?.[0] ?? '?').toUpperCase()}
                </div>
              )}
            </div>
          </Link>

          {/* Action buttons */}
          <div className="pb-2 flex gap-2">
            {!isOwnGarage && user && (
              <>
                <FriendButton
                  profileId={profile.id}
                  initialStatus={friendshipStatus}
                />
                {friendshipStatus === 'accepted' && (
                  <MessageButton profileId={profile.id} />
                )}
              </>
            )}
          </div>
        </div>

        {/* Username */}
        <div className="mb-4">
          <Link href={`/profile/${username}`} className="hover:text-orange-400 transition-colors">
            <h1 className="text-2xl font-bold text-white">@{username}</h1>
          </Link>
          <p className="text-zinc-500 text-sm mt-0.5">Garage</p>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-5 text-sm text-zinc-400 mb-4">
          <Link href={`/profile/${username}`} className="hover:text-orange-400 transition-colors">
            <span className="text-white font-semibold">{friendCount ?? 0}</span> Friends
          </Link>
          <span>
            Member since{' '}
            <span className="text-white">
              {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
          </span>
        </div>

        {/* Info card */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 mb-5 space-y-3">
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
                <span>
                  {profile.relationship_status === 'single' ? '🟢' :
                   profile.relationship_status === 'in_a_relationship' ? '💑' : '🤷'}
                </span>
                <span>
                  {profile.relationship_status === 'single' ? 'Single' :
                   profile.relationship_status === 'in_a_relationship' ? 'In a Relationship' :
                   profile.relationship_status === 'married' ? 'Married' :
                   "It's Complicated"}
                </span>
              </div>
            )}
          </div>

          {!profile.bio && !profile.city && !profile.state && !profile.gender &&
            !profile.date_of_birth && !profile.relationship_status && (
            <p className="text-zinc-500 text-sm text-center py-2">No profile info yet.</p>
          )}
        </div>

        {userBikes.length === 0 ? (
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-10 text-center">
            <p className="text-4xl mb-3">🏍️</p>
            <p className="text-zinc-500 text-sm">No bikes in the garage yet.</p>
            {isOwnGarage && (
              <Link
                href={`/profile/${username}?tab=Garage`}
                className="mt-3 inline-block text-orange-400 hover:text-orange-300 text-sm font-medium transition-colors"
              >
                Add a bike from your profile
              </Link>
            )}
          </div>
        ) : (
          <GaragePage
            bikes={userBikes}
            bikePhotosMap={bikePhotosMap}
            ownerCountsMap={ownerCountsMap}
            initialOwnersMap={initialOwnersMap}
            isOwnGarage={isOwnGarage}
            isFriend={friendshipStatus === 'accepted'}
            currentUserId={user?.id}
            currentUserProfile={currentUserProfile}
            username={username}
            profileId={profile.id}
            defaultBikeId={defaultBikeId}
          />
        )}

        <div className="h-12" />
      </div>
      <BottomNav />
    </div>
  )
}
