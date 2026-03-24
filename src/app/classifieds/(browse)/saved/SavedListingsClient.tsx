'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { unsaveListing } from '@/app/actions/classifieds'
import { getImageUrl } from '@/lib/supabase/image'
import VerifiedBadge from '@/app/components/VerifiedBadge'
import type { ListingSearchResult } from '@/lib/supabase/types'

interface Props {
  initialListings: ListingSearchResult[]
}

function formatPrice(dollars: number | null, priceType: string): string {
  if (dollars === null || priceType === 'offer') return 'Make Offer'
  const formatted = dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  if (priceType === 'obo') return `${formatted} OBO`
  return formatted
}

export default function SavedListingsClient({ initialListings }: Props) {
  const [listings, setListings] = useState(initialListings)
  const [removing, setRemoving] = useState<Set<string>>(new Set())

  async function handleUnsave(listingId: string) {
    if (removing.has(listingId)) return
    setRemoving(prev => new Set(prev).add(listingId))
    try {
      await unsaveListing(listingId)
      setListings(prev => prev.filter(l => l.id !== listingId))
    } catch (err) {
      console.error('Failed to unsave:', err)
    } finally {
      setRemoving(prev => {
        const next = new Set(prev)
        next.delete(listingId)
        return next
      })
    }
  }

  return (
    <div>
      <p className="text-zinc-500 text-sm mb-4">{listings.length} {listings.length === 1 ? 'listing' : 'listings'} saved</p>

      {listings.length === 0 ? (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-10 text-center">
          <p className="text-zinc-400 text-base">No saved listings yet.</p>
          <Link
            href="/classifieds"
            className="inline-block mt-3 text-orange-400 hover:text-orange-300 text-sm font-medium transition-colors"
          >
            Browse classifieds
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {listings.map(listing => {
            const coverUrl = listing.cover_image_path
              ? getImageUrl('classifieds', listing.cover_image_path)
              : null
            const location = [listing.city, listing.state].filter(Boolean).join(', ')
            const sellerAvatarUrl = listing.seller_photo
              ? getImageUrl('avatars', listing.seller_photo)
              : null

            return (
              <div key={listing.id} className="relative bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden hover:border-zinc-700 transition-colors">
                <Link href={`/classifieds/${listing.id}`} className="block group">
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
                      <div className="absolute top-2 right-2 bg-orange-500/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                        TRADE
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="text-white font-semibold text-sm line-clamp-1 group-hover:text-orange-400 transition-colors">
                      {listing.year} {listing.make} {listing.model}
                    </h3>
                    <p className="text-orange-400 font-bold text-sm mt-1">
                      {formatPrice(listing.price, listing.price_type)}
                    </p>
                    {location && (
                      <p className="text-zinc-500 text-xs mt-0.5">{location}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-2 text-xs">
                      {sellerAvatarUrl ? (
                        <Image src={sellerAvatarUrl} alt="" width={16} height={16} className="rounded-full object-cover" />
                      ) : (
                        <div className="w-4 h-4 rounded-full bg-zinc-700" />
                      )}
                      <span className="text-zinc-400">{listing.seller_username}</span>
                      {listing.seller_verified && <VerifiedBadge className="w-3 h-3" />}
                    </div>
                  </div>
                </Link>
                {/* Unsave button */}
                <button
                  onClick={() => handleUnsave(listing.id)}
                  disabled={removing.has(listing.id)}
                  className="absolute top-2 left-2 p-1.5 rounded-full bg-black/50 text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                  title="Remove from saved"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
