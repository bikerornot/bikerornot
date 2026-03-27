'use client'

import { useState, useEffect, useTransition, useRef } from 'react'
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
  const [currentIndex, setCurrentIndex] = useState(0)
  const fetchedRef = useRef(false)

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

  async function handleAdd(id: string) {
    setStatuses((prev) => ({ ...prev, [id]: 'pending' }))
    try {
      await sendFriendRequest(id)
      startTransition(() => setStatuses((prev) => ({ ...prev, [id]: 'sent' })))
    } catch {
      setStatuses((prev) => ({ ...prev, [id]: 'idle' }))
    }
  }

  function getVisibleUsers(): BikeMatchUser[] {
    if (!data) return []
    return data.matches.filter((u) => statuses[u.id] !== 'sent')
  }

  function goNext() {
    const visibleUsers = getVisibleUsers()
    if (currentIndex + 1 < visibleUsers.length) {
      setCurrentIndex(currentIndex + 1)
    }
  }

  function goPrev() {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
    }
  }

  // Don't render while loading, if dismissed, capped, or no data
  if (loading || dismissed || capped || !data) return null

  const visibleUsers = getVisibleUsers()
  if (visibleUsers.length === 0) return null

  // Clamp index if users were removed (sent requests)
  const safeIndex = Math.min(currentIndex, visibleUsers.length - 1)
  const currentUser = visibleUsers[safeIndex]
  if (!currentUser) return null

  const bikeLabel = `${data.bike.make} ${data.bike.model}`
  const status = statuses[currentUser.id] ?? 'idle'
  const bikePhotoSrc = currentUser.bike_photo_url ? getImageUrl('bikes', currentUser.bike_photo_url) : null
  const avatarSrc = currentUser.profile_photo_url ? getImageUrl('avatars', currentUser.profile_photo_url) : null
  const location = [currentUser.city, currentUser.state].filter(Boolean).join(', ')
  const hasNext = safeIndex < visibleUsers.length - 1
  const hasPrev = safeIndex > 0

  return (
    <div className="bg-zinc-900 sm:border sm:border-zinc-800 overflow-hidden">
      {/* Header: avatar + "@username from City, ST rides a Make Model" + dismiss */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-zinc-800 gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <Link href={`/profile/${currentUser.username}`} className="flex-shrink-0 mt-0.5">
            <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden">
              {avatarSrc ? (
                <Image
                  src={avatarSrc}
                  alt={currentUser.username ?? ''}
                  width={40}
                  height={40}
                  className="object-cover w-full h-full"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold text-xs">
                  {currentUser.username?.[0]?.toUpperCase() ?? '?'}
                </div>
              )}
            </div>
          </Link>
          <p className="text-base text-white leading-snug">
            <Link href={`/profile/${currentUser.username}`} className="font-semibold text-white hover:underline">
              @{currentUser.username ?? 'unknown'}
            </Link>
            {location ? ` from ${location}` : ''} rides a {bikeLabel}
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Card body — bike photo with Add Friend overlay */}
      <div className="relative">
        {bikePhotoSrc && (
          <div className="relative w-full aspect-video bg-zinc-800">
            <Image
              src={bikePhotoSrc}
              alt={bikeLabel}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 640px"
            />

            {/* Bottom-right: Add Friend button */}
            <div className="absolute bottom-3 right-3 z-10">
              <button
                onClick={() => status === 'idle' && handleAdd(currentUser.id)}
                disabled={status !== 'idle'}
                className={`text-xs font-semibold px-4 py-2 rounded-lg shadow-lg transition-colors ${
                  status === 'sent'
                    ? 'bg-emerald-500/90 text-white cursor-default'
                    : status === 'pending'
                    ? 'bg-zinc-700/90 text-zinc-400 cursor-default'
                    : 'bg-orange-500 hover:bg-orange-600 text-white'
                }`}
              >
                {status === 'sent' ? '✓ Sent' : status === 'pending' ? '...' : 'Add Friend'}
              </button>
            </div>

            {/* Bottom gradient for dot indicators */}
            {visibleUsers.length > 1 && (
              <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-zinc-900/80 to-transparent pointer-events-none" />
            )}
          </div>
        )}

        {/* Navigation arrows */}
        {hasPrev && (
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center shadow-lg transition-colors"
            aria-label="Previous rider"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        {hasNext && (
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center shadow-lg transition-colors"
            aria-label="Next rider"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Dot indicators */}
      {visibleUsers.length > 1 && (
        <div className="flex justify-center gap-1.5 py-2.5">
          {visibleUsers.map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === safeIndex ? 'bg-orange-400' : 'bg-zinc-700'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
