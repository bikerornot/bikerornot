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
  userLat: number | null
  userLng: number | null
  userZip: string
  currentUserId: string
}

export default function EventsClient({ initialEvents, userLat, userLng, userZip, currentUserId }: Props) {
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
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 sm:px-0">
        <h1 className="text-xl font-bold text-white">Events & Rides</h1>
        <Link
          href="/events/new"
          className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          Create
        </Link>
      </div>

      {/* Search + Location */}
      <div className="space-y-2 px-4 sm:px-0">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search events and rides..."
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
          <p className="text-zinc-500 text-xs">Looking up location...</p>
        )}
      </div>

      {/* Type tabs */}
      <div className="flex gap-1.5 px-4 sm:px-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === t.key
                ? 'bg-orange-500 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Date filters + sort */}
      <div className="flex items-center gap-2 px-4 sm:px-0 overflow-x-auto scrollbar-hide">
        {DATE_FILTERS.map((d) => (
          <button
            key={d.key}
            onClick={() => setDateFilter(d.key)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              dateFilter === d.key
                ? 'bg-zinc-700 text-white'
                : 'bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {d.label}
          </button>
        ))}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortType)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-400 focus:outline-none flex-shrink-0"
        >
          <option value="soonest">Soonest</option>
          {searchLat && <option value="nearest">Nearest</option>}
          <option value="popular">Most Popular</option>
        </select>
      </div>

      {/* Event list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 px-4">
          <p className="text-zinc-500 text-sm">No events found</p>
          <p className="text-zinc-600 text-xs mt-1">Try adjusting your filters or create one!</p>
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {filtered.map((event) => (
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
