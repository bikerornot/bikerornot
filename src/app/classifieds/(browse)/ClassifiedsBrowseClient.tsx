'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { searchListings } from '@/app/actions/classifieds'
import { getImageUrl } from '@/lib/supabase/image'
import VerifiedBadge from '@/app/components/VerifiedBadge'
import type { ListingSearchResult, ClassifiedsSearchFilters } from '@/lib/supabase/types'

interface Props {
  currentUserId: string | null
}

function formatPrice(dollars: number | null, priceType: string): string {
  if (dollars === null) return 'Contact for Price'
  const formatted = dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  if (priceType === 'obo') return `${formatted} OBO`
  return formatted
}

function formatMileage(miles: number | null): string {
  if (miles === null) return '—'
  return `${miles.toLocaleString()} mi`
}

// Listing Card Component
function ListingCard({ listing }: { listing: ListingSearchResult }) {
  const coverUrl = listing.cover_image_path
    ? getImageUrl('classifieds', listing.cover_image_path)
    : null
  const location = [listing.city, listing.state].filter(Boolean).join(', ')
  const sellerAvatarUrl = listing.seller_photo
    ? getImageUrl('avatars', listing.seller_photo)
    : null

  return (
    <Link href={`/classifieds/${listing.id}`} className="block group">
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden hover:border-zinc-700 transition-colors">
        {/* Cover image */}
        <div className="relative aspect-[4/3] bg-zinc-800">
          {coverUrl ? (
            <Image src={coverUrl} alt={listing.title} fill className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600">
              <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
              </svg>
            </div>
          )}
          {listing.trade_considered && (
            <div className="absolute top-2 right-2 bg-orange-500/90 text-white text-xs font-bold px-1.5 py-0.5 rounded">
              TRADE
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3">
          <h3 className="text-white font-semibold text-sm line-clamp-1 group-hover:text-orange-400 transition-colors">
            {listing.year} {listing.make} {listing.model}
          </h3>
          <p className="text-orange-400 font-bold text-sm mt-1">
            {formatPrice(listing.price, listing.price_type)}
          </p>
          {listing.mileage != null && (
            <p className="text-zinc-400 text-sm mt-1">{formatMileage(listing.mileage)}</p>
          )}
          {location && (
            <p className="text-zinc-500 text-sm mt-0.5">
              {location}
              {listing.distance_miles != null && (
                <span className="text-zinc-600"> ({Math.round(listing.distance_miles)} mi away)</span>
              )}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2 text-sm">
            <div className="flex items-center gap-1.5">
              {sellerAvatarUrl ? (
                <Image src={sellerAvatarUrl} alt="" width={16} height={16} className="rounded-full object-cover" />
              ) : (
                <div className="w-4 h-4 rounded-full bg-zinc-700" />
              )}
              <span className="text-zinc-400">
                {listing.seller_username}
              </span>
              {listing.seller_verified && <VerifiedBadge className="w-3 h-3" />}
            </div>
            <div className="ml-auto flex items-center gap-2 text-zinc-600">
              <span>{listing.view_count} views</span>
              {listing.save_count > 0 && <span>{listing.save_count} saved</span>}
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

function ListingCardSkeleton() {
  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden animate-pulse">
      <div className="aspect-[4/3] bg-zinc-800" />
      <div className="p-3 space-y-2">
        <div className="h-4 bg-zinc-800 rounded w-3/4" />
        <div className="h-3 bg-zinc-800 rounded w-1/2" />
        <div className="h-3 bg-zinc-800 rounded w-1/3" />
      </div>
    </div>
  )
}

const MAKES_BY_COUNTRY: Record<string, string[]> = {
  'American':  ['Buell', 'Harley-Davidson', 'Indian', 'Victory', 'Zero'],
  'British':   ['BSA', 'Norton', 'Triumph'],
  'German':    ['BMW'],
  'Italian':   ['Aprilia', 'Ducati', 'Moto Guzzi'],
  'Japanese':  ['Honda', 'Kawasaki', 'Suzuki', 'Yamaha'],
}

export default function ClassifiedsBrowseClient({ currentUserId }: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()

  // Parse initial filters from URL
  function getFiltersFromParams(): ClassifiedsSearchFilters {
    return {
      make: searchParams.get('make') || undefined,
      sort: (searchParams.get('sort') as ClassifiedsSearchFilters['sort']) || 'newest',
    }
  }

  const [filters, setFilters] = useState<ClassifiedsSearchFilters>(getFiltersFromParams)
  const [results, setResults] = useState<ListingSearchResult[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Sync filters to URL
  const syncUrl = useCallback((f: ClassifiedsSearchFilters) => {
    const params = new URLSearchParams()
    if (f.make) params.set('make', f.make)
    if (f.sort && f.sort !== 'newest') params.set('sort', f.sort)
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : '/classifieds', { scroll: false })
  }, [router])

  // Search
  const doSearch = useCallback(async (f: ClassifiedsSearchFilters, append = false, cursorDate?: string, cursorId?: string) => {
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    try {
      const { results: newResults, hasMore: more } = await searchListings(f, cursorDate, cursorId)
      if (append) {
        setResults(prev => [...prev, ...newResults])
      } else {
        setResults(newResults)
      }
      setHasMore(more)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  // Initial search and on filter change
  useEffect(() => {
    doSearch(filters)
    syncUrl(filters)
  }, [filters, doSearch, syncUrl])

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
        const last = results[results.length - 1]
        if (last) {
          doSearch(filters, true, last.created_at, last.id)
        }
      }
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, loading, results, filters, doSearch])

  function updateFilter(key: string, value: any) {
    setFilters(prev => ({ ...prev, [key]: value || undefined }))
  }

  return (
    <div>
      {/* Make + Sort row */}
      <div className="flex gap-2 mb-5">
        <select
          value={filters.make ?? ''}
          onChange={e => updateFilter('make', e.target.value || undefined)}
          className="flex-1 bg-zinc-900 border border-zinc-800 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
        >
          <option value="">All Makes</option>
          {Object.entries(MAKES_BY_COUNTRY).map(([country, makes]) => (
            <optgroup key={country} label={country}>
              {makes.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </optgroup>
          ))}
          <optgroup label="──────────">
            <option value="__other__">Other</option>
          </optgroup>
        </select>
        <select
          value={filters.sort}
          onChange={e => updateFilter('sort', e.target.value)}
          className="bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
        >
          <option value="newest">Newest</option>
          <option value="price_asc">Price: Low → High</option>
          <option value="price_desc">Price: High → Low</option>
          <option value="nearest">Near Me</option>
        </select>
      </div>

      {/* Results grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <ListingCardSkeleton key={i} />
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-10 text-center">
          <p className="text-zinc-400 text-sm">No listings found.</p>
          {filters.make && (
            <button
              onClick={() => updateFilter('make', undefined)}
              className="text-orange-400 hover:text-orange-300 text-sm mt-2 transition-colors"
            >
              View all makes
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map(listing => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
          {loadingMore && Array.from({ length: 3 }).map((_, i) => (
            <ListingCardSkeleton key={`loading-${i}`} />
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-4" />
    </div>
  )
}
