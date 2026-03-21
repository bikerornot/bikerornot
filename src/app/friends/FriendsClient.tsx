'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { acceptFriendRequest, declineFriendRequest, toggleStarFriend } from '@/app/actions/friends'
import type { FriendRequestCard, FriendCard } from '@/app/actions/friends'
import { getImageUrl } from '@/lib/supabase/image'

interface Props {
  initialRequests: FriendRequestCard[]
  initialFriends: FriendCard[]
}

type RequestStatus = 'idle' | 'accepting' | 'declining' | 'accepted' | 'declined'

export default function FriendsClient({ initialRequests, initialFriends }: Props) {
  const [tab, setTab] = useState<'requests' | 'friends'>(
    initialRequests.length > 0 ? 'requests' : 'friends'
  )
  const [requests, setRequests] = useState(initialRequests)
  const [friends, setFriends] = useState(initialFriends)
  const [requestStatuses, setRequestStatuses] = useState<Record<string, RequestStatus>>({})
  const [search, setSearch] = useState('')
  const [, startTransition] = useTransition()

  async function handleAccept(id: string) {
    setRequestStatuses((prev) => ({ ...prev, [id]: 'accepting' }))
    try {
      await acceptFriendRequest(id)
      startTransition(() => {
        setRequestStatuses((prev) => ({ ...prev, [id]: 'accepted' }))
      })
    } catch {
      setRequestStatuses((prev) => ({ ...prev, [id]: 'idle' }))
    }
  }

  async function handleDecline(id: string) {
    setRequestStatuses((prev) => ({ ...prev, [id]: 'declining' }))
    try {
      await declineFriendRequest(id)
      startTransition(() => {
        setRequestStatuses((prev) => ({ ...prev, [id]: 'declined' }))
      })
    } catch {
      setRequestStatuses((prev) => ({ ...prev, [id]: 'idle' }))
    }
  }

  const visibleRequests = requests.filter((r) => {
    const status = requestStatuses[r.id]
    return status !== 'declined'
  })

  const filteredFriends = friends.filter((f) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      f.first_name.toLowerCase().includes(q) ||
      f.last_name.toLowerCase().includes(q) ||
      (f.username?.toLowerCase().includes(q) ?? false)
    )
  })

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 mb-5">
        <button
          onClick={() => setTab('requests')}
          className={`flex-1 text-sm font-medium py-2 rounded-lg transition-colors ${
            tab === 'requests'
              ? 'bg-zinc-800 text-white'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Requests{visibleRequests.length > 0 && ` (${visibleRequests.length})`}
        </button>
        <button
          onClick={() => setTab('friends')}
          className={`flex-1 text-sm font-medium py-2 rounded-lg transition-colors ${
            tab === 'friends'
              ? 'bg-zinc-800 text-white'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          My Friends{friends.length > 0 && ` (${friends.length})`}
        </button>
      </div>

      {/* Requests tab */}
      {tab === 'requests' && (
        <div>
          {visibleRequests.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-zinc-500 text-sm">No pending friend requests</p>
              <Link
                href="/people"
                className="text-orange-400 hover:text-orange-300 text-sm mt-2 inline-block"
              >
                Find riders to connect with
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleRequests.map((r) => {
                const status = requestStatuses[r.id] ?? 'idle'
                const photo = r.profile_photo_url
                  ? getImageUrl('avatars', r.profile_photo_url)
                  : null
                const location = [r.city, r.state].filter(Boolean).join(', ')

                return (
                  <div
                    key={r.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl p-3"
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <Link href={`/profile/${r.username}`} className="flex-shrink-0">
                        <div className="w-14 h-14 rounded-full bg-zinc-700 overflow-hidden">
                          {photo ? (
                            <Image
                              src={photo}
                              alt=""
                              width={56}
                              height={56}
                              className="object-cover w-full h-full"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold text-xl">
                              {(r.username?.[0] ?? '?').toUpperCase()}
                            </div>
                          )}
                        </div>
                      </Link>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <Link href={`/profile/${r.username}`} className="hover:underline">
                          <p className="text-white font-semibold text-base truncate">
                            @{r.username}
                          </p>
                        </Link>
                        {location && (
                          <p className="text-zinc-600 text-sm truncate">{location}</p>
                        )}
                        {r.primary_bike && (
                          <p className="text-orange-400/70 text-sm">{r.primary_bike}</p>
                        )}
                        {r.mutual_count > 0 && (
                          <p className="text-zinc-500 text-sm">
                            {r.mutual_count} mutual friend{r.mutual_count !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action buttons — full width row below on mobile */}
                    <div className="flex gap-2 mt-2.5 pt-2.5 border-t border-zinc-800">
                      {status === 'accepted' ? (
                        <span className="text-emerald-400 text-sm font-medium px-3 py-1.5">
                          Accepted
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => handleAccept(r.id)}
                            disabled={status !== 'idle'}
                            className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
                          >
                            {status === 'accepting' ? '...' : 'Accept'}
                          </button>
                          <button
                            onClick={() => handleDecline(r.id)}
                            disabled={status !== 'idle'}
                            className="flex-1 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-400 text-sm font-semibold py-2 rounded-lg transition-colors border border-zinc-700"
                          >
                            {status === 'declining' ? '...' : 'Decline'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Friends tab */}
      {tab === 'friends' && (
        <div>
          {friends.length > 0 && (
            <div className="mb-4">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search friends..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
              />
            </div>
          )}

          {filteredFriends.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-zinc-500 text-sm">
                {friends.length === 0
                  ? 'No friends yet'
                  : 'No friends match your search'}
              </p>
              {friends.length === 0 && (
                <Link
                  href="/people"
                  className="text-orange-400 hover:text-orange-300 text-sm mt-2 inline-block"
                >
                  Find riders to connect with
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredFriends.map((f) => {
                const photo = f.profile_photo_url
                  ? getImageUrl('avatars', f.profile_photo_url)
                  : null
                const location = [f.city, f.state].filter(Boolean).join(', ')

                return (
                  <div
                    key={f.id}
                    className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3 hover:border-zinc-700 transition-colors"
                  >
                    {/* Star button */}
                    <button
                      onClick={async () => {
                        const newStarred = !f.starred
                        // Optimistic update
                        setFriends((prev) => {
                          const updated = prev.map((fr) =>
                            fr.id === f.id ? { ...fr, starred: newStarred } : fr
                          )
                          return updated.sort((a, b) => {
                            if (a.starred !== b.starred) return a.starred ? -1 : 1
                            return a.first_name.localeCompare(b.first_name)
                          })
                        })
                        try {
                          await toggleStarFriend(f.id)
                        } catch {
                          // Revert on error
                          setFriends((prev) => {
                            const reverted = prev.map((fr) =>
                              fr.id === f.id ? { ...fr, starred: !newStarred } : fr
                            )
                            return reverted.sort((a, b) => {
                              if (a.starred !== b.starred) return a.starred ? -1 : 1
                              return a.first_name.localeCompare(b.first_name)
                            })
                          })
                        }
                      }}
                      className="flex-shrink-0 p-1 transition-colors"
                      title={f.starred ? 'Unstar friend' : 'Star friend'}
                    >
                      {f.starred ? (
                        <svg className="w-5 h-5 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-zinc-600 hover:text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      )}
                    </button>

                    {/* Avatar */}
                    <Link href={`/profile/${f.username}`} className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-zinc-700 overflow-hidden">
                        {photo ? (
                          <Image
                            src={photo}
                            alt=""
                            width={48}
                            height={48}
                            className="object-cover w-full h-full"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold text-lg">
                            {(f.show_real_name ? f.first_name?.[0] : f.username?.[0] ?? '?').toUpperCase()}
                          </div>
                        )}
                      </div>
                    </Link>

                    {/* Info */}
                    <Link href={`/profile/${f.username}`} className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-base truncate">
                        {f.show_real_name ? `${f.first_name} ${f.last_name}` : `@${f.username}`}
                      </p>
                      {f.show_real_name && f.username && (
                        <p className="text-zinc-500 text-sm truncate">@{f.username}</p>
                      )}
                      <div className="flex items-center gap-2">
                        {location && (
                          <p className="text-zinc-600 text-sm truncate">{location}</p>
                        )}
                        {f.riding_style.length > 0 && (
                          <p className="text-orange-400/70 text-sm truncate">{f.riding_style[0]}</p>
                        )}
                      </div>
                    </Link>

                    {/* Arrow */}
                    <Link href={`/profile/${f.username}`} className="flex-shrink-0">
                      <svg className="w-4 h-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
