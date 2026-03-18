'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { approveAvatars, removeAvatars } from '@/app/actions/images'

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
  const [reviewState, setReviewState] = useState<'pending' | 'approved' | 'removed'>(
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

  async function handleRemove() {
    if (!storagePath) return
    setBusy(true)
    try {
      await removeAvatars([{ userId, storagePath }])
      setReviewState('removed')
    } finally {
      setBusy(false)
    }
  }

  const showActions = avatarUrl && reviewState === 'pending'

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
            reviewState === 'removed' ? 'ring-red-500/50' :
            avatarUrl ? 'ring-yellow-500/50' : 'ring-transparent'
          }`}>
            {avatarUrl && reviewState !== 'removed' ? (
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
            {reviewState === 'removed' && (
              <span className="text-[10px] font-bold text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded">REMOVED</span>
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
              onClick={handleRemove}
              disabled={busy}
              className="flex-1 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 text-red-400 text-[10px] font-bold py-1 rounded transition-colors"
            >
              Remove
            </button>
          </div>
        )}
      </div>

      {avatarUrl && reviewState !== 'removed' && pos && (
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
