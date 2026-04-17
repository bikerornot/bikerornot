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
    flyer_url?: string | null
    starts_at: string
    city: string | null
    state: string | null
    venue_name: string | null
    going_count: number
    interested_count: number
    category: string | null
    status: string
    recurrence_rule?: string | null
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
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function EventCard({ event }: Props) {
  const location = [event.venue_name, [event.city, event.state].filter(Boolean).join(', ')].filter(Boolean).join(' — ')
  const isCancelled = event.status === 'cancelled'
  // Thumbnail prefers the flyer (portrait, designed artwork) over the cover
  // when both exist. Falls back to whichever is set.
  const thumbPath = event.flyer_url || event.cover_photo_url
  const coverUrl = thumbPath ? getImageUrl('covers', thumbPath) : null

  return (
    <Link
      href={`/events/${event.slug}`}
      className="flex bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:bg-zinc-800/50 hover:border-zinc-700 transition-colors"
    >
      {/* Thumbnail — portrait 4:5, fixed width so flyers read naturally */}
      <div className="relative w-24 sm:w-28 aspect-[4/5] bg-zinc-800 flex-shrink-0">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={event.title}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 96px, 112px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            {event.type === 'ride' ? (
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.44 9.03L15.41 5H11v2h3.59l2 2H5c-2.8 0-5 2.2-5 5s2.2 5 5 5c2.46 0 4.45-1.69 4.9-4h1.65l2.77-2.77c-.21.54-.32 1.14-.32 1.77 0 2.8 2.2 5 5 5s5-2.2 5-5c0-2.8-2.2-5-5-5-1.09 0-2.09.35-2.91.93L14.4 9.03h5.04zM5 17c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3zm14 0c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z" />
              </svg>
            ) : (
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            )}
          </div>
        )}
      </div>

      {/* Info column */}
      <div className="flex-1 min-w-0 p-3 flex flex-col">
        {/* Date + type pill */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-semibold ${isCancelled ? 'text-red-400' : 'text-orange-400'}`}>
            {isCancelled ? 'Cancelled' : formatCardDate(event.starts_at)}
          </span>
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
            event.type === 'ride' ? 'bg-blue-500/15 text-blue-400' : 'bg-zinc-800 text-zinc-400'
          }`}>
            {event.type === 'ride' ? 'Ride' : 'Event'}
          </span>
          {event.recurrence_rule && (
            <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded-full">
              {event.recurrence_rule === 'weekly' ? 'Weekly' : event.recurrence_rule === 'biweekly' ? 'Biweekly' : 'Monthly'}
            </span>
          )}
        </div>

        {/* Title — 2 lines max */}
        <h3 className={`text-base font-semibold leading-snug mt-1 line-clamp-2 ${isCancelled ? 'text-zinc-500 line-through' : 'text-white'}`}>
          {event.title}
        </h3>

        {/* Location */}
        {location && (
          <p className="text-zinc-400 text-sm mt-1 truncate">{location}</p>
        )}

        {/* Attendance */}
        {(event.going_count > 0 || event.interested_count > 0) && (
          <div className="flex items-center gap-3 mt-auto pt-1.5 text-sm text-zinc-400">
            {event.going_count > 0 && (
              <span>
                <span className="text-zinc-200 font-medium">{event.going_count}</span> going
              </span>
            )}
            {event.interested_count > 0 && (
              <span>
                <span className="text-zinc-300">{event.interested_count}</span> interested
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}
