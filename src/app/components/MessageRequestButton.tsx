'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { startConversation } from '@/app/actions/messages'

interface Props {
  profileId: string
  username: string | null
  friendsOnly: boolean
}

export default function MessageRequestButton({ profileId, username, friendsOnly }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  if (friendsOnly) {
    return (
      <button
        disabled
        className="bg-zinc-800 text-zinc-500 text-sm font-semibold px-4 py-2 rounded-lg cursor-not-allowed"
        title="Only accepts messages from friends"
      >
        Friends-only messages
      </button>
    )
  }

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setError('')
    try {
      const { conversationId } = await startConversation(profileId, trimmed)
      router.push(`/messages/${conversationId}`)
    } catch (e: any) {
      setError(e.message ?? 'Failed to send message')
      setSending(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
      >
        Message
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => !sending && setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-5"
          >
            <h2 className="text-lg font-bold text-white mb-1">Message @{username ?? 'rider'}</h2>
            <p className="text-sm text-zinc-400 mb-4">
              You're not friends yet — this will go to their Requests folder.
            </p>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write a short intro…"
              rows={4}
              maxLength={2000}
              autoFocus
              disabled={sending}
              className="w-full bg-zinc-800 text-white placeholder-zinc-500 text-base rounded-xl px-4 py-3 resize-none outline-none focus:ring-1 focus:ring-orange-500"
            />
            <p className="text-xs text-zinc-600 mt-1 text-right">{text.length} / 2000</p>

            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}

            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => setOpen(false)}
                disabled={sending}
                className="text-zinc-400 hover:text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!text.trim() || sending}
                className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
