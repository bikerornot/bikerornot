'use client'

import { useState, useEffect, useTransition, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { sendFriendRequest } from '@/app/actions/friends'
import { dismissSuggestion } from '@/app/actions/suggestions'
import type { RiderSuggestion } from '@/app/actions/suggestions'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const WIDGET_HIDDEN_KEY = 'bon_widget_hidden'

function avatarUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}`
}

type CardStatus = 'idle' | 'pending' | 'sent'

interface Props {
  initialRiders: RiderSuggestion[]
  friendCount: number
}

export default function RidersWidget({ initialRiders, friendCount }: Props) {
  const [, startTransition] = useTransition()
  const [widgetHidden, setWidgetHidden] = useState(false)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [statuses, setStatuses] = useState<Record<string, CardStatus>>({})
  const [mounted, setMounted] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
  }, [])

  // Read localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const hidden = localStorage.getItem(WIDGET_HIDDEN_KEY) === 'true'
    setWidgetHidden(hidden)
    setMounted(true)
  }, [])

  // Check scroll state on mount and when riders change
  useEffect(() => {
    updateScrollButtons()
  }, [mounted, dismissedIds, updateScrollButtons])

  function scrollBy(dir: 'left' | 'right') {
    const el = scrollRef.current
    if (!el) return
    const amount = dir === 'left' ? -280 : 280
    el.scrollBy({ left: amount, behavior: 'smooth' })
  }

  // Don't render until localStorage is read (prevents flash)
  if (!mounted) return null
  if (widgetHidden) return null

  // Dismissed users are already excluded server-side, but also filter client-side
  // for instant removal without waiting for page reload
  const riders = initialRiders.filter((r) => !dismissedIds.has(r.id))
  if (riders.length === 0) return null

  const isCompact = friendCount >= 5

  function dismissWidget() {
    setWidgetHidden(true)
    localStorage.setItem(WIDGET_HIDDEN_KEY, 'true')
  }

  function dismissRider(id: string) {
    // Instant client-side removal
    const next = new Set(dismissedIds)
    next.add(id)
    setDismissedIds(next)
    // Persist to database so they're excluded on next page load
    dismissSuggestion(id).catch(() => {})
  }

  async function handleAdd(id: string) {
    setStatuses((prev) => ({ ...prev, [id]: 'pending' }))
    try {
      await sendFriendRequest(id)
      startTransition(() => setStatuses((prev) => ({ ...prev, [id]: 'sent' })))
    } catch {
      setStatuses((prev) => ({ ...prev, [id]: 'idle' }))
    }
  }

  return (
    <div className={`bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden ${isCompact ? 'mb-4' : 'mb-5'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-sm font-semibold text-white">
          Riders to Connect With
        </span>
        <div className="flex items-center gap-3">
          <Link href="/people" className="text-sm text-orange-400 hover:text-orange-300 transition-colors font-medium">
            See all →
          </Link>
          <button
            onClick={dismissWidget}
            className="text-zinc-600 hover:text-zinc-400 transition-colors"
            aria-label="Dismiss suggestions"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Scrollable card row */}
      <div className="relative">
        {/* Left arrow */}
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

        {/* Right arrow */}
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

        {/* Right fade hint */}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-zinc-900 to-transparent z-[5] pointer-events-none" />
        )}

      <div
        ref={scrollRef}
        onScroll={updateScrollButtons}
        className="flex gap-3 overflow-x-auto px-4 py-3 scrollbar-hide"
      >
        {riders.map((rider) => {
          const status = statuses[rider.id] ?? 'idle'
          const photo = rider.profile_photo_url ? avatarUrl(rider.profile_photo_url) : null
          const location = [rider.city, rider.state].filter(Boolean).join(', ')
          const bikeInfo = rider.bike ?? null

          return (
            <div
              key={rider.id}
              className={`flex-shrink-0 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden flex flex-col ${
                isCompact ? 'w-28' : 'w-32'
              }`}
            >
              {/* Photo */}
              <div className="relative">
                <Link href={`/profile/${rider.username}`} className="block">
                  <div className={`relative bg-zinc-700 ${isCompact ? 'h-28' : 'h-32'}`}>
                    {photo ? (
                      <Image
                        src={photo}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="128px"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold text-2xl">
                        {rider.username?.[0]?.toUpperCase() ?? '?'}
                      </div>
                    )}
                  </div>
                </Link>
                {/* Dismiss X */}
                <button
                  onClick={() => dismissRider(rider.id)}
                  className="absolute top-1.5 right-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full w-5 h-5 flex items-center justify-center transition-colors"
                  aria-label="Hide suggestion"
                >
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Info */}
              <div className="px-2 pt-2 pb-2.5 flex flex-col gap-1.5 flex-1">
                <div>
                  <p className="text-zinc-400 text-sm font-medium leading-tight truncate">
                    @{rider.username ?? 'unknown'}
                  </p>
                  {location && (
                    <p className="text-zinc-500 text-sm truncate leading-tight mt-0.5">{location}</p>
                  )}
                  {rider.mutual_friend_count > 0 && (
                    <p className="text-zinc-500 text-sm leading-tight mt-0.5">
                      {rider.mutual_friend_count} mutual
                    </p>
                  )}
                </div>

                {/* Add button */}
                <button
                  onClick={() => status === 'idle' && handleAdd(rider.id)}
                  disabled={status !== 'idle'}
                  className={`w-full text-sm font-semibold py-1.5 rounded-lg transition-colors mt-auto ${
                    status === 'sent'
                      ? 'bg-emerald-500/20 text-emerald-400 cursor-default'
                      : status === 'pending'
                      ? 'bg-zinc-700 text-zinc-500 cursor-default'
                      : 'bg-orange-500 hover:bg-orange-600 text-white'
                  }`}
                >
                  {status === 'sent' ? '✓ Sent' : status === 'pending' ? '…' : 'Add Friend'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      </div>
    </div>
  )
}
