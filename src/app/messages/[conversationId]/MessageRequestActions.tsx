'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { acceptMessageRequest, ignoreMessageRequest } from '@/app/actions/messages'
import { blockUser } from '@/app/actions/blocks'

interface Props {
  conversationId: string
  senderId: string
  senderUsername: string | null
}

export default function MessageRequestActions({ conversationId, senderId, senderUsername }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function handleAccept() {
    setError('')
    startTransition(async () => {
      try {
        await acceptMessageRequest(conversationId)
        router.refresh()
      } catch (e: any) {
        setError(e.message ?? 'Failed to accept')
      }
    })
  }

  function handleIgnore() {
    setError('')
    startTransition(async () => {
      try {
        await ignoreMessageRequest(conversationId)
        router.push('/messages')
      } catch (e: any) {
        setError(e.message ?? 'Failed to ignore')
      }
    })
  }

  function handleBlock() {
    if (!confirm(`Block @${senderUsername ?? 'this user'}? You won't see their messages or activity anymore.`)) return
    setError('')
    startTransition(async () => {
      try {
        await blockUser(senderId)
        await ignoreMessageRequest(conversationId)
        router.push('/messages')
      } catch (e: any) {
        setError(e.message ?? 'Failed to block')
      }
    })
  }

  return (
    <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-3">
      <p className="text-sm text-zinc-400 mb-2">
        @{senderUsername ?? 'this rider'} sent you a message request.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={handleAccept}
          disabled={isPending}
          className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
        >
          Accept
        </button>
        <button
          onClick={handleIgnore}
          disabled={isPending}
          className="flex-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 text-sm font-semibold py-2 rounded-lg transition-colors"
        >
          Ignore
        </button>
        <button
          onClick={handleBlock}
          disabled={isPending}
          className="flex-1 bg-zinc-800 hover:bg-red-900/40 disabled:opacity-50 text-red-400 text-sm font-semibold py-2 rounded-lg transition-colors"
        >
          Block
        </button>
      </div>
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
    </div>
  )
}
