'use client'

import { useState, useEffect, useRef, useCallback, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getNearbyLocalGroups, joinGroup, type NearbyLocalGroup } from '@/app/actions/groups'
import { getImageUrl } from '@/lib/supabase/image'

interface Props {
  currentUserId: string
}

export default function LocalGroupsCard({ currentUserId }: Props) {
  const [groups, setGroups] = useState<NearbyLocalGroup[]>([])
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
    getNearbyLocalGroups()
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
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
          <span className="text-sm font-semibold text-white">Local Riding Groups Near You</span>
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
            const location = [group.city, group.state].filter(Boolean).join(', ')

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
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                        </svg>
                      </div>
                    )}
                  </div>
                </Link>

                {/* Info */}
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
                  </div>

                  {location && (
                    <div className="flex items-center gap-1 text-zinc-400 text-sm">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                      </svg>
                      <span>{location} · {group.distance_miles} mi</span>
                    </div>
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
