'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getOrCreateConversation } from '@/app/actions/messages'

export default function MessageButton({
  profileId,
  locked,
  variant = 'primary',
}: {
  profileId: string
  locked?: boolean
  variant?: 'primary' | 'outlined'
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleClick() {
    if (locked) return
    setLoading(true)
    setError('')
    try {
      const conversationId = await getOrCreateConversation(profileId)
      router.push(`/messages/${conversationId}`)
    } catch (e: any) {
      setError(e.message ?? 'Failed to start conversation')
      setLoading(false)
    }
  }

  if (locked) {
    return (
      <div className="relative group">
        <button
          disabled
          className="bg-zinc-700 text-zinc-500 text-sm font-semibold px-4 py-2 rounded-lg cursor-not-allowed"
        >
          Message
        </button>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          Post or comment to unlock messaging
        </div>
      </div>
    )
  }

  const className =
    variant === 'outlined'
      ? 'bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors border border-zinc-700'
      : 'bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors'

  return (
    <div>
      <button onClick={handleClick} disabled={loading} className={className}>
        {loading ? '…' : 'Message'}
      </button>
      {error && (
        <p className="text-red-400 text-sm mt-1 max-w-[200px]">{error}</p>
      )}
    </div>
  )
}
