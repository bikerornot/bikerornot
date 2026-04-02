'use client'

import { useState, useEffect, useTransition, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { sendFriendRequest } from '@/app/actions/friends'
import { getMotorcycleMatches, type BikeMatchResult, type BikeMatchUser } from '@/app/actions/discovery'
import { getImageUrl } from '@/lib/supabase/image'

const CAP_KEY = 'bon_bike_match_cap'
const CAP_DAYS = 14

type CardStatus = 'idle' | 'pending' | 'sent'

interface Props {
  currentUserId: string
}

export default function BikeMatchCard({ currentUserId }: Props) {
  const [, startTransition] = useTransition()
  const [data, setData] = useState<BikeMatchResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [statuses, setStatuses] = useState<Record<string, CardStatus>>({})
  const [dismissed, setDismissed] = useState(false)
  const [capped, setCapped] = useState(false)
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

  // Fetch data once on mount
  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    getMotorcycleMatches()
      .then((result) => {
        if (result) {
          // Check frequency cap
          const bikeKey = `${result.bike.make}-${result.bike.model}`.toLowerCase()
          const matchIds = result.matches.map((m) => m.id).sort().join(',')

          try {
            const stored = JSON.parse(localStorage.getItem(CAP_KEY) ?? 'null')
            if (stored && stored.bikeKey === bikeKey && stored.matchIds === matchIds) {
              const daysSince = (Date.now() - new Date(stored.firstShown).getTime()) / 86_400_000
              if (daysSince >= CAP_DAYS) {
                setCapped(true)
                setLoading(false)
                return
              }
            } else {
              localStorage.setItem(CAP_KEY, JSON.stringify({
                bikeKey,
                matchIds,
                firstShown: new Date().toISOString(),
              }))
            }
          } catch {
            // localStorage not available
          }

          setData(result)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    updateScrollButtons()
  }, [data, statuses, updateScrollButtons])

  function scrollBy(dir: 'left' | 'right') {
    const el = scrollRef.current
    if (!el) return
    const amount = dir === 'left' ? -280 : 280
    el.scrollBy({ left: amount, behavior: 'smooth' })
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

  // Don't render while loading, if dismissed, capped, or no data
  if (loading || dismissed || capped || !data) return null

  const visibleUsers = data.matches.filter((u) => statuses[u.id] !== 'sent')
  if (visibleUsers.length === 0) return null

  const bikeLabel = `${data.bike.make} ${data.bike.model}`

  return (
    <div className="bg-zinc-900 sm:border sm:border-zinc-800 overflow-hidden rounded-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-sm font-semibold text-white">Riders With Your Ride</span>
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
          {visibleUsers.map((rider) => {
            const status = statuses[rider.id] ?? 'idle'
            const bikePhotoSrc = rider.bike_photo_url ? getImageUrl('bikes', rider.bike_photo_url) : null
            const avatarSrc = rider.profile_photo_url ? getImageUrl('avatars', rider.profile_photo_url) : null
            const yearLabel = rider.bike_year ? `${rider.bike_year} ${bikeLabel}` : bikeLabel
            const garageUrl = `/profile/${rider.username}?tab=Garage`

            return (
              <div
                key={rider.id}
                className="flex-shrink-0 w-56 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden flex flex-col"
              >
                {/* Bike photo — links to garage */}
                <Link href={garageUrl} className="block">
                  <div className="relative h-36 bg-zinc-700">
                    {bikePhotoSrc ? (
                      <Image
                        src={bikePhotoSrc}
                        alt={yearLabel}
                        fill
                        className="object-cover"
                        sizes="224px"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-500 text-3xl">
                        🏍️
                      </div>
                    )}
                    {/* Profile avatar overlay */}
                    <Link href={`/profile/${rider.username}`} className="absolute top-2 left-2 z-10">
                      <div className="w-8 h-8 rounded-full bg-zinc-700 border-2 border-zinc-900 overflow-hidden shadow-lg">
                        {avatarSrc ? (
                          <Image src={avatarSrc} alt={rider.username ?? ''} width={32} height={32} className="object-cover w-full h-full" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold text-xs">
                            {rider.username?.[0]?.toUpperCase() ?? '?'}
                          </div>
                        )}
                      </div>
                    </Link>
                  </div>
                </Link>

                {/* Info */}
                <div className="px-3 pt-2 pb-3 flex flex-col gap-1.5 flex-1">
                  <Link href={garageUrl} className="text-white font-semibold text-sm leading-tight hover:text-orange-400 transition-colors">
                    {yearLabel}
                  </Link>
                  <Link href={`/profile/${rider.username}`} className="text-zinc-400 text-sm hover:text-orange-400 transition-colors">
                    @{rider.username ?? 'unknown'}
                  </Link>

                  {/* Add Friend button */}
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
