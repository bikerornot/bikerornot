'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { getFriendsNotInvitedToEvent, inviteFriendsToEvent, type InvitableFriend } from '@/app/actions/events'
import { getImageUrl } from '@/lib/supabase/image'

interface Props {
  eventId: string
}

export default function InviteToEventButton({ eventId }: Props) {
  const [open, setOpen] = useState(false)
  const [friends, setFriends] = useState<InvitableFriend[]>([])
  const [filtered, setFiltered] = useState<InvitableFriend[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<{ sent: number; skipped: number } | null>(null)

  async function openModal() {
    setOpen(true)
    setFeedback(null)
    setSelected(new Set())
    setSearch('')
    setLoading(true)
    try {
      const data = await getFriendsNotInvitedToEvent(eventId)
      setFriends(data)
      setFiltered(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(
      friends.filter(
        (f) =>
          f.username?.toLowerCase().includes(q) ||
          f.first_name?.toLowerCase().includes(q) ||
          f.last_name?.toLowerCase().includes(q)
      )
    )
  }, [search, friends])

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function selectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((f) => f.id)))
    }
  }

  async function handleSend() {
    if (selected.size === 0) return
    setSending(true)
    try {
      const result = await inviteFriendsToEvent(eventId, Array.from(selected))
      setFeedback(result)
      // Remove invited friends from list
      setFriends((prev) => prev.filter((f) => !selected.has(f.id)))
      setSelected(new Set())
    } catch (err: unknown) {
      console.error('Event invite error:', err)
      setFeedback({ sent: 0, skipped: 0 })
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        onClick={openModal}
        className="text-sm font-medium text-orange-400 hover:text-orange-300 transition-colors"
      >
        Invite Friends
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="fixed inset-0 bg-black/60" />
          <div
            className="relative bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <h3 className="text-white font-semibold text-base">Invite Friends</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search */}
            <div className="px-4 py-2 border-b border-zinc-800">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search friends..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>

            {/* Friend list */}
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {loading ? (
                <p className="text-zinc-500 text-sm py-4 text-center">Loading...</p>
              ) : filtered.length === 0 ? (
                <p className="text-zinc-500 text-sm py-4 text-center">
                  {friends.length === 0 ? 'All friends have been invited' : 'No matches'}
                </p>
              ) : (
                <>
                  {filtered.length > 1 && (
                    <button
                      onClick={selectAll}
                      className="text-sm text-orange-400 hover:text-orange-300 mb-2 transition-colors"
                    >
                      {selected.size === filtered.length ? 'Deselect all' : 'Select all'}
                    </button>
                  )}
                  {filtered.map((f) => {
                    const avatarUrl = f.profile_photo_url ? getImageUrl('avatars', f.profile_photo_url) : null
                    const isSelected = selected.has(f.id)
                    return (
                      <button
                        key={f.id}
                        onClick={() => toggle(f.id)}
                        className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors ${
                          isSelected ? 'bg-orange-500/10' : 'hover:bg-zinc-800'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'bg-orange-500 border-orange-500' : 'border-zinc-600'
                        }`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <div className="w-8 h-8 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
                          {avatarUrl ? (
                            <Image src={avatarUrl} alt="" width={32} height={32} className="object-cover w-full h-full" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm font-bold">
                              {f.username?.[0]?.toUpperCase() ?? '?'}
                            </div>
                          )}
                        </div>
                        <span className="text-sm text-white truncate flex-1">@{f.username ?? 'unknown'}</span>
                        {f.distance_miles != null && (
                          <span className="text-sm text-zinc-500 flex-shrink-0">{f.distance_miles < 1 ? '< 1 mi' : `${f.distance_miles} mi`}</span>
                        )}
                      </button>
                    )
                  })}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-zinc-800">
              {feedback ? (
                <p className="text-sm text-center text-emerald-400">
                  {feedback.sent} invite{feedback.sent !== 1 ? 's' : ''} sent
                  {feedback.skipped > 0 && `, ${feedback.skipped} skipped`}
                </p>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={selected.size === 0 || sending}
                  className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
                >
                  {sending ? 'Sending...' : `Invite ${selected.size > 0 ? `(${selected.size})` : ''}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
