'use client'

import { useState } from 'react'
import { reportGamePhoto, type ReportReason } from '@/app/actions/game-reports'

interface Props {
  bikePhotoId: string
  onClose: () => void
  onSubmitted: () => void
}

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'wrong_year', label: 'Wrong year' },
  { value: 'wrong_make', label: 'Wrong make' },
  { value: 'wrong_model', label: 'Wrong model' },
  { value: 'bad_angle', label: 'Photo is not a good angle' },
  { value: 'multiple_bikes', label: 'Multiple bikes in photo' },
]

export default function GameReportModal({ bikePhotoId, onClose, onSubmitted }: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!reason || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const result = await reportGamePhoto(bikePhotoId, reason)
      if ('error' in result) {
        setError(result.error)
        setSubmitting(false)
        return
      }
      onSubmitted()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not submit report')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h2 className="text-white font-semibold">Report this bike</h2>
          <p className="text-zinc-400 text-xs mt-0.5">Tell us what&rsquo;s wrong so we can review it.</p>
        </div>
        <div className="px-5 py-4 space-y-2">
          {REASONS.map((r) => (
            <label
              key={r.value}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                reason === r.value
                  ? 'bg-orange-500/15 border-orange-500/50'
                  : 'bg-zinc-800/50 border-zinc-700 hover:bg-zinc-800'
              }`}
            >
              <input
                type="radio"
                name="reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="accent-orange-500"
              />
              <span className="text-sm text-zinc-200">{r.label}</span>
            </label>
          ))}
          {error && <p className="text-red-400 text-sm pt-1">{error}</p>}
        </div>
        <div className="px-5 py-3 border-t border-zinc-800 flex gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reason || submitting}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors disabled:bg-zinc-700 disabled:text-zinc-500"
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}
