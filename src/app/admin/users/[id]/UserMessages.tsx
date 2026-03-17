'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { getConversationThread, type AdminThreadMessage } from '@/app/actions/admin'

interface Message {
  id: string
  conversation_id: string
  content: string
  created_at: string
  recipient_username: string | null
}

function formatTimeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function UserMessages({
  messages,
  messageCount,
  userId,
}: {
  messages: Message[]
  messageCount: number
  userId: string
}) {
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

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
        <h2 className="text-white font-semibold text-sm">Sent Messages</h2>
        <span className="text-zinc-600 text-xs">{messages.length} shown (last 50)</span>
      </div>
      {messages.length === 0 ? (
        <p className="text-center text-zinc-600 text-sm py-8">No messages sent</p>
      ) : (
        <ul>
          {messages.map((m, i) => (
            <li
              key={m.id}
              className={`px-5 py-3 space-y-1 ${i < messages.length - 1 ? 'border-b border-zinc-800/50' : ''}`}
            >
              <div className="flex items-center justify-between gap-3">
                {m.recipient_username && (
                  <button
                    onClick={() => toggleThread(m.conversation_id)}
                    className="text-xs text-orange-400 hover:text-orange-300 transition-colors underline decoration-orange-400/30 underline-offset-2 hover:decoration-orange-400 flex-shrink-0"
                    title="View last 10 messages in this conversation"
                  >
                    → @{m.recipient_username}
                  </button>
                )}
                <p className="text-zinc-600 text-xs flex-shrink-0 ml-auto">{formatTimeAgo(m.created_at)}</p>
              </div>
              <p className="text-zinc-300 text-sm leading-relaxed">{m.content}</p>

              {/* Expandable thread */}
              {expandedThread === m.conversation_id && (
                <div className="mt-2 pt-2 border-t border-zinc-800">
                  <p className="text-zinc-500 text-xs font-medium mb-2">Last 10 messages in this conversation</p>
                  {threadPending ? (
                    <p className="text-zinc-600 text-xs">Loading thread…</p>
                  ) : threadMessages.length === 0 ? (
                    <p className="text-zinc-600 text-xs">No messages found.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {threadMessages.map((tm) => (
                        <div
                          key={tm.id}
                          className={`text-xs leading-relaxed rounded-lg p-2 ${
                            tm.id === m.id
                              ? 'bg-orange-500/10 border border-orange-500/20'
                              : 'bg-zinc-800/50'
                          }`}
                        >
                          <Link
                            href={`/admin/users/${tm.sender_id}`}
                            className={`font-semibold hover:underline ${tm.sender_id === userId ? 'text-orange-400' : 'text-blue-400'}`}
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
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
