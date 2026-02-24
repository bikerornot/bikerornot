'use client'

import { useState, useRef, useEffect } from 'react'
import { submitReport } from '@/app/actions/reports'
import { blockUser } from '@/app/actions/blocks'
import { REPORT_REASONS } from '@/lib/supabase/types'

interface Props {
  /** For the report action */
  reportType: 'post' | 'comment' | 'profile'
  reportTargetId: string
  /** The user to block (author of the post/comment, or the profile being viewed) */
  blockUserId: string
  /** Optional: override the trigger button style */
  buttonClassName?: string
}

type View = 'menu' | 'report' | 'report_done' | 'report_duplicate' | 'block_done'

export default function ContentMenu({ reportType, reportTargetId, blockUserId, buttonClassName }: Props) {
  const [view, setView] = useState<View>('menu')
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function openMenu() {
    setView('menu')
    setOpen((v) => !v)
  }

  function startReport() {
    setOpen(false)
    setReason('')
    setDetails('')
    setView('report')
  }

  async function handleBlock() {
    setOpen(false)
    const result = await blockUser(blockUserId)
    if (!result.error || result.error === 'already_blocked') {
      setView('block_done')
    }
  }

  async function handleReportSubmit() {
    if (!reason) return
    setSubmitting(true)
    const result = await submitReport(reportType, reportTargetId, reason, details)
    setSubmitting(false)
    setView(result.error === 'already_reported' ? 'report_duplicate' : 'report_done')
  }

  const isModalOpen = view === 'report' || view === 'report_done' || view === 'report_duplicate' || view === 'block_done'

  const defaultButtonClass = 'text-zinc-500 hover:text-zinc-300 transition-colors px-1 py-0.5 rounded text-sm leading-none'

  return (
    <>
      {/* Three-dots trigger */}
      <div ref={menuRef} className="relative flex-shrink-0">
        <button
          onClick={openMenu}
          className={buttonClassName ?? defaultButtonClass}
          aria-label="More options"
        >
          •••
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 w-36 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-50 overflow-hidden">
            <button
              onClick={startReport}
              className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              Report
            </button>
            <div className="border-t border-zinc-800" />
            <button
              onClick={handleBlock}
              className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-zinc-800 transition-colors"
            >
              Block
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={(e) => { if (e.target === e.currentTarget) setView('menu') }}
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm shadow-2xl p-5">

            {view === 'block_done' && (
              <div className="text-center py-4">
                <p className="text-2xl mb-2">🚫</p>
                <p className="text-white font-semibold">User blocked</p>
                <p className="text-zinc-400 text-sm mt-1">You won't see content from this user.</p>
                <button
                  onClick={() => setView('menu')}
                  className="mt-4 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold px-6 py-2 rounded-xl transition-colors"
                >
                  Done
                </button>
              </div>
            )}

            {view === 'report_done' && (
              <div className="text-center py-4">
                <p className="text-2xl mb-2">✅</p>
                <p className="text-white font-semibold">Report submitted</p>
                <p className="text-zinc-400 text-sm mt-1">Thanks — our team will review it shortly.</p>
                <button
                  onClick={() => setView('menu')}
                  className="mt-4 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold px-6 py-2 rounded-xl transition-colors"
                >
                  Done
                </button>
              </div>
            )}

            {view === 'report_duplicate' && (
              <div className="text-center py-4">
                <p className="text-2xl mb-2">👍</p>
                <p className="text-white font-semibold">Already reported</p>
                <p className="text-zinc-400 text-sm mt-1">You've already submitted a report for this content.</p>
                <button
                  onClick={() => setView('menu')}
                  className="mt-4 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold px-6 py-2 rounded-xl transition-colors"
                >
                  Close
                </button>
              </div>
            )}

            {view === 'report' && (
              <>
                <h2 className="text-white font-semibold text-base mb-1">
                  {reportType === 'post' ? 'Report post' : reportType === 'comment' ? 'Report comment' : 'Report profile'}
                </h2>
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
                    onClick={() => setView('menu')}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-semibold py-2 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReportSubmit}
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
