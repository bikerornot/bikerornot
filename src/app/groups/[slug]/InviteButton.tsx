'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Profile } from '@/lib/supabase/types'
import { getFriendsNotInGroup, inviteFriendsToGroup } from '@/app/actions/groups'
import { getImageUrl } from '@/lib/supabase/image'

interface Props {
  groupId: string
}

export default function InviteButton({ groupId }: Props) {
  const [open, setOpen] = useState(false)
  const [friends, setFriends] = useState<Profile[]>([])
  const [filtered, setFiltered] = useState<Profile[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function openModal() {
    setOpen(true)
    setSent(false)
    setSelected(new Set())
    setSearch('')
    setLoading(true)
    try {
      const data = await getFriendsNotInGroup(groupId)
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
          (f.username ?? '').toLowerCase().includes(q) ||
          f.first_name.toLowerCase().includes(q) ||
          (f.last_name ?? '').toLowerCase().includes(q)
      )
    )
  }, [search, friends])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSend() {
    if (selected.size === 0 || sending) return
    setSending(true)
    try {
      await inviteFriendsToGroup(groupId, Array.from(selected))
      setSent(true)
      setSelected(new Set())
      // Remove invited friends from the list
      setFriends((prev) => prev.filter((f) => !selected.has(f.id)))
    } catch (err) {
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        onClick={openModal}
        className="text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 px-3 py-1.5 rounded-full font-medium transition-colors"
      >
        Invite Friends
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setOpen(false)}
          />

          {/* Modal */}
          <div className="relative w-full sm:max-w-md bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
              <h2 className="text-white font-semibold">Invite Friends</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-zinc-500 hover:text-white transition-colors text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* Search */}
            <div className="px-4 py-3 border-b border-zinc-800 flex-shrink-0">
              <input
                type="text"
                placeholder="Search friends…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>

            {/* Friend list */}
            <div className="flex-1 overflow-y-auto">
              {loading && (
                <p className="text-zinc-500 text-sm text-center py-8">Loading…</p>
              )}

              {!loading && friends.length === 0 && (
                <p className="text-zinc-500 text-sm text-center py-8">
                  All your friends are already in this group.
                </p>
              )}

              {!loading && friends.length > 0 && filtered.length === 0 && (
                <p className="text-zinc-500 text-sm text-center py-8">No friends match that search.</p>
              )}

              {sent && (
                <div className="mx-4 mt-3 bg-green-500/10 border border-green-500/30 text-green-400 text-sm px-4 py-2.5 rounded-xl">
                  Invites sent!
                </div>
              )}

              <div className="divide-y divide-zinc-800">
                {filtered.map((friend) => {
                  const avatarUrl = friend.profile_photo_url
                    ? getImageUrl('avatars', friend.profile_photo_url)
                    : null
                  const isSelected = selected.has(friend.id)

                  return (
                    <button
                      key={friend.id}
                      onClick={() => toggle(friend.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 transition-colors text-left ${
                        isSelected ? 'bg-zinc-800/60' : ''
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
                        {avatarUrl ? (
                          <Image
                            src={avatarUrl}
                            alt={friend.username ?? ''}
                            width={40}
                            height={40}
                            className="object-cover w-full h-full"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-bold text-zinc-400">
                            {(friend.first_name?.[0] ?? '?').toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium text-sm">@{friend.username}</p>
                        {(friend.city || friend.state) && (
                          <p className="text-zinc-500 text-xs">
                            {[friend.city, friend.state].filter(Boolean).join(', ')}
                          </p>
                        )}
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-orange-500 border-orange-500'
                            : 'border-zinc-600'
                        }`}
                      >
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 6l3 3 5-5" />
                          </svg>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-zinc-800 flex-shrink-0">
              <button
                onClick={handleSend}
                disabled={selected.size === 0 || sending}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
              >
                {sending
                  ? 'Sending…'
                  : selected.size > 0
                  ? `Send ${selected.size} Invite${selected.size !== 1 ? 's' : ''}`
                  : 'Select friends to invite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
