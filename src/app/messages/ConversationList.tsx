'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { getImageUrl } from '@/lib/supabase/image'
import type { ConversationSummary } from '@/lib/supabase/types'

function formatTimeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface Props {
  initialConversations: ConversationSummary[]
  currentUserId: string
}

export default function ConversationList({ initialConversations, currentUserId }: Props) {
  const [conversations, setConversations] = useState<ConversationSummary[]>(initialConversations)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('inbox_messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as { conversation_id: string; sender_id: string; content: string; created_at: string }
          setConversations((prev) => {
            const updated = prev.map((c) => {
              if (c.id !== msg.conversation_id) return c
              return {
                ...c,
                last_message_preview: msg.content,
                last_message_at: msg.created_at,
                unread_count: msg.sender_id !== currentUserId ? c.unread_count + 1 : c.unread_count,
              }
            })
            return [...updated].sort(
              (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
            )
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUserId])

  if (conversations.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-600">
        <p className="text-4xl mb-3">💬</p>
        <p className="text-sm">No conversations yet.</p>
        <p className="text-xs mt-1">Visit someone's profile and hit Message to start one.</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {conversations.map((c) => {
        const avatarUrl = c.other_user.profile_photo_url
          ? getImageUrl('avatars', c.other_user.profile_photo_url)
          : null
        const initials = (c.other_user.username?.[0] ?? '?').toUpperCase()
        const hasUnread = c.unread_count > 0

        return (
          <Link
            key={c.id}
            href={`/messages/${c.id}`}
            className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-800 transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
              {avatarUrl ? (
                <Image src={avatarUrl} alt={initials} width={48} height={48} className="object-cover w-full h-full" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-300 font-bold">
                  {initials}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm truncate ${hasUnread ? 'text-white font-semibold' : 'text-zinc-300'}`}>
                  @{c.other_user.username}
                </span>
                <span className="text-xs text-zinc-500 flex-shrink-0">
                  {formatTimeAgo(c.last_message_at)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <p className={`text-xs truncate flex-1 ${hasUnread ? 'text-zinc-300' : 'text-zinc-500'}`}>
                  {c.last_message_preview ?? 'No messages yet'}
                </p>
                {hasUnread && (
                  <span className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0" />
                )}
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
