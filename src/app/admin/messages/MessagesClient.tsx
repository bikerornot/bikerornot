'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { getAdminMessages, getConversationThread, type AdminMessageRow, type AdminThreadMessage } from '@/app/actions/admin'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

function Avatar({
  user,
}: {
  user: { username: string | null; first_name: string; last_name: string; profile_photo_url: string | null }
}) {
  const url = user.profile_photo_url
    ? `${SUPABASE_URL}/storage/v1/object/public/avatars/${user.profile_photo_url}`
    : null
  const initials = `${user.first_name[0] ?? ''}${user.last_name[0] ?? ''}`.toUpperCase()

  if (url) {
    return (
      <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-zinc-700">
        <Image src={url} alt={user.first_name} fill className="object-cover" unoptimized />
      </div>
    )
  }
  return (
    <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0 text-zinc-300 text-sm font-semibold">
      {initials || '?'}
    </div>
  )
}

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function MessagesClient({
  initialMessages,
  initialHasMore,
}: {
  initialMessages: AdminMessageRow[]
  initialHasMore: boolean
}) {
  const [messages, setMessages] = useState(initialMessages)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [page, setPage] = useState(0)
  const [isPending, startTransition] = useTransition()
  const [expandedThread, setExpandedThread] = useState<string | null>(null)
  const [threadMessages, setThreadMessages] = useState<AdminThreadMessage[]>([])
  const [threadPending, startThreadTransition] = useTransition()

  function toggleThread(conversationId: string) {
    if (expandedThread === conversationId) {
      setExpandedThread(null)
      setThreadMessages([])
      return
    }
    setExpandedThread(conversationId)
    startThreadTransition(async () => {
      const thread = await getConversationThread(conversationId)
      setThreadMessages(thread)
    })
  }

  function loadMore() {
    const nextPage = page + 1
    startTransition(async () => {
      const { messages: more, hasMore: moreLeft } = await getAdminMessages(nextPage, 50)
      setMessages((prev) => [...prev, ...more])
      setHasMore(moreLeft)
      setPage(nextPage)
    })
  }

  if (messages.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
        <p className="text-zinc-500 text-sm">No messages yet.</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-zinc-600 text-xs mb-4">{messages.length} messages shown</p>

      <div className="space-y-2">
        {messages.map((msg) => {
          const sender = msg.sender
          const recipient = msg.recipient

          return (
            <div key={msg.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex gap-3">
                {sender ? (
                  <Avatar user={sender} />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex-shrink-0" />
                )}

                <div className="min-w-0 flex-1">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      {sender ? (
                        <Link
                          href={`/admin/users/${sender.id}`}
                          className="text-sm font-semibold text-white hover:text-orange-400 transition-colors"
                        >
                          {sender.first_name} {sender.last_name}
                          {sender.username && (
                            <span className="text-zinc-400 font-normal ml-1">@{sender.username}</span>
                          )}
                        </Link>
                      ) : (
                        <span className="text-zinc-500 text-sm">Unknown sender</span>
                      )}

                      {recipient && (
                        <span className="text-zinc-600 text-xs">
                          →{' '}
                          <button
                            onClick={() => toggleThread(msg.conversation_id)}
                            className="hover:text-orange-400 transition-colors underline decoration-zinc-700 underline-offset-2 hover:decoration-orange-400"
                            title="View last 10 messages in this conversation"
                          >
                            {recipient.username ? `@${recipient.username}` : `${recipient.first_name} ${recipient.last_name}`}
                          </button>
                          {' · '}
                          <Link
                            href={`/admin/users/${recipient.id}`}
                            className="hover:text-zinc-400 transition-colors"
                          >
                            profile
                          </Link>
                        </span>
                      )}

                      {sender?.status === 'banned' && (
                        <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded font-medium">
                          Banned
                        </span>
                      )}
                      {sender?.status === 'suspended' && (
                        <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded font-medium">
                          Suspended
                        </span>
                      )}
                    </div>

                    <span className="text-zinc-600 text-xs whitespace-nowrap flex-shrink-0">
                      {formatTimestamp(msg.created_at)}
                    </span>
                  </div>

                  {/* Message content */}
                  <p className="text-zinc-300 text-sm break-words leading-relaxed">
                    {msg.content}
                  </p>

                  {/* Expandable thread */}
                  {expandedThread === msg.conversation_id && (
                    <div className="mt-3 pt-3 border-t border-zinc-800">
                      <p className="text-zinc-500 text-xs font-medium mb-2">Last 10 messages in this conversation</p>
                      {threadPending ? (
                        <p className="text-zinc-600 text-xs">Loading thread…</p>
                      ) : threadMessages.length === 0 ? (
                        <p className="text-zinc-600 text-xs">No messages found.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {threadMessages.map((tm) => (
                            <div key={tm.id} className={`text-xs leading-relaxed ${tm.id === msg.id ? 'bg-orange-500/10 border border-orange-500/20 rounded-lg p-2' : 'px-2 py-1'}`}>
                              <Link
                                href={`/admin/users/${tm.sender_id}`}
                                className={`font-semibold hover:underline ${tm.sender_id === msg.sender_id ? 'text-orange-400' : 'text-blue-400'}`}
                              >
                                {tm.sender_name}
                                {tm.sender_username && (
                                  <span className="text-zinc-500 font-normal ml-1">@{tm.sender_username}</span>
                                )}
                              </Link>
                              <span className="text-zinc-600 ml-2">{formatTimestamp(tm.created_at)}</span>
                              <p className="text-zinc-300 mt-0.5 break-words">{tm.content}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {hasMore && (
        <div className="mt-5 text-center">
          <button
            onClick={loadMore}
            disabled={isPending}
            className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {isPending ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
