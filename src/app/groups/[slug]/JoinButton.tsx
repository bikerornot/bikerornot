'use client'

import { useState } from 'react'
import { joinGroup, leaveGroup } from '@/app/actions/groups'

interface Props {
  groupId: string
  privacy: 'public' | 'private'
  initialStatus: 'none' | 'pending' | 'active'
  initialRole: 'admin' | 'member' | null
}

export default function JoinButton({ groupId, privacy, initialStatus, initialRole }: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [role] = useState(initialRole)
  const [loading, setLoading] = useState(false)
  const [hovered, setHovered] = useState(false)

  if (role === 'admin') {
    return (
      <span className="text-sm bg-orange-500/20 text-orange-400 border border-orange-500/30 px-3 py-1.5 rounded-full font-medium">
        Admin
      </span>
    )
  }

  async function handleJoin() {
    setLoading(true)
    try {
      await joinGroup(groupId)
      setStatus(privacy === 'public' ? 'active' : 'pending')
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleLeave() {
    setLoading(true)
    try {
      await leaveGroup(groupId)
      setStatus('none')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to leave group')
    } finally {
      setLoading(false)
    }
  }

  if (status === 'active') {
    return (
      <button
        onClick={handleLeave}
        disabled={loading}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="text-sm border px-4 py-1.5 rounded-full font-medium transition-colors disabled:opacity-40 border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30"
      >
        {loading ? '…' : hovered ? 'Leave' : '✓ Joined'}
      </button>
    )
  }

  if (status === 'pending') {
    return (
      <button
        onClick={handleLeave}
        disabled={loading}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="text-sm border px-4 py-1.5 rounded-full font-medium transition-colors disabled:opacity-40 border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30"
      >
        {loading ? '…' : hovered ? 'Cancel' : 'Pending'}
      </button>
    )
  }

  return (
    <button
      onClick={handleJoin}
      disabled={loading}
      className="text-sm bg-orange-500 hover:bg-orange-600 text-white px-4 py-1.5 rounded-full font-medium transition-colors disabled:opacity-40"
    >
      {loading ? '…' : privacy === 'private' ? 'Request to Join' : 'Join Group'}
    </button>
  )
}
