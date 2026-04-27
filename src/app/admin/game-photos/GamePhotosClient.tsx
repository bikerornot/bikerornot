'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getUnreviewedGamePhotos, submitGamePhotoReviews, getGamePhotoStats, autoVetUnreviewedGamePhotos, type GamePhoto, type GamePhotoStats } from '@/app/actions/game'

const REASON_LABELS: Record<string, string> = {
  unidentifiable: 'Unidentifiable',
  person_visible: 'Person visible',
  multiple_bikes_unclear_subject: 'Multiple bikes',
  trike: 'Trike',
}

// Pre-select photos based on the AI verdict so moderators only have to
// flip the rare disagreements. Unvetted photos default to approved
// (matches existing behaviour).
function defaultCheckedIds(photos: GamePhoto[]): Set<string> {
  return new Set(photos.filter((p) => p.auto_decision !== 'reject').map((p) => p.id))
}

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
  const [checkedIds, setCheckedIds] = useState<Set<string>>(defaultCheckedIds(initialPhotos))
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(0)
  const [vetting, setVetting] = useState(false)
  const [vetSummary, setVetSummary] = useState<string | null>(null)

  async function handleRunVetter() {
    if (vetting) return
    setVetting(true)
    setVetSummary(null)
    try {
      const summary = await autoVetUnreviewedGamePhotos()
      setVetSummary(
        `Vetted ${summary.total}: auto-approved ${summary.autoApproved}, auto-rejected ${summary.autoRejected}, ` +
          `${summary.needsReview} need review${summary.errors > 0 ? `, ${summary.errors} errors` : ''}.`,
      )
      const [nextPhotos, nextStats] = await Promise.all([
        getUnreviewedGamePhotos(20),
        getGamePhotoStats(),
      ])
      setPhotos(nextPhotos)
      setStats(nextStats)
      setCheckedIds(defaultCheckedIds(nextPhotos))
    } catch (err) {
      setVetSummary(`Vetter failed: ${err instanceof Error ? err.message : 'unknown error'}`)
    } finally {
      setVetting(false)
    }
  }

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
      setCheckedIds(defaultCheckedIds(nextPhotos))
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
        <Link href="/admin/game-photos/rejected" className="hover:bg-zinc-800/50 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Rejected</p>
          <p className="text-lg font-bold text-red-400 underline decoration-red-400/30 underline-offset-2">{stats.rejected}</p>
        </Link>
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

      {/* AI vetter row — clears the obvious cases (clear approve / obvious
          reject) automatically and surfaces the rest with a recommendation
          so the moderator only flips the disagreements. */}
      <div className="flex flex-wrap items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
        <button
          onClick={handleRunVetter}
          disabled={vetting || stats.remaining === 0}
          className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors flex items-center gap-2"
        >
          {vetting ? (
            <>
              <span className="inline-block w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Vetting…
            </>
          ) : (
            <>✨ Run AI vetter on unreviewed</>
          )}
        </button>
        <p className="text-zinc-500 text-xs">
          GPT-4o-mini scans for blurry photos, people, multiple bikes, and trikes. High-confidence verdicts auto-approve or auto-reject; the rest land here with a recommendation.
        </p>
        {vetSummary && (
          <p className="text-zinc-300 text-sm w-full bg-zinc-800/60 rounded-lg px-3 py-2">{vetSummary}</p>
        )}
      </div>

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

                  {/* AI verdict badge — present whenever the vetter ran on
                      this row but the result wasn't confident enough to
                      auto-decide. Saves the moderator from re-reasoning
                      from scratch. */}
                  {photo.auto_decision && (
                    <div className={`absolute top-2 left-2 max-w-[calc(100%-3rem)] rounded-md px-2 py-1 text-[10px] font-semibold leading-tight backdrop-blur-sm ${
                      photo.auto_decision === 'reject'
                        ? 'bg-red-500/80 text-white'
                        : photo.auto_decision === 'approve'
                          ? 'bg-emerald-500/80 text-white'
                          : 'bg-yellow-500/80 text-zinc-900'
                    }`}>
                      <span>AI: {photo.auto_decision}</span>
                      {typeof photo.auto_decision_confidence === 'number' && (
                        <span className="opacity-80"> ({Math.round(photo.auto_decision_confidence * 100)}%)</span>
                      )}
                      {photo.auto_decision_reasons && photo.auto_decision_reasons.length > 0 && (
                        <div className="opacity-90 mt-0.5">
                          {photo.auto_decision_reasons.map((r) => REASON_LABELS[r] ?? r).join(', ')}
                        </div>
                      )}
                    </div>
                  )}

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
