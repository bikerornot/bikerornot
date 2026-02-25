'use client'

import { useState } from 'react'
import {
  sendFriendRequest,
  cancelFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  unfriend,
} from '@/app/actions/friends'

export type FriendshipStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted'

interface Props {
  profileId: string
  initialStatus: FriendshipStatus
}

export default function FriendButton({ profileId, initialStatus }: Props) {
  const [status, setStatus] = useState<FriendshipStatus>(initialStatus)
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function run(action: () => Promise<void>, nextStatus: FriendshipStatus) {
    setLoading(true)
    const prev = status
    setStatus(nextStatus)
    try {
      await action()
    } catch {
      setStatus(prev)
    } finally {
      setLoading(false)
      setConfirming(false)
    }
  }

  if (status === 'pending_received') {
    return (
      <>
        <button
          onClick={() => run(() => acceptFriendRequest(profileId), 'accepted')}
          disabled={loading}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          Accept
        </button>
        <button
          onClick={() => run(() => declineFriendRequest(profileId), 'none')}
          disabled={loading}
          className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors border border-zinc-700"
        >
          Decline
        </button>
      </>
    )
  }

  if (status === 'accepted') {
    if (confirming) {
      return (
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 text-sm">Unfriend?</span>
          <button
            onClick={() => run(() => unfriend(profileId), 'none')}
            disabled={loading}
            className="bg-red-500/20 hover:bg-red-500/30 disabled:opacity-50 text-red-400 text-sm font-semibold px-3 py-2 rounded-lg transition-colors border border-red-500/30"
          >
            {loading ? '…' : 'Yes'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={loading}
            className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-400 text-sm font-semibold px-3 py-2 rounded-lg transition-colors border border-zinc-700"
          >
            No
          </button>
        </div>
      )
    }
    return (
      <button
        onClick={() => setConfirming(true)}
        disabled={loading}
        className="bg-green-500/20 hover:bg-green-500/30 disabled:opacity-50 text-green-400 text-sm font-semibold px-4 py-2 rounded-lg transition-colors border border-green-500/40"
      >
        Friends ✓
      </button>
    )
  }

  if (status === 'pending_sent') {
    return (
      <button
        onClick={() => run(() => cancelFriendRequest(profileId), 'none')}
        disabled={loading}
        className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-400 text-sm font-semibold px-4 py-2 rounded-lg transition-colors border border-zinc-700"
      >
        {loading ? '…' : 'Pending'}
      </button>
    )
  }

  return (
    <button
      onClick={() => run(() => sendFriendRequest(profileId), 'pending_sent')}
      disabled={loading}
      className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
    >
      {loading ? '…' : 'Add Friend'}
    </button>
  )
}
