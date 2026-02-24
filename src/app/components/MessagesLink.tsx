'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getUnreadMessageCount } from '@/app/actions/messages'

export default function MessagesLink({ userId }: { userId: string }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    getUnreadMessageCount().then(setCount)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('messages_badge')
      // New message arrives — re-fetch count if it's not from us
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as { sender_id: string }
          if (msg.sender_id !== userId) {
            getUnreadMessageCount().then(setCount)
          }
        }
      )
      // Message marked as read — re-fetch so badge decrements
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        () => {
          getUnreadMessageCount().then(setCount)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  return (
    <Link
      href="/messages"
      className="relative p-1.5 text-zinc-400 hover:text-white transition-colors"
      aria-label="Messages"
    >
      <svg
        className="w-5 h-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-orange-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  )
}
