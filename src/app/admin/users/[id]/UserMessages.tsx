'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { getConversationThread, type AdminThreadMessage } from '@/app/actions/admin'
import { scanConversation, type ConversationScanResult } from '@/app/actions/scam-scan'

interface ConversationSummary {
  conversation_id: string
  recipient_username: string | null
  message_count: number
  last_at: string
  last_preview: string
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

function scoreColor(score: number): string {
  return score >= 0.85
    ? 'bg-red-500/20 text-red-400 border-red-500/30'
    : score >= 0.5
      ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
      : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
}

export default function UserMessages({
  messages,
  messageCount,
  userId,
}: {
  messages: ConversationSummary[]
  messageCount: number
  userId: string
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [threadByConv, setThreadByConv] = useState<Record<string, AdminThreadMessage[]>>({})
  const [threadPendingId, setThreadPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [scanResults, setScanResults] = useState<Record<string, ConversationScanResult>>({})
  const [scanningId, setScanningId] = useState<string | null>(null)
  const [scanningAll, setScanningAll] = useState(false)
  const [scanAllProgress, setScanAllProgress] = useState('')

  async function handleScan(conversationId: string) {
    setScanningId(conversationId)
    try {
      const result = await scanConversation(conversationId)
      setScanResults((prev) => ({ ...prev, [conversationId]: result }))
    } catch (err) {
      console.error('Scan error:', err)
    } finally {
      setScanningId(null)
    }
  }

  async function handleScanAll() {
    setScanningAll(true)
    for (let i = 0; i < messages.length; i++) {
      const convoId = messages[i].conversation_id
      if (scanResults[convoId]) continue
      setScanAllProgress(`Scanning ${i + 1} of ${messages.length}…`)
      try {
        const result = await scanConversation(convoId)
        setScanResults((prev) => ({ ...prev, [convoId]: result }))
      } catch {
        // continue
      }
    }
    setScanAllProgress('')
    setScanningAll(false)
  }

  function toggleThread(conversationId: string) {
    if (expandedId === conversationId) {
      setExpandedId(null)
      return
    }
    setExpandedId(conversationId)
    if (threadByConv[conversationId]) return
    setThreadPendingId(conversationId)
    startTransition(async () => {
      const thread = await getConversationThread(conversationId, 50)
      setThreadByConv((prev) => ({ ...prev, [conversationId]: thread }))
      setThreadPendingId(null)
    })
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between gap-2">
        <h2 className="text-white font-semibold text-sm">Conversations</h2>
        <div className="flex items-center gap-3">
          {scanningAll && <span className="text-zinc-500 text-xs">{scanAllProgress}</span>}
          {messages.length > 0 && (
            <button
              onClick={handleScanAll}
              disabled={scanningAll}
              className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
            >
              {scanningAll ? 'Scanning…' : 'AI Scan All'}
            </button>
          )}
          <span className="text-zinc-600 text-xs">{messages.length} convos · {messageCount} sent</span>
        </div>
      </div>

      {messages.length === 0 ? (
        <p className="text-center text-zinc-600 text-sm py-8">No messages sent</p>
      ) : (
        <ul>
          {messages.map((convo, i) => {
            const isExpanded = expandedId === convo.conversation_id
            const scan = scanResults[convo.conversation_id]
            const thread = threadByConv[convo.conversation_id]
            return (
              <li
                key={convo.conversation_id}
                className={`${i < messages.length - 1 ? 'border-b border-zinc-800/50' : ''}`}
              >
                {/* Collapsed row — chat-list summary */}
                <div className="px-5 py-3 flex items-start gap-3">
                  <button
                    onClick={() => toggleThread(convo.conversation_id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-orange-400 hover:text-orange-300 font-medium text-sm">
                        → @{convo.recipient_username ?? 'unknown'}
                      </span>
                      <span className="text-zinc-500 text-xs">
                        {convo.message_count} sent · {formatTimeAgo(convo.last_at)}
                      </span>
                      {scan && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded border ${scoreColor(scan.score)}`}>
                          {Math.round(scan.score * 100)}%
                        </span>
                      )}
                      <svg
                        className={`w-3 h-3 ml-auto text-zinc-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    <p className="text-zinc-300 text-sm mt-1 line-clamp-1">{convo.last_preview}</p>
                  </button>

                  {!scan && (
                    <button
                      onClick={() => handleScan(convo.conversation_id)}
                      disabled={scanningId === convo.conversation_id || scanningAll}
                      className="flex-shrink-0 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50 mt-0.5"
                      title="Run AI scam scan on just this conversation"
                    >
                      {scanningId === convo.conversation_id ? '…' : 'Scan'}
                    </button>
                  )}
                </div>

                {/* Expanded thread */}
                {isExpanded && (
                  <div className="px-5 pb-3 pt-0">
                    {scan && (
                      <div className="mb-3 bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded border ${scoreColor(scan.score)}`}>
                            {Math.round(scan.score * 100)}%
                          </span>
                          <span className="text-xs text-zinc-400">Conversation Scan</span>
                        </div>
                        <p className="text-sm text-zinc-300">{scan.summary}</p>
                        {scan.patterns.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {scan.patterns.map((p, idx) => (
                              <span key={idx} className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">
                                {p}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <p className="text-zinc-500 text-xs font-medium mb-2">Last 50 messages</p>
                    {threadPendingId === convo.conversation_id && !thread ? (
                      <p className="text-zinc-600 text-xs">Loading thread…</p>
                    ) : !thread || thread.length === 0 ? (
                      <p className="text-zinc-600 text-xs">No messages found.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {thread.map((tm) => {
                          const isSuspicious = scan?.suspiciousMessageIds.includes(tm.id)
                          const fromUser = tm.sender_id === userId
                          return (
                            <div
                              key={tm.id}
                              className={`text-xs leading-relaxed rounded-lg p-2 ${
                                isSuspicious
                                  ? 'bg-red-500/10 border border-red-500/30'
                                  : fromUser
                                    ? 'bg-orange-500/10 border border-orange-500/20'
                                    : 'bg-zinc-800/50'
                              }`}
                            >
                              <Link
                                href={`/admin/users/${tm.sender_id}`}
                                className={`font-semibold hover:underline ${fromUser ? 'text-orange-400' : 'text-blue-400'}`}
                              >
                                {tm.sender_name}
                                {tm.sender_username && (
                                  <span className="text-zinc-500 font-normal ml-1">@{tm.sender_username}</span>
                                )}
                              </Link>
                              <span className="text-zinc-600 ml-2">{formatTimestamp(tm.created_at)}</span>
                              <p className="text-zinc-300 mt-0.5 break-words whitespace-pre-wrap">{tm.content}</p>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
