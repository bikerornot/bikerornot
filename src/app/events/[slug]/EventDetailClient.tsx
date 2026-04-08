'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getImageUrl } from '@/lib/supabase/image'
import { rsvpEvent, cancelRsvp, cancelEvent, getEventAttendees, type EventDetail, type RsvpStatus } from '@/app/actions/events'
import VerifiedBadge from '@/app/components/VerifiedBadge'
import InviteToEventButton from './InviteToEventButton'
import ShareToGroupButton from './ShareToGroupButton'

function formatEventDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatEventTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

interface Props {
  event: EventDetail
  currentUserId: string
  goingList: any[]
  interestedList: any[]
  upcomingDates?: string[]
}

export default function EventDetailClient({ event, currentUserId, goingList: initialGoing, interestedList: initialInterested, upcomingDates = [] }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [myRsvp, setMyRsvp] = useState<RsvpStatus | null>(event.my_rsvp ?? null)
  const [goingCount, setGoingCount] = useState(event.going_count)
  const [interestedCount, setInterestedCount] = useState(event.interested_count)
  const [goingList, setGoingList] = useState(initialGoing)
  const [interestedList, setInterestedList] = useState(initialInterested)
  const [rsvpBusy, setRsvpBusy] = useState(false)
  const [tab, setTab] = useState<'details' | 'attendees'>('details')
  const [cancelBusy, setCancelBusy] = useState(false)

  async function refreshAttendees() {
    const [going, interested] = await Promise.all([
      getEventAttendees(event.id, 'going'),
      getEventAttendees(event.id, 'interested'),
    ])
    setGoingList(going)
    setInterestedList(interested)
  }

  const isCreator = event.creator_id === currentUserId
  const isCancelled = event.status === 'cancelled'
  const isFull = event.max_attendees ? goingCount >= event.max_attendees : false

  const creator = event.creator
  const creatorAvatar = creator?.profile_photo_url
    ? getImageUrl('avatars', creator.profile_photo_url)
    : null

  const cityStateZip = [
    [event.city, event.state].filter(Boolean).join(', '),
    event.zip_code,
  ].filter(Boolean).join(' ')
  const location = [event.venue_name, event.address, cityStateZip].filter(Boolean).join(' — ')

  async function handleRsvp(status: RsvpStatus) {
    if (rsvpBusy || isCancelled) return

    // Toggle off if already set
    if (myRsvp === status) {
      setRsvpBusy(true)
      const oldStatus = myRsvp
      setMyRsvp(null)
      if (oldStatus === 'going') setGoingCount((c) => c - 1)
      else setInterestedCount((c) => c - 1)
      try {
        await cancelRsvp(event.id)
        refreshAttendees()
      } catch {
        setMyRsvp(oldStatus)
        if (oldStatus === 'going') setGoingCount((c) => c + 1)
        else setInterestedCount((c) => c + 1)
      } finally {
        setRsvpBusy(false)
      }
      return
    }

    setRsvpBusy(true)
    const oldRsvp = myRsvp
    const oldGoing = goingCount
    const oldInterested = interestedCount

    // Optimistic update
    setMyRsvp(status)
    if (oldRsvp === 'going') setGoingCount((c) => c - 1)
    if (oldRsvp === 'interested') setInterestedCount((c) => c - 1)
    if (status === 'going') setGoingCount((c) => c + 1)
    if (status === 'interested') setInterestedCount((c) => c + 1)

    try {
      const result = await rsvpEvent(event.id, status)
      if (result.error && result.error.includes('full')) {
        setMyRsvp('interested')
        setGoingCount(oldGoing)
        setInterestedCount(oldInterested + 1)
      }
      refreshAttendees()
    } catch {
      setMyRsvp(oldRsvp)
      setGoingCount(oldGoing)
      setInterestedCount(oldInterested)
    } finally {
      setRsvpBusy(false)
    }
  }

  async function handleCancel() {
    if (!confirm('Are you sure you want to cancel this event? All attendees will be notified.')) return
    setCancelBusy(true)
    try {
      await cancelEvent(event.id)
      startTransition(() => router.refresh())
    } catch {
      setCancelBusy(false)
    }
  }

  return (
    <div>
      {/* Cancelled banner */}
      {isCancelled && (
        <div className="bg-red-500/10 border-b border-red-500/30 px-4 py-3">
          <p className="text-red-400 font-semibold text-sm">This {event.type} has been cancelled</p>
          {event.cancelled_reason && (
            <p className="text-red-400/70 text-sm mt-0.5">{event.cancelled_reason}</p>
          )}
        </div>
      )}

      {/* Event info */}
      <div className="px-4 py-4 border-b border-zinc-800">
        {/* Type badge + recurrence */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${
            event.type === 'ride' ? 'bg-blue-500/15 text-blue-400' : 'bg-orange-500/15 text-orange-400'
          }`}>
            {event.type === 'ride' ? 'Ride' : 'Event'}
          </span>
          {event.category && (
            <span className="text-sm text-zinc-500 capitalize">{event.category.replace('_', ' ')}</span>
          )}
          {event.recurrence_rule && (
            <span className="text-sm text-zinc-500">
              Repeats {event.recurrence_rule}
            </span>
          )}
        </div>

        <h1 className="text-xl font-bold text-white">{event.title}</h1>

        {/* Date/time */}
        <div className="flex items-start gap-2 mt-2 text-zinc-300 text-base sm:text-sm">
          <svg className="w-5 h-5 sm:w-4 sm:h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
          <span>
            {formatEventDate(event.starts_at)} at {formatEventTime(event.starts_at)}
            {event.ends_at && ` — ${formatEventTime(event.ends_at)}`}
          </span>
        </div>

        {/* Recurring event notice */}
        {event.recurrence_rule && (
          <div className="mt-2">
            <p className="text-sm text-orange-400 font-medium">
              Repeats {event.recurrence_rule === 'weekly' ? 'every week' : event.recurrence_rule === 'biweekly' ? 'every two weeks' : 'every month'}
            </p>
            {upcomingDates.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {upcomingDates.slice(0, 6).map((date) => (
                  <span key={date} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded-lg">
                    {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                ))}
                {upcomingDates.length > 6 && (
                  <span className="text-xs text-zinc-500 px-2 py-1">+{upcomingDates.length - 6} more</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Location */}
        {location && (
          <div className="flex items-start gap-2 mt-1.5 text-zinc-300 text-base sm:text-sm">
            <svg className="w-5 h-5 sm:w-4 sm:h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            <span>{location}</span>
          </div>
        )}

        {/* Creator */}
        <div className="flex items-center gap-2 mt-3">
          <Link href={`/profile/${creator?.username}`} className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-full bg-zinc-700 overflow-hidden">
              {creatorAvatar ? (
                <Image src={creatorAvatar} alt="" width={28} height={28} className="object-cover w-full h-full" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm font-bold">
                  {creator?.username?.[0]?.toUpperCase() ?? '?'}
                </div>
              )}
            </div>
            <span className="text-base sm:text-sm text-zinc-300 group-hover:text-white transition-colors inline-flex items-center gap-1">
              Hosted by <span className="text-white font-medium">@{creator?.username ?? 'unknown'}</span>
              {creator?.phone_verified_at && <VerifiedBadge className="w-3.5 h-3.5" />}
            </span>
          </Link>
        </div>

        {/* Group link */}
        {event.group && (
          <Link
            href={`/groups/${event.group.slug}`}
            className="inline-block mt-2 text-sm text-orange-400 hover:text-orange-300 transition-colors"
          >
            {event.group.name} →
          </Link>
        )}
      </div>

      {/* RSVP bar */}
      {!isCancelled && (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
          <button
            onClick={() => handleRsvp('going')}
            disabled={rsvpBusy || (isFull && myRsvp !== 'going' && !isCreator)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              myRsvp === 'going'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : isFull && !isCreator
                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700'
            }`}
          >
            {isFull && myRsvp !== 'going' && !isCreator ? 'Full' : `Going (${goingCount})`}
          </button>
          <button
            onClick={() => handleRsvp('interested')}
            disabled={rsvpBusy}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              myRsvp === 'interested'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700'
            }`}
          >
            Interested ({interestedCount})
          </button>
        </div>
      )}

      {/* Creator actions */}
      {isCreator && !isCancelled && (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
          <Link
            href={`/events/${event.slug}/edit`}
            className="flex-1 text-center py-2 rounded-xl text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700 transition-colors"
          >
            Edit
          </Link>
          <button
            onClick={handleCancel}
            disabled={cancelBusy}
            className="flex-1 py-2 rounded-xl text-sm font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 transition-colors disabled:opacity-40"
          >
            {cancelBusy ? 'Cancelling...' : 'Cancel Event'}
          </button>
        </div>
      )}

      {/* Spread the Word */}
      {!isCancelled && (
        <div className="mx-4 my-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Spread the Word</h3>
          <div className="flex gap-3">
            <div className="flex-1 [&>button]:w-full [&>button]:bg-orange-500 [&>button]:hover:bg-orange-600 [&>button]:text-white [&>button]:font-semibold [&>button]:py-2.5 [&>button]:rounded-xl [&>button]:transition-all [&>button]:text-sm [&>button]:flex [&>button]:items-center [&>button]:justify-center [&>button]:gap-2 [&>button]:animate-[glow_2s_ease-in-out_infinite]">
              <style>{`@keyframes glow { 0%, 100% { box-shadow: 0 0 8px rgba(249,115,22,0.3); } 50% { box-shadow: 0 0 16px rgba(249,115,22,0.5); } }`}</style>
              <InviteToEventButton eventId={event.id} />
            </div>
            <div className="flex-1 [&>button]:w-full [&>button]:bg-zinc-800 [&>button]:hover:bg-zinc-700 [&>button]:text-zinc-300 [&>button]:font-semibold [&>button]:py-2.5 [&>button]:rounded-xl [&>button]:transition-colors [&>button]:text-sm [&>button]:border [&>button]:border-zinc-700 [&>button]:flex [&>button]:items-center [&>button]:justify-center [&>button]:gap-2">
              <ShareToGroupButton eventId={event.id} currentUserId={currentUserId} />
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        <button
          onClick={() => setTab('details')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors ${
            tab === 'details' ? 'text-orange-400 border-b-2 border-orange-400' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Details
        </button>
        <button
          onClick={() => setTab('attendees')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors ${
            tab === 'attendees' ? 'text-orange-400 border-b-2 border-orange-400' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Attendees ({goingCount + interestedCount})
        </button>
      </div>

      {/* Tab content */}
      {tab === 'details' && (
        <div className="px-4 py-4 space-y-4">
          {/* Flyer */}
          {event.flyer_url && (
            <div className="rounded-xl overflow-hidden">
              <img
                src={getImageUrl('covers', event.flyer_url)}
                alt="Event flyer"
                className="w-full"
              />
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div>
              <p className="text-zinc-200 text-base whitespace-pre-wrap leading-relaxed">{event.description}</p>
            </div>
          )}

          {/* Ride: start → stops → end */}
          {event.type === 'ride' && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Route</h3>
              <div className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  </div>
                  <div>
                    <p className="text-zinc-300 text-sm font-medium">Start</p>
                    <p className="text-zinc-500 text-sm">{event.address || 'No address specified'}</p>
                    {event.city && <p className="text-zinc-600 text-sm">{[event.city, event.state].filter(Boolean).join(', ')} {event.zip_code ?? ''}</p>}
                  </div>
                </div>

                {event.stops?.map((stop) => (
                  <div key={stop.id} className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <div className="w-2 h-2 rounded-full bg-orange-400" />
                    </div>
                    <div>
                      <p className="text-zinc-300 text-sm font-medium">{stop.label || `Stop ${stop.order_index + 1}`}</p>
                      <p className="text-zinc-500 text-sm">{stop.address}</p>
                      {stop.city && <p className="text-zinc-600 text-sm">{[stop.city, stop.state].filter(Boolean).join(', ')} {stop.zip_code ?? ''}</p>}
                    </div>
                  </div>
                ))}

                {event.end_address && (
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <div className="w-2 h-2 rounded-full bg-red-400" />
                    </div>
                    <div>
                      <p className="text-zinc-300 text-sm font-medium">End</p>
                      <p className="text-zinc-500 text-sm">{event.end_address}</p>
                      {event.end_city && <p className="text-zinc-600 text-sm">{[event.end_city, event.end_state].filter(Boolean).join(', ')} {event.end_zip_code ?? ''}</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Static map */}
          {event.latitude && event.longitude && (
            <div className="rounded-xl overflow-hidden border border-zinc-800">
              <iframe
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${event.longitude - 0.02},${event.latitude - 0.015},${event.longitude + 0.02},${event.latitude + 0.015}&layer=mapnik&marker=${event.latitude},${event.longitude}`}
                className="w-full aspect-square border-0"
                loading="lazy"
              />
            </div>
          )}

          {/* Capacity */}
          {event.max_attendees && (
            <p className="text-zinc-500 text-sm">
              {goingCount} / {event.max_attendees} spots filled
            </p>
          )}
        </div>
      )}

      {tab === 'attendees' && (
        <div className="px-4 py-4 space-y-4">
          {/* Going */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-400 mb-2">Going ({goingList.length})</h3>
            {goingList.length === 0 ? (
              <p className="text-zinc-600 text-sm">No one yet</p>
            ) : (
              <div className="space-y-2">
                {goingList.map((a: any) => (
                  <AttendeeRow key={a.user.id} profile={a.user} />
                ))}
              </div>
            )}
          </div>

          {/* Interested */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-400 mb-2">Interested ({interestedList.length})</h3>
            {interestedList.length === 0 ? (
              <p className="text-zinc-600 text-sm">No one yet</p>
            ) : (
              <div className="space-y-2">
                {interestedList.map((a: any) => (
                  <AttendeeRow key={a.user.id} profile={a.user} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function AttendeeRow({ profile }: { profile: any }) {
  const avatarUrl = profile.profile_photo_url
    ? getImageUrl('avatars', profile.profile_photo_url)
    : null

  return (
    <Link
      href={`/profile/${profile.username}`}
      className="flex items-center gap-3 py-1.5 group"
    >
      <div className="w-9 h-9 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
        {avatarUrl ? (
          <Image src={avatarUrl} alt="" width={36} height={36} className="object-cover w-full h-full" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm font-bold">
            {profile.username?.[0]?.toUpperCase() ?? '?'}
          </div>
        )}
      </div>
      <span className="text-sm text-white group-hover:text-orange-400 transition-colors font-medium inline-flex items-center gap-1">
        @{profile.username ?? 'unknown'}
        {profile.phone_verified_at && <VerifiedBadge className="w-3.5 h-3.5" />}
      </span>
    </Link>
  )
}
