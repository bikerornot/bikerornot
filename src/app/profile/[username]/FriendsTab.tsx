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

const RELATIONSHIP_LABEL: Record<string, string> = {
  single: 'Single',
  in_a_relationship: 'In a Relationship',
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

function ProfileCard({ profile, actions }: { profile: Profile; actions?: React.ReactNode }) {
  const avatarUrl = profile.profile_photo_url
    ? getImageUrl('avatars', profile.profile_photo_url)
    : null
  const initials = (profile.first_name?.[0] ?? '?').toUpperCase()

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-4 items-start">
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
        <Link
          href={`/profile/${profile.username}`}
          className="font-semibold text-white hover:text-orange-400 transition-colors truncate block"
        >
          @{profile.username}
        </Link>

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

        {actions && <div className="mt-3">{actions}</div>}
      </div>
    </div>
  )
}

export default function FriendsTab({ profileId, isOwnProfile }: Props) {
  const [friends, setFriends] = useState<Profile[]>([])
  const [pending, setPending] = useState<PendingRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    Promise.all([
      supabase
        .from('friendships')
        .select('requester_id, addressee_id, requester:profiles!requester_id(*), addressee:profiles!addressee_id(*)')
        .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`)
        .eq('status', 'accepted'),

      isOwnProfile
        ? supabase
            .from('friendships')
            .select('requester_id, requester:profiles!requester_id(*)')
            .eq('addressee_id', profileId)
            .eq('status', 'pending')
        : Promise.resolve({ data: [] }),
    ]).then(([friendsRes, pendingRes]) => {
      const rawFriends = ((friendsRes.data ?? []) as any[]).map((f) =>
        f.requester_id === profileId ? f.addressee : f.requester
      ) as Profile[]

      // Deduplicate and hide deactivated/banned/suspended accounts
      const seen = new Set<string>()
      const friendProfiles = rawFriends.filter((p) => {
        if (seen.has(p.id)) return false
        if (p.deactivated_at) return false
        if (p.status !== 'active') return false
        seen.add(p.id)
        return true
      })
      setFriends(friendProfiles)

      const pendingRequests = ((pendingRes.data ?? []) as any[])
        .filter((f) => (f.requester as Profile)?.status === 'active' && !(f.requester as Profile)?.deactivated_at)
        .map((f) => ({
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
      {friends.length === 0 && pending.length === 0 && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
          <p className="text-zinc-400 text-sm">No friends yet.</p>
        </div>
      )}

      <div className="space-y-3">
        {friends.map((friend) => (
          <ProfileCard key={friend.id} profile={friend} />
        ))}
      </div>
    </div>
  )
}
