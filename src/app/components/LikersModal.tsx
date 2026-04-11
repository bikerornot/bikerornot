'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getImageUrl } from '@/lib/supabase/image'
import { getPostLikers, type PostLiker } from '@/app/actions/posts'
import { sendFriendRequest } from '@/app/actions/friends'
import VerifiedBadge from './VerifiedBadge'

interface Props {
  postId: string
  currentUserId: string
  onClose: () => void
}

export default function LikersModal({ postId, currentUserId, onClose }: Props) {
  const [likers, setLikers] = useState<PostLiker[]>([])
  const [loading, setLoading] = useState(true)
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    getPostLikers(postId)
      .then(setLikers)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [postId])

  async function handleAddFriend(userId: string) {
    setRequestedIds((prev) => new Set(prev).add(userId))
    const result = await sendFriendRequest(userId)
    if (result?.error) {
      setRequestedIds((prev) => {
        const next = new Set(prev)
        next.delete(userId)
        return next
      })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h3 className="text-white font-semibold text-base">Likes</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {loading && (
            <div className="p-6 text-center">
              <p className="text-zinc-500 text-sm">Loading...</p>
            </div>
          )}

          {!loading && likers.length === 0 && (
            <div className="p-6 text-center">
              <p className="text-zinc-500 text-sm">No likes yet</p>
            </div>
          )}

          {likers.map((liker) => {
            const avatarUrl = liker.profile_photo_url
              ? getImageUrl('avatars', liker.profile_photo_url)
              : null
            const isMe = liker.id === currentUserId
            const isFriend = liker.friendshipStatus === 'accepted'
            const isPending = liker.friendshipStatus === 'pending_sent' || requestedIds.has(liker.id)

            return (
              <div key={liker.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/50 transition-colors">
                <Link href={`/profile/${liker.username}`} onClick={onClose} className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden">
                    {avatarUrl ? (
                      <Image src={avatarUrl} alt="" width={40} height={40} className="object-cover w-full h-full" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold text-sm">
                        {(liker.username?.[0] ?? '?').toUpperCase()}
                      </div>
                    )}
                  </div>
                </Link>

                <Link href={`/profile/${liker.username}`} onClick={onClose} className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-white text-sm font-medium truncate">@{liker.username}</span>
                    {liker.phone_verified_at && <VerifiedBadge className="w-3.5 h-3.5" />}
                  </div>
                </Link>

                {!isMe && !isFriend && !isPending && (
                  <button
                    onClick={() => handleAddFriend(liker.id)}
                    className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors"
                  >
                    Add Friend
                  </button>
                )}
                {isPending && (
                  <span className="flex-shrink-0 text-xs font-medium text-zinc-500 px-3 py-1.5">
                    Requested
                  </span>
                )}
                {isFriend && !isMe && (
                  <span className="flex-shrink-0 text-xs font-medium text-green-400/70 px-3 py-1.5">
                    Friends
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
