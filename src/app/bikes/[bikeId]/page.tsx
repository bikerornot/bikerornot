import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import Logo from '@/app/components/Logo'
import DesktopNav from '@/app/components/DesktopNav'
import UserMenu from '@/app/components/UserMenu'
import NotificationBell from '@/app/components/NotificationBell'
import LastSeenTracker from '@/app/components/LastSeenTracker'
import MessagesLink from '@/app/components/MessagesLink'
import FindRidersLink from '@/app/components/FindRidersLink'
import BottomNav from '@/app/components/BottomNav'
import BikeDetailClient, { type BikeDetailOwnerCard } from './BikeDetailClient'
import { getImageUrl } from '@/lib/supabase/image'
import { haversine as haversineMiles } from '@/lib/geo'
import type { UserBike, BikePhoto, Profile } from '@/lib/supabase/types'
import type { FriendshipStatus } from '@/app/profile/[username]/FriendButton'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bikeId: string }>
}) {
  const { bikeId } = await params
  const admin = getServiceClient()
  const { data } = await admin
    .from('user_bikes')
    .select('year, make, model, user_id')
    .eq('id', bikeId)
    .single()
  if (!data) return { title: 'Bike — BikerOrNot' }
  const { data: ownerProfile } = await admin
    .from('profiles')
    .select('username')
    .eq('id', data.user_id)
    .single()
  const bikeName = [data.year, data.make, data.model].filter(Boolean).join(' ')
  const owner = ownerProfile?.username ? `@${ownerProfile.username}'s ` : ''
  return { title: `${owner}${bikeName || 'Bike'} — BikerOrNot` }
}

