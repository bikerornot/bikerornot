'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { getImageUrl } from '@/lib/supabase/image'
import { sendMessage, markConversationRead, getMessages } from '@/app/actions/messages'
import type { Message, Profile } from '@/lib/supabase/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatDateDivider(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

interface Props {
  conversationId: string
  initialMessages: Message[]
  initialHasMore: boolean
  currentUserId: string
  otherUser: Profile
  composeDisabledReason?: string | null
}

export default function ChatWindow({ conversationId, initialMessages, initialHasMore, currentUserId, otherUser, composeDisabledReason }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loadingMore, setLoadingMore] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [otherUserTyping, setOtherUserTyping] = useState(false)
  // Bumping this forces a resubscribe. Used when the channel reports a
  // terminal status (ERROR/TIMED_OUT/CLOSED) or when the tab comes back
  // from the background — Supabase's free-tier realtime can silently stop
  // delivering events after idle periods even though the websocket stays
  // open, which looks to the user like "typing stopped, then messages
  // stopped" without a refresh.
  const [rtGen, setRtGen] = useState(0)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const initialScrollDone = useRef(false)
  const isNearBottom = useRef(true)

  // Track whether user is near the bottom of the scroll
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100
  }, [])

  // Scroll to bottom instantly on initial load
  useEffect(() => {
    if (!initialScrollDone.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
      initialScrollDone.current = true
    }
  }, [messages])

  // Smooth scroll to bottom for new messages (only if already near bottom)
  const scrollToBottomSmooth = useCallback(() => {
    if (isNearBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [])

  // Mark conversation as read on mount and when new messages arrive
  useEffect(() => {
    markConversationRead(conversationId)
  }, [conversationId, messages.length])

  // Auto-grow textarea — runs on value change instead of inside onChange
  // to avoid triggering layout recalculations that can fire additional
  // change events and cause an infinite loop (React error #185) on iOS Safari.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  // Scroll when new messages arrive or typing indicator changes
  useEffect(() => {
    if (initialScrollDone.current) {
      scrollToBottomSmooth()
    }
  }, [messages, otherUserTyping, scrollToBottomSmooth])

  // Load older messages when scrolling to top
  const loadOlderMessages = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return
    setLoadingMore(true)

    const oldestMessage = messages[0]
    const el = scrollContainerRef.current
    const prevScrollHeight = el?.scrollHeight ?? 0

    try {
      const { messages: older, hasMore: moreAvail } = await getMessages(conversationId, oldestMessage.created_at)
      if (older.length > 0) {
        setMessages((prev) => [...older, ...prev])
        // Preserve scroll position after prepending
        requestAnimationFrame(() => {
          if (el) {
            el.scrollTop = el.scrollHeight - prevScrollHeight
          }
        })
      }
      setHasMore(moreAvail)
    } finally {
      setLoadingMore(false)
    }
  }, [conversationId, hasMore, loadingMore, messages])

  // Detect scroll to top
  const handleScrollWithLoadMore = useCallback(() => {
    handleScroll()
    const el = scrollContainerRef.current
    if (el && el.scrollTop < 50 && hasMore && !loadingMore) {
      loadOlderMessages()
    }
  }, [handleScroll, hasMore, loadingMore, loadOlderMessages])

  // Single channel for: incoming messages, read receipt updates, and presence (typing).
  // Auth is pushed to Realtime explicitly *before* subscribe — the factory's
  // async getSession().then(setAuth) can lose the race against the first
  // subscription, leaving the channel joined anonymously and RLS-filtered
  // silently. Symptom when that happens: looks like it works once (on some
  // race win) then stops. Awaiting getSession()+setAuth here guarantees the
  // subscription always carries the user's JWT.
  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      await supabase.realtime.setAuth(session?.access_token ?? null)
      if (cancelled) return

      channel = supabase
        .channel(`chat_${conversationId}`, {
          config: { presence: { key: currentUserId } },
        })
        // New messages from the other user
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
          (payload) => {
            const msg = payload.new as Message
            // Only show messages from the other user if they're still active
            if (msg.sender_id !== currentUserId && otherUser.status === 'active') {
              setMessages((prev) => [...prev, { ...msg, sender: otherUser }])
            }
          }
        )
        // Read receipt: other user opened the conversation, read_at gets set on our messages
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
          (payload) => {
            const updated = payload.new as Message
            setMessages((prev) =>
              prev.map((m) => (m.id === updated.id ? { ...m, read_at: updated.read_at } : m))
            )
          }
        )
        // Typing indicator via Presence (no DB writes)
        .on('presence', { event: 'sync' }, () => {
          if (!channel) return
          const state = channel.presenceState<{ typing: boolean }>()
          const otherPresence = Object.entries(state)
            .filter(([key]) => key !== currentUserId)
            .flatMap(([, values]) => values)
          setOtherUserTyping(otherPresence.some((p) => p.typing === true))
        })
        .subscribe((status) => {
          if (cancelled) return
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn('[chat] realtime channel status', status, '— reconnecting')
            // Bump the generation counter so the useEffect tears down this
            // dead channel and creates a fresh one. 2s delay avoids a tight
            // loop if the server is genuinely down.
            reconnectTimer = setTimeout(() => setRtGen((g) => g + 1), 2000)
          }
        })

      channelRef.current = channel
    })()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      if (channel) supabase.removeChannel(channel)
    }
  }, [conversationId, currentUserId, otherUser, rtGen])

  // Supabase free-tier realtime can stop delivering events while a tab is
  // backgrounded without closing the socket. When the tab becomes visible
  // again, force a fresh subscription so the user's next conversation view
  // is live rather than frozen.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setRtGen((g) => g + 1)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  function broadcastTyping(isTyping: boolean) {
    channelRef.current?.track({ typing: isTyping })
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value)
    // Auto-resize happens in a useEffect keyed on `text` (below) — mutating
    // the input's style inline here triggered React error #185 on iOS Safari
    // when the layout recalc fired additional change events mid-keystroke.
    broadcastTyping(true)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => broadcastTyping(false), 2000)
  }

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    broadcastTyping(false)

    setSending(true)
    setText('')
    // Reset textarea height back to one row after send
    if (inputRef.current) inputRef.current.style.height = 'auto'

    // Force scroll to bottom when sending
    isNearBottom.current = true

    const optimistic: Message = {
      id: `optimistic-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: currentUserId,
      content: trimmed,
      read_at: null,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimistic])

    try {
      const saved = await sendMessage(conversationId, trimmed)
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? saved : m)))
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      setText(trimmed)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Index of the last message I sent that the other user has read
  const lastReadSentIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.sender_id === currentUserId && !m.id.startsWith('optimistic-') && m.read_at !== null) {
        return i
      }
    }
    return -1
  })()

  const otherAvatarUrl = otherUser.profile_photo_url
    ? getImageUrl('avatars', otherUser.profile_photo_url)
    : null
  const otherInitial = (otherUser.username?.[0] ?? '?').toUpperCase()

  let lastDate = ''

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScrollWithLoadMore}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
      >
        {/* Load more indicator */}
        {hasMore && (
          <div className="text-center py-3">
            {loadingMore ? (
              <span className="text-zinc-500 text-sm">Loading older messages...</span>
            ) : (
              <button
                onClick={loadOlderMessages}
                className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
              >
                Load older messages
              </button>
            )}
          </div>
        )}

        {messages.length === 0 && !otherUserTyping && (
          <p className="text-center text-zinc-600 text-base py-8">
            Say hello to @{otherUser.username}
          </p>
        )}

        {messages.map((msg, index) => {
          const isMe = msg.sender_id === currentUserId
          const dateKey = new Date(msg.created_at).toDateString()
          const showDivider = dateKey !== lastDate
          lastDate = dateKey
          const showSeen = isMe && index === lastReadSentIndex

          return (
            <div key={msg.id}>
              {showDivider && (
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-zinc-800" />
                  <span className="text-sm text-zinc-600">{formatDateDivider(msg.created_at)}</span>
                  <div className="flex-1 h-px bg-zinc-800" />
                </div>
              )}

              <div className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                {!isMe && (
                  <div className="w-7 h-7 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0 mb-0.5">
                    {otherAvatarUrl ? (
                      <Image src={otherAvatarUrl} alt={otherInitial} width={28} height={28} className="object-cover w-full h-full" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm font-bold text-zinc-300">
                        {otherInitial}
                      </div>
                    )}
                  </div>
                )}

                <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[75%]`}>
                  <div
                    className={`px-3 py-2 rounded-2xl text-base leading-relaxed break-words whitespace-pre-wrap ${
                      isMe
                        ? 'bg-orange-600 text-white rounded-br-sm'
                        : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                    } ${msg.id.startsWith('optimistic-') ? 'opacity-60' : ''}`}
                  >
                    {msg.content}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 px-1">
                    <span className="text-sm text-zinc-600">{formatTime(msg.created_at)}</span>
                    {showSeen && (
                      <span className="text-sm text-zinc-500">· Seen</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {/* Typing indicator bubble */}
        {otherUserTyping && (
          <div className="flex items-end gap-2 pt-1">
            <div className="w-7 h-7 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
              {otherAvatarUrl ? (
                <Image src={otherAvatarUrl} alt={otherInitial} width={28} height={28} className="object-cover w-full h-full" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm font-bold text-zinc-300">
                  {otherInitial}
                </div>
              )}
            </div>
            <div className="bg-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '160ms' }} />
              <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '320ms' }} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      {composeDisabledReason ? (
        <div
          className="border-t border-zinc-800 bg-zinc-900 px-4 py-4 text-center"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <p className="text-sm text-zinc-500">{composeDisabledReason}</p>
        </div>
      ) : (
        <div
          className="border-t border-zinc-800 bg-zinc-900 px-4 py-3"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-end gap-3">
            <textarea
              ref={inputRef}
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              placeholder="Message..."
              rows={1}
              className="flex-1 bg-zinc-800 text-white placeholder-zinc-500 text-base rounded-xl px-4 py-2.5 resize-none outline-none focus:ring-1 focus:ring-orange-500 max-h-32 overflow-y-auto"
              style={{ scrollbarWidth: 'none' }}
            />
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending}
              className="bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-4 py-2.5 text-base font-semibold transition-colors flex-shrink-0"
            >
              Send
            </button>
          </div>
          <p className="text-sm text-zinc-600 mt-1.5 text-right">Enter to send · Shift+Enter for newline</p>
        </div>
      )}
    </div>
  )
}
