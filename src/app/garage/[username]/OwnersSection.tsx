'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getImageUrl } from '@/lib/supabase/image'
import { getBikeOwnersPaginated } from '@/app/actions/bikes'
import type { BikeOwnerSummary } from './GaragePage'

interface Props {
  year: number
  make: string
  model: string
  initialOwners: BikeOwnerSummary[]
  totalCount: number
  currentUserId?: string
  profileId: string
  username: string
}

export default function OwnersSection({
  year,
  make,
  model,
  initialOwners,
  totalCount,
  currentUserId,
  profileId,
  username,
}: Props) {
  const [owners, setOwners] = useState(initialOwners)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const hasMore = owners.length < totalCount

  async function loadMore() {
    setLoading(true)
    try {
      const nextPage = page + 1
      const more = await getBikeOwnersPaginated(year, make, model, nextPage, 12)
      // Filter out the page owner from paginated results too
      const filtered = (more as BikeOwnerSummary[]).filter((o) => o.id !== profileId)
      setOwners((prev) => [...prev, ...filtered])
      setPage(nextPage)
    } finally {
      setLoading(false)
    }
  }

  if (totalCount === 0) return null

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-3">
        Other Owners{totalCount > 0 ? ` (${totalCount})` : ''}
      </h2>

      {owners.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-zinc-500 text-sm">No other owners found on BikerOrNot yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {owners.map((owner) => {
            const avatarUrl = owner.profile_photo_url
              ? getImageUrl('avatars', owner.profile_photo_url, undefined, owner.updated_at)
              : null
            const location = [owner.city, owner.state].filter(Boolean).join(', ')

            return (
              <Link
                key={owner.id}
                href={`/profile/${owner.username}`}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col items-center gap-2 hover:border-zinc-700 transition-colors"
              >
                <div className="relative w-14 h-14 rounded-full bg-zinc-800 overflow-hidden flex-shrink-0">
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt={owner.username ?? ''}
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-lg font-bold text-zinc-600">
                      {(owner.first_name?.[0] ?? '?').toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="text-center min-w-0 w-full">
                  <p className="text-white text-sm font-medium truncate">
                    @{owner.username}
                  </p>
                  {location && (
                    <p className="text-zinc-500 text-sm truncate">{location}</p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {hasMore && (
        <div className="mt-4">
          <button
            onClick={loadMore}
            disabled={loading}
            className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            {loading ? 'Loading...' : 'Show More'}
          </button>
        </div>
      )}
    </div>
  )
}
