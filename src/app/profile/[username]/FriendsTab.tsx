'use client'

import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/supabase/types'
import { getImageUrl } from '@/lib/supabase/image'
import { acceptFriendRequest, declineFriendRequest, sendFriendRequest } from '@/app/actions/friends'
import VerifiedBadge from '@/app/components/VerifiedBadge'

interface PendingRequest {
  requesterId: string
  profile: Profile
}

interface Props {
  profileId: string
  isOwnProfile: boolean
  currentUserId?: string
}

const RELATIONSHIP_LABEL: Record<string, string> = {
  single: 'Single',
  in_a_relationship: 'In a Relationship',
  married: 'Married',
  its_complicated: "It's Complicated",
}

function calcAge(dob: string): number {
  const today = new Date()
  const birth = new Date(dob)
  let age = today.getFullYear() - birth.getFullYear()
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) age--
  return age
}

function ProfileCard({ profile, isMutual, mutualCount, showAddFriend, onAddFriend, actions }: {
  profile: Profile
  isMutual?: boolean
  mutualCount?: number
  showAddFriend?: boolean
  onAddFriend?: (id: string) => void
  actions?: React.ReactNode
}) {
  const avatarUrl = profile.profile_photo_url
    ? getImageUrl('avatars', profile.profile_photo_url)
    : null
  const initials = (profile.first_name?.[0] ?? '?').toUpperCase()

  const addFriendBtn = showAddFriend && onAddFriend ? (
    <button
      onClick={() => onAddFriend(profile.id)}
      className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors border border-zinc-700 whitespace-nowrap"
    >
      + Add Friend
    </button>
  ) : null

  const requestedLabel = actions ? (
    <div className="whitespace-nowrap">{actions}</div>
  ) : null

  const rightAction = addFriendBtn || requestedLabel

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex gap-4 items-start">
        <Link href={`/profile/${profile.username}`} className="flex-shrink-0">
          <div className="w-16 h-16 rounded-full bg-zinc-700 overflow-hidden">
            {avatarUrl ? (
              <Image src={avatarUrl} alt={profile.username ?? ''} width={64} height={64} className="object-cover w-full h-full" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-300 text-xl font-bold">
                {initials}
              </div>
            )}
          </div>
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/profile/${profile.username}`}
              className="font-semibold text-white hover:text-orange-400 transition-colors truncate inline-flex items-center gap-1"
            >
              @{profile.username}
              {profile.phone_verified_at && <VerifiedBadge className="w-3.5 h-3.5" />}
            </Link>
            {isMutual && (
              <span className="text-[11px] font-medium text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">
                Mutual
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-sm text-zinc-400">
            {(profile.city || profile.state) && (
              <span>📍 {[profile.city, profile.state].filter(Boolean).join(', ')}</span>
            )}
            {profile.gender && (
              <span>
                {profile.gender === 'male' ? 'Male' : 'Female'}
                {profile.date_of_birth ? `, ${calcAge(profile.date_of_birth)}` : ''}
              </span>
            )}
            {!profile.gender && profile.date_of_birth && (
              <span>{calcAge(profile.date_of_birth)}</span>
            )}
            {profile.relationship_status && (
              <span>{RELATIONSHIP_LABEL[profile.relationship_status] ?? profile.relationship_status}</span>
            )}
          </div>

          {mutualCount !== undefined && mutualCount > 0 && (
            <p className="text-xs text-zinc-500 mt-1.5">
              {mutualCount} mutual friend{mutualCount !== 1 ? 's' : ''} with you
            </p>
          )}
        </div>

        {/* Desktop: button aligned right */}
        {rightAction && (
          <div className="hidden sm:flex flex-shrink-0 items-center">
            {rightAction}
          </div>
        )}
      </div>

      {/* Mobile: button below card content */}
      {rightAction && (
        <div className="sm:hidden mt-3 pl-20">
          {rightAction}
        </div>
      )}
    </div>
  )
}

type SubTab = 'all' | 'mutual'

export default function FriendsTab({ profileId, isOwnProfile, currentUserId }: Props) {
  const [friends, setFriends] = useState<Profile[]>([])
  const [pending, setPending] = useState<PendingRequest[]>([])
  const [viewerFriendIds, setViewerFriendIds] = useState<Set<string>>(new Set())
  const [mutualFriendships, setMutualFriendships] = useState<Map<string, Set<string>>>(new Map())
  const [loading, setLoading] = useState(true)
  const [subTab, setSubTab] = useState<SubTab>('all')

  const showMutualTab = !isOwnProfile && currentUserId

  useEffect(() => {
    const supabase = createClient()

    const queries: Promise<any>[] = [
      // 1. Profile owner's friends
      Promise.resolve(
        supabase
          .from('friendships')
          .select('requester_id, addressee_id, requester:profiles!requester_id(*), addressee:profiles!addressee_id(*)')
          .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`)
          .eq('status', 'accepted')
      ),

      // 2. Pending requests (own profile only)
      isOwnProfile
        ? Promise.resolve(
            supabase
              .from('friendships')
              .select('requester_id, requester:profiles!requester_id(*)')
              .eq('addressee_id', profileId)
              .eq('status', 'pending')
          )
        : Promise.resolve({ data: [] }),

      // 3. Viewer's friend IDs (for mutual computation, only on others' profiles)
      !isOwnProfile && currentUserId
        ? Promise.resolve(
            supabase
              .from('friendships')
              .select('requester_id, addressee_id')
              .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`)
              .eq('status', 'accepted')
          )
        : Promise.resolve({ data: [] }),

      // 4. Viewer's outbound pending requests (to show "Requested" on load)
      !isOwnProfile && currentUserId
        ? Promise.resolve(
            supabase
              .from('friendships')
              .select('addressee_id')
              .eq('requester_id', currentUserId)
              .eq('status', 'pending')
          )
        : Promise.resolve({ data: [] }),
    ]

    Promise.all(queries).then(([friendsRes, pendingRes, viewerFriendsRes, viewerPendingRes]) => {
      // Parse profile owner's friends
      const rawFriends = ((friendsRes.data ?? []) as any[]).map((f: any) =>
        f.requester_id === profileId ? f.addressee : f.requester
      ) as Profile[]

      const seen = new Set<string>()
      const friendProfiles = rawFriends.filter((p) => {
        if (seen.has(p.id)) return false
        if (p.deactivated_at) return false
        if (p.status !== 'active') return false
        seen.add(p.id)
        return true
      })
      setFriends(friendProfiles)

      // Parse pending requests
      const pendingRequests = ((pendingRes.data ?? []) as any[])
        .filter((f: any) => (f.requester as Profile)?.status === 'active' && !(f.requester as Profile)?.deactivated_at)
        .map((f: any) => ({
          requesterId: f.requester_id,
          profile: f.requester as Profile,
        }))
      setPending(pendingRequests)

      // Parse viewer's friend IDs for mutual computation
      if (!isOwnProfile && currentUserId) {
        const vIds = new Set<string>()
        for (const f of (viewerFriendsRes.data ?? []) as any[]) {
          const friendId = f.requester_id === currentUserId ? f.addressee_id : f.requester_id
          vIds.add(friendId)
        }
        setViewerFriendIds(vIds)

        // Seed pending outbound requests so "Requested" shows on load
        const pendingOutbound = new Set<string>()
        for (const f of (viewerPendingRes.data ?? []) as any[]) {
          pendingOutbound.add(f.addressee_id)
        }
        setRequestedIds(pendingOutbound)
      }

      setLoading(false)
    })
  }, [profileId, isOwnProfile, currentUserId])

  // Compute mutual friend IDs (intersection of profile owner's friends and viewer's friends)
  const mutualFriendIds = useMemo(() => {
    if (isOwnProfile || !currentUserId) return new Set<string>()
    const mutualIds = new Set<string>()
    for (const f of friends) {
      if (viewerFriendIds.has(f.id)) mutualIds.add(f.id)
    }
    return mutualIds
  }, [friends, viewerFriendIds, isOwnProfile, currentUserId])

  // Fetch friendships for all profile friends to compute mutual counts with viewer
  useEffect(() => {
    if (friends.length === 0 || !currentUserId || isOwnProfile) return

    const supabase = createClient()
    const ids = friends.map(f => f.id)

    // Fetch all friendships where either side is one of the profile's friends
    Promise.resolve(
      supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .or(`requester_id.in.(${ids.join(',')}),addressee_id.in.(${ids.join(',')})`)
        .eq('status', 'accepted')
    ).then(({ data }) => {
      const friendSets = new Map<string, Set<string>>()
      for (const id of ids) friendSets.set(id, new Set())

      for (const row of (data ?? []) as any[]) {
        const rid = row.requester_id as string
        const aid = row.addressee_id as string
        if (friendSets.has(rid)) friendSets.get(rid)!.add(aid)
        if (friendSets.has(aid)) friendSets.get(aid)!.add(rid)
      }

      setMutualFriendships(friendSets)
    })
  }, [friends, currentUserId, isOwnProfile])

  // Compute mutual count for a given mutual friend (how many of their friends are also viewer's friends)
  function getMutualCount(friendId: string): number {
    const theirFriends = mutualFriendships.get(friendId)
    if (!theirFriends) return 0
    let count = 0
    for (const id of theirFriends) {
      if (viewerFriendIds.has(id)) count++
    }
    return count
  }

  const mutualFriends = useMemo(
    () => friends.filter(f => mutualFriendIds.has(f.id)),
    [friends, mutualFriendIds]
  )

  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set())

  async function handleAddFriend(friendId: string) {
    setRequestedIds(prev => new Set(prev).add(friendId))
    const result = await sendFriendRequest(friendId)
    if (result?.error) {
      // Revert on error
      setRequestedIds(prev => {
        const next = new Set(prev)
        next.delete(friendId)
        return next
      })
    }
  }

  async function handleAccept(requesterId: string) {
    await acceptFriendRequest(requesterId)
    const accepted = pending.find((p) => p.requesterId === requesterId)
    if (accepted) {
      setPending((prev) => prev.filter((p) => p.requesterId !== requesterId))
      setFriends((prev) => [...prev, accepted.profile])
    }
  }

  async function handleDecline(requesterId: string) {
    await declineFriendRequest(requesterId)
    setPending((prev) => prev.filter((p) => p.requesterId !== requesterId))
  }

  if (loading) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
        <p className="text-zinc-500 text-sm">Loading…</p>
      </div>
    )
  }

  const displayFriends = subTab === 'mutual' ? mutualFriends : friends

  return (
    <div className="space-y-4">
      {/* Sub-tab pills — only on other people's profiles */}
      {showMutualTab && (
        <div className="flex gap-2 px-4 sm:px-0">
          <button
            onClick={() => setSubTab('all')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              subTab === 'all'
                ? 'bg-orange-500 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            All Friends ({friends.length})
          </button>
          <button
            onClick={() => setSubTab('mutual')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              subTab === 'mutual'
                ? 'bg-orange-500 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Mutual ({mutualFriends.length})
          </button>
        </div>
      )}

      {/* Pending requests — own profile only */}
      {isOwnProfile && pending.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Friend Requests ({pending.length})
          </h3>
          <div className="space-y-3">
            {pending.map(({ requesterId, profile }) => (
              <ProfileCard
                key={requesterId}
                profile={profile}
                actions={
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAccept(requesterId)}
                      className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleDecline(requesterId)}
                      className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors border border-zinc-700"
                    >
                      Decline
                    </button>
                  </div>
                }
              />
            ))}
          </div>

          {friends.length > 0 && (
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mt-6 mb-3">
              Friends ({friends.length})
            </h3>
          )}
        </div>
      )}

      {/* Friends list */}
      {displayFriends.length === 0 && pending.length === 0 && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
          <p className="text-zinc-400 text-sm">
            {subTab === 'mutual' ? 'No mutual friends.' : 'No friends yet.'}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {displayFriends.map((friend) => {
          const count = showMutualTab && friend.id !== currentUserId ? getMutualCount(friend.id) : undefined
          const isMutual = mutualFriendIds.has(friend.id)
          const isRequested = requestedIds.has(friend.id)
          // Show Add Friend on non-mutual friends in All view (not own profile, not self)
          const canAdd = subTab === 'all' && !isOwnProfile && !isMutual && friend.id !== currentUserId
          return (
            <ProfileCard
              key={friend.id}
              profile={friend}
              isMutual={subTab === 'all' && isMutual}
              mutualCount={count}
              showAddFriend={canAdd && !isRequested}
              onAddFriend={handleAddFriend}
              actions={isRequested && canAdd ? (
                <span className="text-xs text-zinc-500 font-medium">Requested</span>
              ) : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}