export default async function BikeDetailPage({
  params,
}: {
  params: Promise<{ bikeId: string }>
}) {
  const { bikeId } = await params
  const admin = getServiceClient()

  // Viewer auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Bike
  const { data: bikeRow } = await admin
    .from('user_bikes')
    .select('*')
    .eq('id', bikeId)
    .single()
  if (!bikeRow) notFound()
  const bike = bikeRow as UserBike

  // Owner
  const { data: ownerProfileRow } = await admin
    .from('profiles')
    .select('*')
    .eq('id', bike.user_id)
    .single()
  if (!ownerProfileRow) notFound()
  const ownerProfile = ownerProfileRow as Profile

  // Banned / deactivated owner — surface nothing to other viewers; owner
  // can still see their own bike page.
  const isOwnBike = user.id === ownerProfile.id
  if (!isOwnBike && (ownerProfile.status === 'banned' || ownerProfile.deactivated_at)) {
    notFound()
  }

  // Viewer profile (for header UserMenu)
  const { data: viewerProfileRow } = await admin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  const viewerProfile = viewerProfileRow as Profile | null

  // Bike photos
  const { data: photoRows } = await admin
    .from('bike_photos')
    .select('*')
    .eq('bike_id', bike.id)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })
  const bikePhotos = (photoRows ?? []) as BikePhoto[]

  // Fallback to user_bikes.photo_url if bike_photos has nothing but photo_url
  // is set — covers older rows that never got migrated into bike_photos.
  const photoPaths = bikePhotos.length > 0
    ? bikePhotos.map((p) => p.storage_path)
    : bike.photo_url
      ? [bike.photo_url]
      : []

  // Friendship status viewer ↔ owner
  let friendshipStatus: FriendshipStatus = 'none'
  if (!isOwnBike) {
    const { data: friendship } = await admin
      .from('friendships')
      .select('status, requester_id')
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${ownerProfile.id}),and(requester_id.eq.${ownerProfile.id},addressee_id.eq.${user.id})`
      )
      .maybeSingle()
    if (friendship) {
      if (friendship.status === 'accepted') friendshipStatus = 'accepted'
      else if (friendship.requester_id === user.id) friendshipStatus = 'pending_sent'
      else friendshipStatus = 'pending_received'
    }
  }

  // Other owners of this year/make/model (excluding the bike owner)
  let otherOwners: BikeDetailOwnerCard[] = []
  let totalOtherOwners = 0
  if (bike.year && bike.make && bike.model) {
    // Find all users with the same bike — keep each row's photo_url so we
    // can show the owner's OWN version of the bike on their card (a much
    // stronger hook than a generic avatar-only preview).
    const { data: matchingBikeRows } = await admin
      .from('user_bikes')
      .select('user_id, photo_url')
      .eq('year', bike.year)
      .ilike('make', bike.make)
      .ilike('model', bike.model)

    // A user might own multiple matching bikes — take the first row we see
    // per user. In practice rare (duplicate garage entries).
    const bikePhotoByUserId = new Map<string, string | null>()
    for (const row of matchingBikeRows ?? []) {
      if (row.user_id === ownerProfile.id) continue
      if (!bikePhotoByUserId.has(row.user_id)) {
        bikePhotoByUserId.set(row.user_id, row.photo_url ?? null)
      }
    }
    const candidateUserIds = Array.from(bikePhotoByUserId.keys())

    if (candidateUserIds.length > 0) {
      // Fetch active profiles for the candidates. Include lat/long so we
      // can compute and surface distance on each card — proximity is a
      // strong signal in a location-heavy social graph.
      const { data: ownerProfiles } = await admin
        .from('profiles')
        .select('id, username, first_name, last_name, profile_photo_url, city, state, updated_at, latitude, longitude')
        .in('id', candidateUserIds)
        .eq('onboarding_complete', true)
        .eq('status', 'active')
        .is('deactivated_at', null)

      const profiles = (ownerProfiles ?? []) as Array<{
        id: string
        username: string | null
        first_name: string
        last_name: string
        profile_photo_url: string | null
        city: string | null
        state: string | null
        updated_at: string
        latitude: number | null
        longitude: number | null
      }>

      totalOtherOwners = profiles.length

      // Friendship status map viewer ↔ each other owner
      const friendshipStatusMap = new Map<string, FriendshipStatus>()
      if (profiles.length > 0) {
        const profileIds = profiles.map((p) => p.id)
        const { data: friendshipRows } = await admin
          .from('friendships')
          .select('requester_id, addressee_id, status')
          .or(
            profileIds
              .map(
                (id) =>
                  `and(requester_id.eq.${user.id},addressee_id.eq.${id}),and(requester_id.eq.${id},addressee_id.eq.${user.id})`
              )
              .join(',')
          )
        for (const f of friendshipRows ?? []) {
          const otherId = f.requester_id === user.id ? f.addressee_id : f.requester_id
          if (f.status === 'accepted') friendshipStatusMap.set(otherId, 'accepted')
          else if (f.requester_id === user.id) friendshipStatusMap.set(otherId, 'pending_sent')
          else friendshipStatusMap.set(otherId, 'pending_received')
        }
      }

      // Mutual friend counts — compute from the viewer's friend list.
      // Skip entirely if the viewer has no friends (common case), so we
      // don't eat an extra query for nothing.
      const mutualCountMap = new Map<string, number>()
      const { data: myFriendships } = await admin
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)

      const myFriendIds = new Set<string>()
      for (const f of myFriendships ?? []) {
        myFriendIds.add(f.requester_id === user.id ? f.addressee_id : f.requester_id)
      }

      if (myFriendIds.size > 0 && profiles.length > 0) {
        const myFriendArr = Array.from(myFriendIds)
        const profileIds = profiles.map((p) => p.id)
        // Friendships where one side is a candidate and the other is one of my friends.
        const [{ data: dir1 }, { data: dir2 }] = await Promise.all([
          admin
            .from('friendships')
            .select('requester_id, addressee_id')
            .eq('status', 'accepted')
            .in('requester_id', myFriendArr.slice(0, 200))
            .in('addressee_id', profileIds),
          admin
            .from('friendships')
            .select('requester_id, addressee_id')
            .eq('status', 'accepted')
            .in('requester_id', profileIds)
            .in('addressee_id', myFriendArr.slice(0, 200)),
        ])
        for (const f of dir1 ?? []) {
          mutualCountMap.set(f.addressee_id, (mutualCountMap.get(f.addressee_id) ?? 0) + 1)
        }
        for (const f of dir2 ?? []) {
          mutualCountMap.set(f.requester_id, (mutualCountMap.get(f.requester_id) ?? 0) + 1)
        }
      }

      // Viewer's lat/long for distance display
      const { data: viewerLoc } = await admin
        .from('profiles')
        .select('latitude, longitude')
        .eq('id', user.id)
        .single()
      const viewerLat = viewerLoc?.latitude ?? null
      const viewerLon = viewerLoc?.longitude ?? null

      otherOwners = profiles
        .map<BikeDetailOwnerCard>((p) => {
          const bikePhotoPath = bikePhotoByUserId.get(p.id) ?? null
          let distanceMiles: number | null = null
          if (viewerLat != null && viewerLon != null && p.latitude != null && p.longitude != null) {
            distanceMiles = Math.round(haversineMiles(viewerLat, viewerLon, p.latitude, p.longitude))
          }
          return {
            id: p.id,
            username: p.username,
            firstName: p.first_name,
            avatarUrl: p.profile_photo_url
              ? getImageUrl('avatars', p.profile_photo_url, undefined, p.updated_at)
              : null,
            bikePhotoUrl: bikePhotoPath ? getImageUrl('bikes', bikePhotoPath) : null,
            city: p.city,
            state: p.state,
            distanceMiles,
            mutualCount: mutualCountMap.get(p.id) ?? 0,
            friendshipStatus: friendshipStatusMap.get(p.id) ?? 'none',
          }
        })
        .sort((a, b) => {
          // Tiers in order:
          //   1. Friends first (relationship trumps everything)
          //   2. Has bike photo — ~70% of garage rows have no photo, and
          //      surfacing the photo-ful ones in the default-visible 6
          //      avoids a grid dominated by fallback avatars.
          //   3. Mutual friend count desc
          //   4. Distance asc (closer wins; missing location sorts last)
          //   5. Username asc
          const aFriend = a.friendshipStatus === 'accepted' ? 1 : 0
          const bFriend = b.friendshipStatus === 'accepted' ? 1 : 0
          if (aFriend !== bFriend) return bFriend - aFriend
          const aHasPhoto = a.bikePhotoUrl ? 1 : 0
          const bHasPhoto = b.bikePhotoUrl ? 1 : 0
          if (aHasPhoto !== bHasPhoto) return bHasPhoto - aHasPhoto
          if (a.mutualCount !== b.mutualCount) return b.mutualCount - a.mutualCount
          if (a.distanceMiles != null && b.distanceMiles != null) {
            return a.distanceMiles - b.distanceMiles
          }
          if (a.distanceMiles != null) return -1
          if (b.distanceMiles != null) return 1
          return (a.username ?? '').localeCompare(b.username ?? '')
        })
    }
  }

  const ownerAvatarUrl = ownerProfile.profile_photo_url
    ? getImageUrl('avatars', ownerProfile.profile_photo_url, undefined, ownerProfile.updated_at)
    : null

  const viewerAvatarUrl = viewerProfile?.profile_photo_url
    ? getImageUrl(
        'avatars',
        viewerProfile.profile_photo_url,
        undefined,
        viewerProfile.updated_at,
      )
    : null

  return (
    <div className="min-h-screen bg-zinc-950 pb-20 sm:pb-0">
      <LastSeenTracker />

      {/* Header — intentionally keeps the global top nav for consistency with
          the rest of the app; the in-page "back + garage name" row below is
          what gives this deep-drill page its own chrome. */}
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-4">
            <DesktopNav />
            <FindRidersLink />
            <MessagesLink userId={user.id} />
            {viewerProfile?.username && (
              <NotificationBell userId={user.id} username={viewerProfile.username} />
            )}
            {viewerProfile?.username && (
              <UserMenu
                username={viewerProfile.username}
                displayName={viewerProfile.username}
                avatarUrl={viewerAvatarUrl}
                firstInitial={(viewerProfile.first_name?.[0] ?? '?').toUpperCase()}
                role={viewerProfile.role}
              />
            )}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto sm:px-4 py-4">
        <BikeDetailClient
          bikeId={bike.id}
          bikeYear={bike.year}
          bikeMake={bike.make}
          bikeModel={bike.model}
          bikeDescription={bike.description}
          photoPaths={photoPaths}
          owner={{
            id: ownerProfile.id,
            username: ownerProfile.username,
            firstName: ownerProfile.first_name,
            avatarUrl: ownerAvatarUrl,
          }}
          isOwnBike={isOwnBike}
          friendshipStatus={friendshipStatus}
          otherOwners={otherOwners}
          totalOtherOwners={totalOtherOwners}
          viewerId={user.id}
          viewerProfile={viewerProfile}
        />
      </div>
      <BottomNav />
    </div>
  )
}
