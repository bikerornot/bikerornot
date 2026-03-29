'use client'

import Link from 'next/link'
import Image from 'next/image'
import { getImageUrl } from '@/lib/supabase/image'

interface Props {
  event: {
    id: string
    type: 'ride' | 'event'
    title: string
    slug: string
    cover_photo_url: string | null
    starts_at: string
    city: string | null
    state: string | null
    venue_name: string | null
    going_count: number
    interested_count: number
    category: string | null
    status: string
    creator?: {
      username: string | null
      profile_photo_url: string | null
    } | null
  }
}

function formatCardDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (d.toDateString() === now.toDateString()) {
    return 'Today at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  if (d.toDateString() === tomorrow.toDateString()) {
    return 'Tomorrow at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function EventCard({ event }: Props) {
  const coverUrl = event.cover_photo_url ? getImageUrl('covers', event.cover_photo_url) : null
  const location = [event.venue_name, [event.city, event.state].filter(Boolean).join(', ')].filter(Boolean).join(' — ')
  const isCancelled = event.status === 'cancelled'

  return (
    <Link
      href={`/events/${event.slug}`}
      className="block bg-zinc-900 sm:border sm:border-zinc-800 sm:rounded-xl overflow-hidden hover:bg-zinc-800/50 transition-colors"
    >
      {/* Cover image or gradient */}
      {coverUrl ? (
        <div className="relative w-full aspect-[3/1] bg-zinc-800">
          <Image src={coverUrl} alt="" fill className="object-cover" sizes="(max-width: 640px) 100vw, 640px" />
          {isCancelled && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-red-400 font-bold text-sm bg-black/60 px-3 py-1 rounded-full">Cancelled</span>
            </div>
          )}
        </div>
      ) : (
        <div className={`w-full h-16 ${isCancelled ? 'bg-red-500/10' : 'bg-gradient-to-r from-orange-500/10 to-zinc-900'}`} />
      )}

      <div className="px-4 py-3">
        {/* Date + type badge */}
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-sm font-semibold ${isCancelled ? 'text-red-400' : 'text-orange-400'}`}>
            {isCancelled ? 'Cancelled' : formatCardDate(event.starts_at)}
          </span>
          <span className={`text-sm font-medium px-1.5 py-0.5 rounded-full ${
            event.type === 'ride' ? 'bg-blue-500/15 text-blue-400' : 'bg-zinc-800 text-zinc-400'
          }`}>
            {event.type === 'ride' ? 'Ride' : 'Event'}
          </span>
        </div>

        {/* Title */}
        <h3 className={`text-base font-semibold ${isCancelled ? 'text-zinc-500 line-through' : 'text-white'}`}>
          {event.title}
        </h3>

        {/* Location */}
        {location && (
          <p className="text-zinc-500 text-sm mt-0.5 truncate">{location}</p>
        )}

        {/* Attendance */}
        <div className="flex items-center gap-3 mt-2">
          {event.going_count > 0 && (
            <span className="text-zinc-400 text-sm">
              {event.going_count} going
            </span>
          )}
          {event.interested_count > 0 && (
            <span className="text-zinc-500 text-sm">
              {event.interested_count} interested
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
