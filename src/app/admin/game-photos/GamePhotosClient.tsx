'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getUnreviewedGamePhotos, submitGamePhotoReviews, getGamePhotoStats, type GamePhoto, type GamePhotoStats } from '@/app/actions/game'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

function bikePhotoUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/bikes/${path}`
}

interface Props {
  initialPhotos: GamePhoto[]
  initialStats: GamePhotoStats
}

export default function GamePhotosClient({ initialPhotos, initialStats }: Props) {
  const [photos, setPhotos] = useState<GamePhoto[]>(initialPhotos)
  const [stats, setStats] = useState<GamePhotoStats>(initialStats)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set(initialPhotos.map((p) => p.id)))
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(0)

  function togglePhoto(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function selectAll() {
    setCheckedIds(new Set(photos.map((p) => p.id)))
  }

  function deselectAll() {
    setCheckedIds(new Set())
  }

  async function handleSubmit() {
    if (submitting) return
    setSubmitting(true)

    const approved = photos.filter((p) => checkedIds.has(p.id)).map((p) => p.id)
    const rejected = photos.filter((p) => !checkedIds.has(p.id)).map((p) => p.id)

    try {
      await submitGamePhotoReviews(approved, rejected)
      setSubmitted((prev) => prev + photos.length)

      // Load next batch
      setLoading(true)
      const [nextPhotos, nextStats] = await Promise.all([
        getUnreviewedGamePhotos(20),
        getGamePhotoStats(),
      ])
      setPhotos(nextPhotos)
      setStats(nextStats)
      setCheckedIds(new Set(nextPhotos.map((p) => p.id)))
    } catch (err) {
      console.error('Failed to submit reviews:', err)
    } finally {
      setSubmitting(false)
      setLoading(false)
    }
  }

  const approvedCount = checkedIds.size
  const rejectedCount = photos.length - checkedIds.size

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Game Photo Review</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Review Harley-Davidson photos for the Guess the Harley game.
          Uncheck photos that are blurry, don't show the bike clearly, or are unsuitable.
        </p>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap gap-4 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Total</p>
          <p className="text-lg font-bold text-white">{stats.total}</p>
        </div>
        <Link href="/admin/game-photos/approved" className="hover:bg-zinc-800/50 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Approved</p>
          <p className="text-lg font-bold text-emerald-400 underline decoration-emerald-400/30 underline-offset-2">{stats.approved}</p>
        </Link>
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Rejected</p>
          <p className="text-lg font-bold text-red-400">{stats.rejected}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Remaining</p>
          <p className="text-lg font-bold text-orange-400">{stats.remaining}</p>
        </div>
        {submitted > 0 && (
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider">This Session</p>
            <p className="text-lg font-bold text-zinc-300">{submitted}</p>
          </div>
        )}
      </div>

      {/* Empty state */}
      {photos.length === 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <p className="text-emerald-400 text-2xl mb-2">All caught up!</p>
          <p className="text-zinc-400 text-sm">No more Harley photos to review.</p>
        </div>
      )}

      {/* Action bar */}
      {photos.length > 0 && (
        <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 sticky top-16 z-30">
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-400">
              <span className="text-emerald-400 font-semibold">{approvedCount}</span> approved,{' '}
              <span className="text-red-400 font-semibold">{rejectedCount}</span> rejected
            </span>
            <button onClick={selectAll} className="text-xs text-zinc-500 hover:text-white transition-colors">Select all</button>
            <button onClick={deselectAll} className="text-xs text-zinc-500 hover:text-white transition-colors">Deselect all</button>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            {submitting ? 'Submitting...' : `Submit ${photos.length} Reviews`}
          </button>
        </div>
      )}

      {/* Photo grid */}
      {loading ? (
        <div className="text-center py-12">
          <p className="text-zinc-500 text-sm">Loading next batch...</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {photos.map((photo) => {
            const checked = checkedIds.has(photo.id)
            const bikeLabel = [photo.year, photo.model].filter(Boolean).join(' ')

            return (
              <button
                key={photo.id}
                type="button"
                onClick={() => togglePhoto(photo.id)}
                className={`relative rounded-xl overflow-hidden border-2 transition-colors text-left ${
                  checked
                    ? 'border-emerald-500/60'
                    : 'border-red-500/60'
                }`}
              >
                {/* Photo */}
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
                    checked
                      ? 'bg-emerald-500 border-emerald-500'
                      : 'bg-red-500/80 border-red-500'
                  }`}>
                    {checked ? (
                      <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
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
    </div>
  )
}
