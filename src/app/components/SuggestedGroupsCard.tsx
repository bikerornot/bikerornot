'use client'

import { useState, useEffect, useRef, useCallback, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getSuggestedGroups, joinGroup, type SuggestedGroup } from '@/app/actions/groups'
import { getImageUrl } from '@/lib/supabase/image'

interface Props {
  currentUserId: string
}

const LOCAL_CATEGORIES = new Set(['local', 'clubs'])

export default function SuggestedGroupsCard({ currentUserId }: Props) {
  const [groups, setGroups] = useState<SuggestedGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set())
  const [joiningIds, setJoiningIds] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()
  const fetchedRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
  }, [])

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

  useEffect(() => {
    updateScrollButtons()
  }, [groups, joinedIds, updateScrollButtons])

  function scrollBy(dir: 'left' | 'right') {
    const el = scrollRef.current
    if (!el) return
    const amount = dir === 'left' ? -280 : 280
    el.scrollBy({ left: amount, behavior: 'smooth' })
  }

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

  const visible = groups.filter((g) => !joinedIds.has(g.id))
  if (visible.length === 0) return null

  return (
    <div className="bg-zinc-900 sm:border sm:border-zinc-800 overflow-hidden rounded-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-sm font-semibold text-white">Suggested Groups</span>
        <div className="flex items-center gap-3">
          <Link href="/groups" className="text-sm text-orange-400 hover:text-orange-300 transition-colors font-medium">
            See all →
          </Link>
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
      </div>

      {/* Scrollable card row */}
      <div className="relative">
        {canScrollLeft && (
          <button
            onClick={() => scrollBy('left')}
            className="absolute left-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center shadow-lg transition-colors"
            aria-label="Scroll left"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {canScrollRight && (
          <button
            onClick={() => scrollBy('right')}
            className="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center shadow-lg transition-colors"
            aria-label="Scroll right"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-zinc-900 to-transparent z-[5] pointer-events-none" />
        )}

        <div
          ref={scrollRef}
          onScroll={updateScrollButtons}
          className="flex gap-3 overflow-x-auto px-4 py-3 scrollbar-hide"
        >
          {visible.map((group) => {
            const joined = joinedIds.has(group.id)
            const joining = joiningIds.has(group.id)
            const coverUrl = group.cover_photo_url
              ? getImageUrl('covers', group.cover_photo_url)
              : null
            const showDistance = group.distance_miles != null && LOCAL_CATEGORIES.has(group.category ?? '')

            return (
              <div
                key={group.id}
                className="flex-shrink-0 w-56 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden flex flex-col"
              >
                {/* Cover image */}
                <Link href={`/groups/${group.slug}`} className="block">
                  <div className="relative h-28 bg-zinc-700">
                    {coverUrl ? (
                      <Image
                        src={coverUrl}
                        alt={group.name}
                        fill
                        className="object-cover"
                        sizes="224px"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-500">
                        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                        </svg>
                      </div>
                    )}
                  </div>
                </Link>

                {/* Info + Join */}
                <div className="px-3 pt-2 pb-3 flex flex-col gap-1.5 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/groups/${group.slug}`}
                      className="text-white font-semibold text-sm leading-tight line-clamp-2 hover:text-orange-400 transition-colors"
                    >
                      {group.name}
                    </Link>
                    <button
                      onClick={() => !joined && !joining && handleJoin(group.id)}
                      disabled={joined || joining}
                      className={`flex-shrink-0 text-xs font-semibold px-3 py-1 rounded-lg transition-colors ${
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

                  <div className="text-zinc-400 text-sm">
                    {group.member_count} member{group.member_count !== 1 ? 's' : ''}
                    {showDistance && <span> · {group.distance_miles} mi</span>}
                  </div>

                  {group.friends_in_group > 0 && (
                    <p className="text-orange-400 text-sm">
                      {group.friends_in_group} friend{group.friends_in_group !== 1 ? 's' : ''} in group
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
