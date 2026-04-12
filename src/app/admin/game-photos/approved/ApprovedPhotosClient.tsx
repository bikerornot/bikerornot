'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getApprovedGamePhotos, unapproveGamePhotos, getGamePhotoStats, type GamePhoto, type GamePhotoStats } from '@/app/actions/game'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const PAGE_SIZE = 40

function bikePhotoUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/bikes/${path}`
}

interface Props {
  initialPhotos: GamePhoto[]
  initialTotal: number
  initialStats: GamePhotoStats
}

export default function ApprovedPhotosClient({ initialPhotos, initialTotal, initialStats }: Props) {
  const [photos, setPhotos] = useState<GamePhoto[]>(initialPhotos)
  const [total, setTotal] = useState(initialTotal)
  const [stats, setStats] = useState<GamePhotoStats>(initialStats)
  const [uncheckedIds, setUncheckedIds] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [removed, setRemoved] = useState(0)

  const totalPages = Math.ceil(total / PAGE_SIZE)

  function togglePhoto(id: string) {
    setUncheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function loadPage(p: number) {
    setLoading(true)
    try {
      const { photos: nextPhotos, total: nextTotal } = await getApprovedGamePhotos(p, PAGE_SIZE)
      setPhotos(nextPhotos)
      setTotal(nextTotal)
      setPage(p)
      setUncheckedIds(new Set())
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit() {
    if (submitting || uncheckedIds.size === 0) return
    setSubmitting(true)

    try {
      await unapproveGamePhotos(Array.from(uncheckedIds))
      setRemoved((prev) => prev + uncheckedIds.size)

      // Reload current page
      const [{ photos: nextPhotos, total: nextTotal }, nextStats] = await Promise.all([
        getApprovedGamePhotos(page, PAGE_SIZE),
        getGamePhotoStats(),
      ])
      setPhotos(nextPhotos)
      setTotal(nextTotal)
      setStats(nextStats)
      setUncheckedIds(new Set())
    } catch (err) {
      console.error('Failed to unapprove photos:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/admin/game-photos" className="text-zinc-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-xl font-bold text-white">Approved Game Photos</h1>
          </div>
          <p className="text-zinc-400 text-sm mt-1 ml-8">
            Uncheck any photos you want to remove from the game, then hit Save.
          </p>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap gap-4 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Approved</p>
          <p className="text-lg font-bold text-emerald-400">{stats.approved}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Page</p>
          <p className="text-lg font-bold text-white">{page} / {totalPages}</p>
        </div>
        {removed > 0 && (
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Removed This Session</p>
            <p className="text-lg font-bold text-red-400">{removed}</p>
          </div>
        )}
      </div>

      {/* Action bar */}
      {photos.length > 0 && uncheckedIds.size > 0 && (
        <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 sticky top-16 z-30">
          <span className="text-sm text-zinc-400">
            <span className="text-red-400 font-semibold">{uncheckedIds.size}</span> photo{uncheckedIds.size !== 1 ? 's' : ''} will be removed from the game
          </span>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            {submitting ? 'Removing...' : `Remove ${uncheckedIds.size} Photo${uncheckedIds.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {/* Photo grid */}
      {loading ? (
        <div className="text-center py-12">
          <p className="text-zinc-500 text-sm">Loading...</p>
        </div>
      ) : photos.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <p className="text-zinc-400 text-sm">No approved photos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {photos.map((photo) => {
            const isUnchecked = uncheckedIds.has(photo.id)
            const bikeLabel = [photo.year, photo.model].filter(Boolean).join(' ')

            return (
              <button
                key={photo.id}
                type="button"
                onClick={() => togglePhoto(photo.id)}
                className={`relative rounded-xl overflow-hidden border-2 transition-colors text-left ${
                  isUnchecked
                    ? 'border-red-500/60 opacity-60'
                    : 'border-emerald-500/60'
                }`}
              >
                <div className="relative aspect-[4/3] bg-zinc-800">
                  <Image
                    src={bikePhotoUrl(photo.storage_path)}
                    alt={bikeLabel || 'Harley-Davidson'}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                  />

                  {/* Checkbox indicator */}
                  <div className={`absolute top-2 right-2 w-6 h-6 rounded border-2 flex items-center justify-center ${
                    isUnchecked
                      ? 'bg-red-500/80 border-red-500'
                      : 'bg-emerald-500 border-emerald-500'
                  }`}>
                    {isUnchecked ? (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>

                  {/* Bottom gradient + info */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-6">
                    <p className="text-white text-xs font-semibold leading-tight truncate">
                      {bikeLabel || 'Unknown'}
                    </p>
                    {photo.username && (
                      <p className="text-zinc-400 text-xs truncate">@{photo.username}</p>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-4">
          <button
            onClick={() => loadPage(page - 1)}
            disabled={page <= 1 || loading}
            className="px-3 py-1.5 text-sm rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-zinc-400 px-3">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => loadPage(page + 1)}
            disabled={page >= totalPages || loading}
            className="px-3 py-1.5 text-sm rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
