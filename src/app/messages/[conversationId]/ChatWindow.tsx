'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { getImageUrl } from '@/lib/supabase/image'
import { sendMessage, markConversationRead } from '@/app/actions/messages'
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
  currentUserId: string
  otherUser: Profile
}

export default function ChatWindow({ conversationId, initialMessages, currentUserId, otherUser }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [otherUserTyping, setOtherUserTyping] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  // Mark conversation as read on mount and when new messages arrive
  useEffect(() => {
    markConversationRead(conversationId)
  }, [conversationId, messages.length])

  // Scroll to bottom when messages or typing indicator changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, otherUserTyping])

  // Single channel for: incoming messages, read receipt updates, and presence (typing)
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`chat_${conversationId}`, {
        config: { presence: { key: currentUserId } },
      })
      // New messages from the other user
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const msg = payload.new as Message
          if (msg.sender_id !== currentUserId) {
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
        const state = channel.presenceState<{ typing: boolean }>()
        const otherPresence = Object.entries(state)
          .filter(([key]) => key !== currentUserId)
          .flatMap(([, values]) => values)
        setOtherUserTyping(otherPresence.some((p) => p.typing === true))
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      supabase.removeChannel(channel)
    }
  }, [conversationId, currentUserId, otherUser])

  function broadcastTyping(isTyping: boolean) {
    channelRef.current?.track({ typing: isTyping })
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value)
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
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.length === 0 && !otherUserTyping && (
          <p className="text-center text-zinc-600 text-sm py-8">
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
                  <span className="text-xs text-zinc-600">{formatDateDivider(msg.created_at)}</span>
                  <div className="flex-1 h-px bg-zinc-800" />
                </div>
              )}

              <div className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                {!isMe && (
                  <div className="w-7 h-7 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0 mb-0.5">
                    {otherAvatarUrl ? (
                      <Image src={otherAvatarUrl} alt={otherInitial} width={28} height={28} className="object-cover w-full h-full" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-zinc-300">
                        {otherInitial}
                      </div>
                    )}
                  </div>
                )}

                <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[75%]`}>
                  <div
                    className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
                      isMe
                        ? 'bg-orange-600 text-white rounded-br-sm'
                        : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                    } ${msg.id.startsWith('optimistic-') ? 'opacity-60' : ''}`}
                  >
                    {msg.content}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 px-1">
                    <span className="text-[10px] text-zinc-600">{formatTime(msg.created_at)}</span>
                    {showSeen && (
                      <span className="text-[10px] text-zinc-500">· Seen</span>
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
                <div className="w-full h-full flex items-center justify-center text-xs font-bold text-zinc-300">
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
      <div className="border-t border-zinc-800 bg-zinc-900 px-4 py-3">
        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="Message…"
            rows={1}
            className="flex-1 bg-zinc-800 text-white placeholder-zinc-500 text-sm rounded-xl px-4 py-2.5 resize-none outline-none focus:ring-1 focus:ring-orange-500 max-h-32 overflow-y-auto"
            style={{ scrollbarWidth: 'none' }}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors flex-shrink-0"
          >
            Send
          </button>
        </div>
        <p className="text-[10px] text-zinc-600 mt-1.5 text-right">Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  )
}
