'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import EventCard from '@/app/components/EventCard'
import type { EventDetail } from '@/app/actions/events'

type TabType = 'all' | 'events' | 'rides' | 'mine'
type SortType = 'soonest' | 'nearest' | 'popular'
type DateFilter = '' | 'this_week' | 'this_weekend' | 'this_month'

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const DISTANCE_OPTIONS = [
  { value: 25, label: '25 miles' },
  { value: 50, label: '50 miles' },
  { value: 100, label: '100 miles' },
  { value: 200, label: '200 miles' },
  { value: 0, label: 'Any distance' },
]

interface Props {
  initialEvents: EventDetail[]
  recentEvents: EventDetail[]
  userLat: number | null
  userLng: number | null
  userZip: string
  currentUserId: string
}

export default function EventsClient({ initialEvents, recentEvents, userLat, userLng, userZip, currentUserId }: Props) {
  const [tab, setTab] = useState<TabType>('all')
  const [sort, setSort] = useState<SortType>('soonest')
  const [dateFilter, setDateFilter] = useState<DateFilter>('')
  const [search, setSearch] = useState('')

  // Zip code search
  const [zip, setZip] = useState(userZip)
  const [radius, setRadius] = useState(100)
  const [searchLat, setSearchLat] = useState<number | null>(userLat)
  const [searchLng, setSearchLng] = useState<number | null>(userLng)
  const [geoLoading, setGeoLoading] = useState(false)

  const handleZipSearch = useCallback(async () => {
    if (!zip || zip.length < 5) return
    setGeoLoading(true)
    try {
      const geo = await geocodeZipClient(zip)
      if (geo) {
        setSearchLat(geo.lat)
        setSearchLng(geo.lng)
      }
    } finally {
      setGeoLoading(false)
    }
  }, [zip])

  const handleZipKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleZipSearch()
    }
  }, [handleZipSearch])

  // Auto-search when zip reaches 5 digits
  const handleZipChange = useCallback((value: string) => {
    const clean = value.replace(/\D/g, '').slice(0, 5)
    setZip(clean)
    if (clean.length === 5 && clean !== zip) {
      setGeoLoading(true)
      geocodeZipClient(clean).then((geo) => {
        if (geo) { setSearchLat(geo.lat); setSearchLng(geo.lng) }
        setGeoLoading(false)
      }).catch(() => setGeoLoading(false))
    }
  }, [zip])

  const filtered = useMemo(() => {
    let results = [...initialEvents]

    // Tab filter
    if (tab === 'events') results = results.filter((e) => e.type === 'event')
    if (tab === 'rides') results = results.filter((e) => e.type === 'ride')
    if (tab === 'mine') results = results.filter((e) => e.creator_id === currentUserId || e.my_rsvp)

    // Date filter
    if (dateFilter) {
      const now = new Date()
      let start: Date
      let end: Date

      if (dateFilter === 'this_week') {
        start = now
        end = new Date(now)
        end.setDate(end.getDate() + (7 - end.getDay()))
      } else if (dateFilter === 'this_weekend') {
        start = new Date(now)
        const dayOfWeek = start.getDay()
        const daysUntilSaturday = dayOfWeek === 0 ? 6 : (6 - dayOfWeek)
        start.setDate(start.getDate() + daysUntilSaturday)
        start.setHours(0, 0, 0, 0)
        end = new Date(start)
        end.setDate(end.getDate() + 2)
      } else {
        start = now
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
      }

      results = results.filter((e) => {
        const d = new Date(e.starts_at)
        return d >= start && d <= end
      })
    }

    // Zip code radius filter
    if (searchLat && searchLng && radius > 0) {
      results = results.filter((e) => {
        if (!e.latitude || !e.longitude) return false
        const dist = haversine(searchLat, searchLng, Number(e.latitude), Number(e.longitude))
        return dist <= radius
      })
    }

    // Text search
    if (search.trim()) {
      const term = search.toLowerCase()
      results = results.filter((e) =>
        e.title.toLowerCase().includes(term) ||
        e.description?.toLowerCase().includes(term) ||
        e.venue_name?.toLowerCase().includes(term) ||
        e.city?.toLowerCase().includes(term) ||
        e.state?.toLowerCase().includes(term)
      )
    }

    // Sort
    if (sort === 'nearest' && searchLat && searchLng) {
      results.sort((a, b) => {
        const distA = a.latitude && a.longitude ? haversine(searchLat, searchLng, Number(a.latitude), Number(a.longitude)) : 99999
        const distB = b.latitude && b.longitude ? haversine(searchLat, searchLng, Number(b.latitude), Number(b.longitude)) : 99999
        return distA - distB
      })
    } else if (sort === 'popular') {
      results.sort((a, b) => b.going_count - a.going_count)
    }

    return results
  }, [initialEvents, tab, sort, dateFilter, search, searchLat, searchLng, radius, currentUserId])

  const TABS: { key: TabType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'events', label: 'Events' },
    { key: 'rides', label: 'Rides' },
    { key: 'mine', label: 'My Events' },
  ]

  const DATE_FILTERS: { key: DateFilter; label: string }[] = [
    { key: '', label: 'Upcoming' },
    { key: 'this_week', label: 'This Week' },
    { key: 'this_weekend', label: 'This Weekend' },
    { key: 'this_month', label: 'This Month' },
  ]

  return (
    <div className="space-y-6">
      {/* Hero — creation-first */}
      <div className="px-4 sm:px-0">
        <h1 className="text-xl font-bold text-white">Rides & Events</h1>
        <p className="text-zinc-400 text-base mt-1">Share a ride or event with the community</p>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <Link
            href="/events/new?type=ride"
            className="py-5 px-4 rounded-xl border-2 border-zinc-700 bg-zinc-800 hover:border-orange-500 hover:bg-orange-500/10 text-center transition-colors"
          >
            <svg className="w-8 h-8 mx-auto text-orange-400 mb-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.44 9.03L15.41 5H11v2h3.59l2 2H5c-2.8 0-5 2.2-5 5s2.2 5 5 5c2.46 0 4.45-1.69 4.9-4h1.65l2.77-2.77c-.21.54-.32 1.14-.32 1.77 0 2.8 2.2 5 5 5s5-2.2 5-5c0-2.8-2.2-5-5-5-1.09 0-2.09.35-2.91.93L14.4 9.03h5.04zM5 17c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3zm14 0c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z" />
            </svg>
            <p className="font-bold text-lg text-white">Create a Ride</p>
            <p className="text-sm text-zinc-400 mt-0.5">Group ride, poker run, tour</p>
          </Link>
          <Link
            href="/events/new?type=event"
            className="py-5 px-4 rounded-xl border-2 border-zinc-700 bg-zinc-800 hover:border-orange-500 hover:bg-orange-500/10 text-center transition-colors"
          >
            <svg className="w-8 h-8 mx-auto text-orange-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            <p className="font-bold text-lg text-white">Create an Event</p>
            <p className="text-sm text-zinc-400 mt-0.5">Rally, meetup, bike night</p>
          </Link>
        </div>
      </div>

      {/* Search section */}
      <div className="px-4 sm:px-0 mt-4">
        <h2 className="text-base font-semibold text-white mb-3">Find Rides & Events</h2>
        <div className="space-y-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search rides & events..."
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        <div className="flex gap-2">
          <input
            type="text"
            value={zip}
            onChange={(e) => handleZipChange(e.target.value)}
            onKeyDown={handleZipKeyDown}
            placeholder="Zip code"
            inputMode="numeric"
            maxLength={5}
            className="w-28 flex-shrink-0 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-base text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <select
            value={radius}
            onChange={(e) => setRadius(parseInt(e.target.value))}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-base text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            {DISTANCE_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
        {geoLoading && (
          <p className="text-zinc-500 text-sm">Looking up location...</p>
        )}
        </div>
      </div>

      {/* Type tabs */}
      <div className="flex gap-1.5 px-4 sm:px-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              tab === t.key
                ? 'bg-orange-500 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Date filters */}
      <div className="flex items-center gap-2 px-4 sm:px-0 overflow-x-auto scrollbar-hide">
        {DATE_FILTERS.map((d) => (
          <button
            key={d.key}
            onClick={() => setDateFilter(d.key)}
            className={`px-2.5 py-1 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              dateFilter === d.key
                ? 'bg-zinc-700 text-white'
                : 'bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Upcoming Rides & Events heading + sort */}
      <div className="flex items-center justify-between px-4 sm:px-0">
        <h2 className="text-base font-semibold text-white">Upcoming Rides & Events</h2>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortType)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-sm text-zinc-400 focus:outline-none flex-shrink-0"
        >
          <option value="soonest">Soonest</option>
          {searchLat && <option value="nearest">Nearest</option>}
          <option value="popular">Most Popular</option>
        </select>
      </div>

      {filtered.length === 0 && recentEvents.filter((e) => !filtered.some((f) => f.id === e.id)).length === 0 ? (
        <div className="text-center py-12 px-4">
          <p className="text-zinc-400 text-base">No rides or events yet in your area</p>
          <p className="text-zinc-500 text-sm mt-1 mb-4">Be the first to post one!</p>
          <Link
            href="/events/new"
            className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors"
          >
            Create a Ride or Event
          </Link>
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {filtered.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
          {recentEvents
            .filter((e) => !filtered.some((f) => f.id === e.id))
            .map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
        </div>
      )}
    </div>
  )
}

// Client-side geocoding via Zippopotam.us (same API as server-side)
async function geocodeZipClient(zip: string): Promise<{ lat: number; lng: number } | null> {
  const clean = zip.trim().slice(0, 5)
  if (!/^\d{5}$/.test(clean)) return null
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${clean}`)
    if (!res.ok) return null
    const data = await res.json()
    const place = data?.places?.[0]
    if (!place) return null
    return { lat: parseFloat(place.latitude), lng: parseFloat(place.longitude) }
  } catch {
    return null
  }
}
