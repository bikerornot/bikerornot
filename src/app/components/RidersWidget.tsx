'use client'

import { useState, useEffect, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { sendFriendRequest } from '@/app/actions/friends'
import type { RiderSuggestion } from '@/app/actions/suggestions'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const DISMISSED_KEY = 'bon_dismissed_suggestions'
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

  // Read localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const hidden = localStorage.getItem(WIDGET_HIDDEN_KEY) === 'true'
    const dismissed: string[] = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]')
    setWidgetHidden(hidden)
    setDismissedIds(new Set(dismissed))
    setMounted(true)
  }, [])

  // Hide widget entirely at 15+ friends
  if (friendCount >= 15) return null
  // Don't render until localStorage is read (prevents flash)
  if (!mounted) return null
  if (widgetHidden) return null

  const riders = initialRiders.filter((r) => !dismissedIds.has(r.id))
  if (riders.length === 0) return null

  const isCompact = friendCount >= 5

  function dismissWidget() {
    setWidgetHidden(true)
    localStorage.setItem(WIDGET_HIDDEN_KEY, 'true')
  }

  function dismissRider(id: string) {
    const next = new Set(dismissedIds)
    next.add(id)
    setDismissedIds(next)
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(next)))
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
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">
            {isCompact ? 'Riders you might know' : 'Riders near you'}
          </span>
          <span className="text-xs text-zinc-500">{riders.length} suggestions</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/people" className="text-xs text-orange-400 hover:text-orange-300 transition-colors font-medium">
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
      <div className="flex gap-3 overflow-x-auto px-4 py-3 scrollbar-hide">
        {riders.map((rider) => {
          const status = statuses[rider.id] ?? 'idle'
          const photo = rider.profile_photo_url ? avatarUrl(rider.profile_photo_url) : null
          const location = [rider.city, rider.state].filter(Boolean).join(', ')
          const topStyle = rider.riding_style[0] ?? null

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
                  <p className="text-zinc-400 text-xs font-medium leading-tight truncate">
                    @{rider.username ?? 'unknown'}
                  </p>
                  {location && (
                    <p className="text-zinc-500 text-xs truncate leading-tight mt-0.5">{location}</p>
                  )}
                  {rider.distance_miles != null && (
                    <p className="text-zinc-600 text-xs leading-tight">
                      {rider.distance_miles < 1 ? '< 1 mi' : `${rider.distance_miles} mi`}
                    </p>
                  )}
                  {topStyle && (
                    <p className="text-orange-400/80 text-xs leading-tight truncate mt-0.5">{topStyle}</p>
                  )}
                </div>

                {/* Add button */}
                <button
                  onClick={() => status === 'idle' && handleAdd(rider.id)}
                  disabled={status !== 'idle'}
                  className={`w-full text-xs font-semibold py-1.5 rounded-lg transition-colors mt-auto ${
                    status === 'sent'
                      ? 'bg-emerald-500/20 text-emerald-400 cursor-default'
                      : status === 'pending'
                      ? 'bg-zinc-700 text-zinc-500 cursor-default'
                      : 'bg-orange-500 hover:bg-orange-600 text-white'
                  }`}
                >
                  {status === 'sent' ? '✓ Sent' : status === 'pending' ? '…' : '+ Add'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Phase hint for new users */}
      {!isCompact && (
        <p className="text-center text-zinc-600 text-xs pb-3">
          Connect with riders to fill your feed
        </p>
      )}
    </div>
  )
}
