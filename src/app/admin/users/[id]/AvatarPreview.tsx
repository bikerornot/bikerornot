'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { approveAvatars, rejectAvatarAndBan, resetAvatarReview } from '@/app/actions/images'

export default function AvatarPreview({
  avatarUrl,
  firstName,
  userId,
  storagePath,
  isReviewed,
}: {
  avatarUrl: string | null
  firstName?: string | null
  userId: string
  storagePath: string | null
  isReviewed: boolean
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [reviewState, setReviewState] = useState<'pending' | 'approved' | 'rejected'>(
    isReviewed ? 'approved' : 'pending'
  )
  const ref = useRef<HTMLDivElement>(null)

  function handleMouseEnter() {
    if (!ref.current || !avatarUrl) return
    const rect = ref.current.getBoundingClientRect()
    setPos({ top: rect.top, left: rect.right + 12 })
  }

  function handleMouseLeave() {
    setPos(null)
  }

  async function handleApprove() {
    setBusy(true)
    try {
      await approveAvatars([userId])
      setReviewState('approved')
    } finally {
      setBusy(false)
    }
  }

  async function handleReject() {
    setBusy(true)
    try {
      await rejectAvatarAndBan(userId)
      setReviewState('rejected')
    } finally {
      setBusy(false)
    }
  }

  const showActions = avatarUrl && reviewState === 'pending'

  async function handleReset() {
    setBusy(true)
    try {
      await resetAvatarReview(userId)
      setReviewState('pending')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="space-y-2">
        <div
          ref={ref}
          className="flex-shrink-0 cursor-zoom-in"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className={`w-14 h-14 rounded-full bg-zinc-700 overflow-hidden ring-2 ${
            reviewState === 'approved' ? 'ring-emerald-500/50' :
            reviewState === 'rejected' ? 'ring-red-500/50' :
            avatarUrl ? 'ring-yellow-500/50' : 'ring-transparent'
          }`}>
            {avatarUrl ? (
              <Image src={avatarUrl} alt="" width={56} height={56} className="object-cover w-full h-full" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold text-lg">
                {firstName?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
          </div>
        </div>

        {/* Review status badge */}
        {avatarUrl && (
          <div className="flex items-center justify-center">
            {reviewState === 'approved' && (
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded">APPROVED</span>
            )}
            {reviewState === 'rejected' && (
              <span className="text-[10px] font-bold text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded">BANNED</span>
            )}
            {reviewState === 'pending' && (
              <span className="text-[10px] font-bold text-yellow-400 bg-yellow-500/15 px-1.5 py-0.5 rounded">PENDING</span>
            )}
          </div>
        )}

        {/* Approve / Remove buttons */}
        {showActions && (
          <div className="flex gap-1">
            <button
              onClick={handleApprove}
              disabled={busy}
              className="flex-1 bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 text-emerald-400 text-[10px] font-bold py-1 rounded transition-colors"
            >
              Approve
            </button>
            <button
              onClick={handleReject}
              disabled={busy}
              className="flex-1 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 text-red-400 text-[10px] font-bold py-1 rounded transition-colors"
            >
              Reject
            </button>
          </div>
        )}

        {/* Reset approved avatar back to pending for re-review */}
        {avatarUrl && reviewState === 'approved' && (
          <button
            onClick={handleReset}
            disabled={busy}
            className="w-full bg-yellow-500/10 hover:bg-yellow-500/20 disabled:opacity-40 text-yellow-400 text-[10px] font-bold py-1 rounded transition-colors"
          >
            Reset to Pending
          </button>
        )}
      </div>

      {avatarUrl && pos && (
        <div
          className="fixed pointer-events-none rounded-xl overflow-hidden shadow-2xl ring-1 ring-zinc-700"
          style={{ top: pos.top, left: pos.left, zIndex: 9999 }}
        >
          <Image src={avatarUrl} alt="" width={500} height={500} className="object-cover block" />
        </div>
      )}
    </>
  )
}
