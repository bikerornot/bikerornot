'use client'

import { useState, useMemo } from 'react'
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

interface Props {
  initialEvents: EventDetail[]
  userLat: number | null
  userLng: number | null
  currentUserId: string
}

export default function EventsClient({ initialEvents, userLat, userLng, currentUserId }: Props) {
  const [tab, setTab] = useState<TabType>('all')
  const [sort, setSort] = useState<SortType>('soonest')
  const [dateFilter, setDateFilter] = useState<DateFilter>('')
  const [search, setSearch] = useState('')

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
    if (sort === 'nearest' && userLat && userLng) {
      results.sort((a, b) => {
        const distA = a.latitude && a.longitude ? haversine(userLat, userLng, Number(a.latitude), Number(a.longitude)) : 99999
        const distB = b.latitude && b.longitude ? haversine(userLat, userLng, Number(b.latitude), Number(b.longitude)) : 99999
        return distA - distB
      })
    } else if (sort === 'popular') {
      results.sort((a, b) => b.going_count - a.going_count)
    }
    // 'soonest' is the default order from the server

    return results
  }, [initialEvents, tab, sort, dateFilter, search, userLat, userLng, currentUserId])

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

      {/* Search */}
      <div className="px-4 sm:px-0">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search events and rides..."
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
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
      <div className="flex items-center justify-between gap-2 px-4 sm:px-0">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
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
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortType)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-400 focus:outline-none"
        >
          <option value="soonest">Soonest</option>
          {userLat && <option value="nearest">Nearest</option>}
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
