'use client'

import { useState } from 'react'
import { submitReport } from '@/app/actions/reports'
import { REPORT_REASONS } from '@/lib/supabase/types'

interface Props {
  type: 'post' | 'comment' | 'profile'
  targetId: string
  /** Optional extra classes for the trigger button */
  className?: string
}

export default function ReportButton({ type, targetId, className }: Props) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<'success' | 'duplicate' | null>(null)

  function handleOpen() {
    setOpen(true)
    setReason('')
    setDetails('')
    setDone(null)
  }

  async function handleSubmit() {
    if (!reason) return
    setSubmitting(true)
    const result = await submitReport(type, targetId, reason, details)
    setSubmitting(false)
    if (result.error === 'already_reported') {
      setDone('duplicate')
    } else {
      setDone('success')
    }
  }

  const label = type === 'post' ? 'Report post' : type === 'comment' ? 'Report comment' : 'Report profile'

  return (
    <>
      <button
        onClick={handleOpen}
        className={className ?? 'text-xs text-zinc-500 hover:text-red-400 transition-colors'}
        title={label}
      >
        Report
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm shadow-2xl p-5">
            {done === 'success' ? (
              <div className="text-center py-4">
                <p className="text-2xl mb-2">✅</p>
                <p className="text-white font-semibold">Report submitted</p>
                <p className="text-zinc-400 text-sm mt-1">Thanks — our team will review it shortly.</p>
                <button
                  onClick={() => setOpen(false)}
                  className="mt-4 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold px-6 py-2 rounded-xl transition-colors"
                >
                  Done
                </button>
              </div>
            ) : done === 'duplicate' ? (
              <div className="text-center py-4">
                <p className="text-2xl mb-2">👍</p>
                <p className="text-white font-semibold">Already reported</p>
                <p className="text-zinc-400 text-sm mt-1">You've already submitted a report for this content.</p>
                <button
                  onClick={() => setOpen(false)}
                  className="mt-4 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold px-6 py-2 rounded-xl transition-colors"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-white font-semibold text-base mb-1">{label.charAt(0).toUpperCase() + label.slice(1)}</h2>
                <p className="text-zinc-400 text-sm mb-4">Why are you reporting this?</p>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  {REPORT_REASONS.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => setReason(r.value)}
                      className={`text-left px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                        reason === r.value
                          ? 'bg-orange-600 border-orange-500 text-white'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>

                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Additional details (optional)"
                  rows={2}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-500 resize-none outline-none focus:ring-1 focus:ring-orange-500 mb-4"
                />

                <div className="flex gap-2">
                  <button
                    onClick={() => setOpen(false)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-semibold py-2 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!reason || submitting}
                    className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2 rounded-xl transition-colors"
                  >
                    {submitting ? 'Submitting…' : 'Submit'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
