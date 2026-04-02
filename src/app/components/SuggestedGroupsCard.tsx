'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getSuggestedGroups, joinGroup, type SuggestedGroup } from '@/app/actions/groups'
import { getImageUrl } from '@/lib/supabase/image'

interface Props {
  currentUserId: string
}

export default function SuggestedGroupsCard({ currentUserId }: Props) {
  const [groups, setGroups] = useState<SuggestedGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set())
  const [joiningIds, setJoiningIds] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    getSuggestedGroups()
      .then((result) => {
        setGroups(result)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function handleJoin(groupId: string) {
    setJoiningIds((prev) => new Set(prev).add(groupId))
    try {
      await joinGroup(groupId)
      startTransition(() => {
        setJoinedIds((prev) => new Set(prev).add(groupId))
        setJoiningIds((prev) => {
          const next = new Set(prev)
          next.delete(groupId)
          return next
        })
      })
    } catch {
      setJoiningIds((prev) => {
        const next = new Set(prev)
        next.delete(groupId)
        return next
      })
    }
  }

  if (loading || dismissed || groups.length === 0) return null

  // Hide card if all groups have been joined
  const unjoined = groups.filter((g) => !joinedIds.has(g.id))
  if (unjoined.length === 0) return null

  return (
    <div className="bg-zinc-900 sm:border sm:border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
          <span className="text-sm font-semibold text-white">Suggested Groups</span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-zinc-600 hover:text-zinc-400 transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Single group card */}
      {(() => {
        const group = groups[0]
        const joined = joinedIds.has(group.id)
        const joining = joiningIds.has(group.id)
        const coverUrl = group.cover_photo_url
          ? getImageUrl('covers', group.cover_photo_url)
          : null
        const location = [group.city, group.state].filter(Boolean).join(', ')

        return (
          <div className="px-4 py-3">
            <div className="flex gap-3">
              {/* Image */}
              <Link href={`/groups/${group.slug}`} className="flex-shrink-0">
                <div className="w-16 h-16 rounded-lg bg-zinc-800 overflow-hidden">
                  {coverUrl ? (
                    <Image
                      src={coverUrl}
                      alt={group.name}
                      width={64}
                      height={64}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-500">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                      </svg>
                    </div>
                  )}
                </div>
              </Link>

              {/* Text + Join button */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/groups/${group.slug}`}
                    className="text-base font-bold text-white hover:text-orange-400 transition-colors line-clamp-1"
                  >
                    {group.name}
                  </Link>
                  <button
                    onClick={() => !joined && !joining && handleJoin(group.id)}
                    disabled={joined || joining}
                    className={`flex-shrink-0 text-sm font-semibold px-4 py-1 rounded-lg transition-colors ${
                      joined
                        ? 'bg-emerald-500/20 text-emerald-400 cursor-default'
                        : joining
                        ? 'bg-zinc-700 text-zinc-400 cursor-default'
                        : 'bg-orange-500 hover:bg-orange-600 text-white'
                    }`}
                  >
                    {joined ? 'Joined' : joining ? '...' : 'Join'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-x-2 mt-0.5 text-sm text-zinc-400">
                  <span>{group.member_count} member{group.member_count !== 1 ? 's' : ''}</span>
                  {location && <span>{location}</span>}
                  {group.distance_miles != null && (
                    <span>{group.distance_miles} mi away</span>
                  )}
                </div>

                {group.friends_in_group > 0 && (
                  <p className="text-sm text-orange-400 mt-0.5">
                    {group.friends_in_group} friend{group.friends_in_group !== 1 ? 's' : ''} in this group
                  </p>
                )}

                {group.description && (
                  <p className="text-base text-zinc-300 mt-1 line-clamp-2">{group.description}</p>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
