'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getOrCreateConversation } from '@/app/actions/messages'

export default function MessageButton({ profileId }: { profileId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleClick() {
    setLoading(true)
    try {
      const conversationId = await getOrCreateConversation(profileId)
      router.push(`/messages/${conversationId}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors border border-zinc-700"
    >
      {loading ? '…' : 'Message'}
    </button>
  )
}
