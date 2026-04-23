'use client'

import { useState, useEffect, useRef } from 'react'
import { searchPlaces, type PlaceSearchResult } from '@/app/actions/places'

interface Props {
  onSelect: (place: PlaceSearchResult) => void
  onClose: () => void
}

// Full-screen modal place picker. Opens when the user taps the location
// icon in the composer. Three sources feed the list:
//
//   1. "Use current location" — browser geolocation → proximity bias on
//      subsequent searches. Silent if the user denies permission.
//   2. Typed query — debounced 300ms so we don't fire a Mapbox request
//      on every keystroke. Results are biased toward the resolved lat/lng
//      when available.
//
// No "recent places" list yet — would need a new table or user prefs
// row; skip for the MVP and add later if real usage shows pattern of
// repeat check-ins.
export default function PlacePicker({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [proximity, setProximity] = useState<{ latitude: number; longitude: number } | null>(null)
  const [locatingInFlight, setLocatingInFlight] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Autofocus the search box on open so the keyboard comes up right away
  // on mobile — otherwise users have to make an extra tap.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Debounced search. A trailing 300ms window balances responsiveness
  // against Mapbox request cost; shorter feels snappier but burns free
  // tier quota on in-progress typing ("res", "rest", "resta"...).
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      setError(null)
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const out = await searchPlaces(query, proximity ?? undefined)
        if (!cancelled) setResults(out)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Search failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, proximity])

  function handleUseCurrentLocation() {
    if (!navigator.geolocation) {
      setError('Location not available in this browser')
      return
    }
    setLocatingInFlight(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setProximity({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
        setLocatingInFlight(false)
        // Prompt a fresh search immediately if there's a query already typed,
        // otherwise seed the input with a helpful default so results appear.
        if (!query.trim()) setQuery('restaurants')
      },
      (err) => {
        setLocatingInFlight(false)
        setError(err.message || 'Could not get location')
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
          <svg className="w-5 h-5 text-zinc-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a place"
            className="flex-1 bg-transparent text-white placeholder-zinc-500 text-base focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition-colors text-lg leading-none px-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={locatingInFlight}
            className="w-full flex items-center gap-3 px-4 py-3 border-b border-zinc-800 text-left hover:bg-zinc-800 transition-colors disabled:opacity-60"
          >
            <div className="w-9 h-9 rounded-full bg-orange-500/15 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-medium">
                {locatingInFlight ? 'Getting your location…' : 'Use current location'}
              </p>
              <p className="text-zinc-500 text-xs truncate">
                {proximity
                  ? `Ranked by distance from ${proximity.latitude.toFixed(3)}, ${proximity.longitude.toFixed(3)}`
                  : 'Biases results to nearby spots'}
              </p>
            </div>
          </button>

          {error && (
            <p className="px-4 py-3 text-red-400 text-sm">{error}</p>
          )}

          {loading && (
            <p className="px-4 py-3 text-zinc-500 text-sm">Searching…</p>
          )}

          {!loading && query.trim().length >= 2 && results.length === 0 && !error && (
            <p className="px-4 py-3 text-zinc-500 text-sm">No results for &ldquo;{query}&rdquo;</p>
          )}

          {results.map((r) => (
            <button
              key={r.mapboxId}
              type="button"
              onClick={() => onSelect(r)}
              className="w-full flex items-start gap-3 px-4 py-3 border-t border-zinc-800 text-left hover:bg-zinc-800 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-7.5 8-13a8 8 0 10-16 0c0 5.5 8 13 8 13z" />
                  <circle cx="12" cy="9" r="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-medium truncate">{r.name}</p>
                {r.fullAddress && (
                  <p className="text-zinc-500 text-xs truncate">{r.fullAddress}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
