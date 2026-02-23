'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/supabase/types'
import { getImageUrl } from '@/lib/supabase/image'
import { acceptFriendRequest, declineFriendRequest } from '@/app/actions/friends'

interface PendingRequest {
  requesterId: string
  profile: Profile
}

interface Props {
  profileId: string
  isOwnProfile: boolean
}

export default function FriendsTab({ profileId, isOwnProfile }: Props) {
  const [friends, setFriends] = useState<Profile[]>([])
  const [pending, setPending] = useState<PendingRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    Promise.all([
      // Accepted friends
      supabase
        .from('friendships')
        .select('requester_id, addressee_id, requester:profiles!requester_id(*), addressee:profiles!addressee_id(*)')
        .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`)
        .eq('status', 'accepted'),

      // Pending incoming requests (only relevant on own profile)
      isOwnProfile
        ? supabase
            .from('friendships')
            .select('requester_id, requester:profiles!requester_id(*)')
            .eq('addressee_id', profileId)
            .eq('status', 'pending')
        : Promise.resolve({ data: [] }),
    ]).then(([friendsRes, pendingRes]) => {
      const friendProfiles = ((friendsRes.data ?? []) as any[]).map((f) =>
        f.requester_id === profileId ? f.addressee : f.requester
      ) as Profile[]
      setFriends(friendProfiles)

      const pendingRequests = ((pendingRes.data ?? []) as any[]).map((f) => ({
        requesterId: f.requester_id,
        profile: f.requester as Profile,
      }))
      setPending(pendingRequests)
      setLoading(false)
    })
  }, [profileId, isOwnProfile])

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

  return (
    <div className="space-y-4">
      {/* Pending requests — own profile only */}
      {isOwnProfile && pending.length > 0 && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Friend Requests ({pending.length})
          </h3>
          <div className="space-y-3">
            {pending.map(({ requesterId, profile }) => {
              const avatarUrl = profile.profile_photo_url
                ? getImageUrl('avatars', profile.profile_photo_url)
                : null
              const displayName =
                profile.display_name ?? `${profile.first_name} ${profile.last_name}`
              return (
                <div key={requesterId} className="flex items-center gap-3">
                  <Link href={`/profile/${profile.username}`} className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden">
                      {avatarUrl ? (
                        <Image
                          src={avatarUrl}
                          alt={displayName}
                          width={40}
                          height={40}
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold">
                          {(profile.first_name?.[0] ?? '?').toUpperCase()}
                        </div>
                      )}
                    </div>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/profile/${profile.username}`}
                      className="text-white text-sm font-semibold hover:underline truncate block"
                    >
                      {displayName}
                    </Link>
                    <p className="text-zinc-500 text-xs">@{profile.username}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleAccept(requesterId)}
                      className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleDecline(requesterId)}
                      className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors border border-zinc-700"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Friends grid */}
      {friends.length === 0 && pending.length === 0 && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
          <p className="text-zinc-400 text-sm">No friends yet.</p>
        </div>
      )}

      {friends.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {friends.map((friend) => {
            const avatarUrl = friend.profile_photo_url
              ? getImageUrl('avatars', friend.profile_photo_url)
              : null
            const displayName =
              friend.display_name ?? `${friend.first_name} ${friend.last_name}`
            return (
              <Link key={friend.id} href={`/profile/${friend.username}`}>
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 hover:border-zinc-600 transition-colors text-center">
                  <div className="w-16 h-16 rounded-full bg-zinc-700 overflow-hidden mx-auto mb-2">
                    {avatarUrl ? (
                      <Image
                        src={avatarUrl}
                        alt={displayName}
                        width={64}
                        height={64}
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xl font-bold">
                        {(friend.first_name?.[0] ?? '?').toUpperCase()}
                      </div>
                    )}
                  </div>
                  <p className="text-white text-sm font-semibold truncate">{displayName}</p>
                  <p className="text-zinc-500 text-xs truncate">@{friend.username}</p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
