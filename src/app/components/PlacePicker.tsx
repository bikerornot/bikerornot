'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import {
  searchPlaces,
  selectPlace,
  type PlacePrediction,
  type PlaceSearchResult,
} from '@/app/actions/places'

interface Props {
  onSelect: (place: PlaceSearchResult) => void
  onClose: () => void
}

// Google Places Autocomplete-backed check-in picker. Two-phase flow:
//
//   1. As the user types, hit the Autocomplete endpoint → cheap
//      predictions (place_id + display text). Debounced 300ms.
//   2. When the user taps a prediction, hit Place Details → lat/lng,
//      address, category. THIS is what closes out Google's billed
//      "session" — using the same sessionToken across step 1 and 2
//      means a whole check-in costs one request, not one per keystroke.
//
// Location is a relevance bias only — biker use case is "check in at
// this named place I know", not "browse what's nearby".
export default function PlacePicker({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [predictions, setPredictions] = useState<PlacePrediction[]>([])
  const [loading, setLoading] = useState(false)
  const [resolvingPlaceId, setResolvingPlaceId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [proximity, setProximity] = useState<{ latitude: number; longitude: number } | null>(null)
  const [locatingInFlight, setLocatingInFlight] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Session token tied to the lifetime of this picker instance. Generated
  // once on mount and reused for every autocomplete + the final details
  // call — that's what makes Google bill the whole interaction as one
  // request instead of one-per-keystroke. UUID v4 is the required format.
  const sessionToken = useMemo(() => crypto.randomUUID(), [])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (query.trim().length < 2) {
      setPredictions([])
      setError(null)
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const out = await searchPlaces(query, sessionToken, proximity ?? undefined)
        if (!cancelled) setPredictions(out)
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
  }, [query, proximity, sessionToken])

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
      },
      (err) => {
        setLocatingInFlight(false)
        setError(err.message || 'Could not get location')
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    )
  }

  async function handlePick(p: PlacePrediction) {
    setResolvingPlaceId(p.placeId)
    setError(null)
    try {
      const full = await selectPlace(p.placeId, sessionToken)
      onSelect(full)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load place details')
    } finally {
      setResolvingPlaceId(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-6 sm:items-center sm:pt-4"
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
            disabled={locatingInFlight || !!proximity}
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
                {locatingInFlight
                  ? 'Getting your location…'
                  : proximity
                    ? 'Location shared'
                    : 'Use current location'}
              </p>
              <p className="text-zinc-500 text-xs truncate">
                {proximity
                  ? 'Nearby places will rank higher when you search'
                  : 'Optional — helps surface nearby places'}
              </p>
            </div>
          </button>

          {error && (
            <p className="px-4 py-3 text-red-400 text-sm">{error}</p>
          )}

          {loading && (
            <p className="px-4 py-3 text-zinc-500 text-sm">Searching…</p>
          )}

          {!loading && query.trim().length < 2 && !error && (
            <p className="px-4 py-6 text-zinc-500 text-sm text-center">
              Type the name of a place to check in —{' '}
              <span className="text-zinc-400">e.g. a diner, a dealership, a rally</span>
            </p>
          )}

          {!loading && query.trim().length >= 2 && predictions.length === 0 && !error && (
            <p className="px-4 py-3 text-zinc-500 text-sm">No results for &ldquo;{query}&rdquo;</p>
          )}

          {predictions.map((p) => {
            const busy = resolvingPlaceId === p.placeId
            return (
              <button
                key={p.placeId}
                type="button"
                onClick={() => handlePick(p)}
                disabled={!!resolvingPlaceId}
                className="w-full flex items-start gap-3 px-4 py-3 border-t border-zinc-800 text-left hover:bg-zinc-800 transition-colors disabled:opacity-60"
              >
                <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-7.5 8-13a8 8 0 10-16 0c0 5.5 8 13 8 13z" />
                    <circle cx="12" cy="9" r="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-medium truncate">{p.primary}</p>
                  {p.secondary && (
                    <p className="text-zinc-500 text-xs truncate">{p.secondary}</p>
                  )}
                </div>
                {busy && (
                  <div className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin mt-1" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
