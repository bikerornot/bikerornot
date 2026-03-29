'use client'

import { useState, useEffect } from 'react'
import { shareEventToGroup } from '@/app/actions/events'

interface GroupOption {
  id: string
  name: string
}

interface Props {
  eventId: string
  currentUserId: string
}

export default function ShareToGroupButton({ eventId, currentUserId }: Props) {
  const [open, setOpen] = useState(false)
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [loading, setLoading] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shared, setShared] = useState<Set<string>>(new Set())

  async function openModal() {
    setOpen(true)
    if (groups.length > 0) return
    setLoading(true)
    try {
      const res = await fetch('/api/heartbeat') // dummy — we'll fetch groups via import
      // Fetch user's groups client-side via the Supabase client
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data } = await supabase
        .from('group_members')
        .select('group_id, group:groups!group_id(id, name)')
        .eq('user_id', currentUserId)
        .eq('status', 'active')

      const userGroups = (data ?? [])
        .map((m: any) => m.group)
        .filter(Boolean)
        .sort((a: any, b: any) => a.name.localeCompare(b.name))
      setGroups(userGroups)
    } finally {
      setLoading(false)
    }
  }

  async function handleShare(groupId: string) {
    setSharing(true)
    try {
      await shareEventToGroup(eventId, groupId)
      setShared((prev) => new Set(prev).add(groupId))
    } catch {
      // best effort
    } finally {
      setSharing(false)
    }
  }

  return (
    <>
      <button
        onClick={openModal}
        className="text-sm font-medium text-zinc-400 hover:text-white transition-colors"
      >
        Share to Group
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="fixed inset-0 bg-black/60" />
          <div
            className="relative bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm max-h-[70vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <h3 className="text-white font-semibold text-base">Share to Group</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Group list */}
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {loading ? (
                <p className="text-zinc-500 text-sm py-4 text-center">Loading...</p>
              ) : groups.length === 0 ? (
                <p className="text-zinc-500 text-sm py-4 text-center">You're not in any groups</p>
              ) : (
                groups.map((g) => {
                  const isShared = shared.has(g.id)
                  return (
                    <div
                      key={g.id}
                      className="flex items-center justify-between py-2.5 border-b border-zinc-800 last:border-0"
                    >
                      <span className="text-sm text-white truncate flex-1 mr-3">{g.name}</span>
                      <button
                        onClick={() => !isShared && handleShare(g.id)}
                        disabled={sharing || isShared}
                        className={`text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors flex-shrink-0 ${
                          isShared
                            ? 'bg-emerald-500/20 text-emerald-400 cursor-default'
                            : 'bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-40'
                        }`}
                      >
                        {isShared ? 'Shared' : 'Share'}
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
