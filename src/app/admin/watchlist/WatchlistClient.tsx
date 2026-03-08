'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { removeFromWatchlist, type WatchlistEntry } from '@/app/actions/admin'
import { getImageUrl } from '@/lib/supabase/image'

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function WatchlistClient({ initialEntries }: { initialEntries: WatchlistEntry[] }) {
  const [entries, setEntries] = useState(initialEntries)
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function handleRemove(userId: string) {
    if (!confirm('Remove this user from the watchlist?')) return
    setRemovingId(userId)
    try {
      await removeFromWatchlist(userId)
      setEntries((prev) => prev.filter((e) => e.user_id !== userId))
    } catch (err) {
      console.error(err)
    } finally {
      setRemovingId(null)
    }
  }

  if (entries.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
        <p className="text-zinc-500 text-sm">No users on the watchlist.</p>
        <p className="text-zinc-600 text-xs mt-1">
          Add users from their profile page in the admin panel.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const user = entry.user
        const activity = entry.activity
        const avatarUrl = user?.profile_photo_url
          ? getImageUrl('avatars', user.profile_photo_url)
          : null
        const isRemoving = removingId === entry.user_id

        return (
          <div
            key={entry.id}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-5"
          >
            {/* User info row */}
            <div className="flex items-start gap-3 mb-3">
              <Link href={`/admin/users/${entry.user_id}`} className="flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden">
                  {avatarUrl ? (
                    <Image src={avatarUrl} alt="" width={40} height={40} className="object-cover w-full h-full" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold">
                      {(user?.first_name?.[0] ?? '?').toUpperCase()}
                    </div>
                  )}
                </div>
              </Link>
              <div className="flex-1 min-w-0">
                <Link
                  href={`/admin/users/${entry.user_id}`}
                  className="text-white font-semibold text-sm hover:text-orange-400 transition-colors"
                >
                  {user?.first_name} {user?.last_name}
                  {user?.username && (
                    <span className="text-zinc-400 font-normal ml-1.5">@{user.username}</span>
                  )}
                </Link>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                    user?.status === 'banned' ? 'bg-red-500/20 text-red-400' :
                    user?.status === 'suspended' ? 'bg-orange-500/20 text-orange-400' :
                    'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {user?.status ?? 'unknown'}
                  </span>
                  <span className="text-zinc-600 text-xs">Added {formatDate(entry.created_at)}</span>
                </div>
              </div>
            </div>

            {/* Note */}
            {entry.note && (
              <div className="bg-zinc-800/60 rounded-lg px-3 py-2 mb-3">
                <p className="text-zinc-400 text-sm">{entry.note}</p>
              </div>
            )}

            {/* Activity stats */}
            {activity && (
              <div className="grid grid-cols-4 gap-2 mb-4">
                <div className="bg-zinc-800 rounded-lg px-3 py-2 text-center">
                  <p className="text-white font-bold text-lg">{activity.message_count}</p>
                  <p className="text-zinc-500 text-xs">Messages</p>
                </div>
                <div className="bg-zinc-800 rounded-lg px-3 py-2 text-center">
                  <p className="text-white font-bold text-lg">{activity.friend_requests_sent}</p>
                  <p className="text-zinc-500 text-xs">FR Sent</p>
                </div>
                <div className="bg-zinc-800 rounded-lg px-3 py-2 text-center">
                  <p className={`font-bold text-lg ${activity.content_flags > 0 ? 'text-orange-400' : 'text-white'}`}>
                    {activity.content_flags}
                  </p>
                  <p className="text-zinc-500 text-xs">AI Flags</p>
                </div>
                <div className="bg-zinc-800 rounded-lg px-3 py-2 text-center">
                  <p className={`font-bold text-lg ${activity.reports_against > 0 ? 'text-orange-400' : 'text-white'}`}>
                    {activity.reports_against}
                  </p>
                  <p className="text-zinc-500 text-xs">Reports</p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/admin/users/${entry.user_id}`}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
              >
                View Profile
              </Link>
              <Link
                href={`/admin/scammer/${entry.user_id}`}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-500/15 hover:bg-orange-500/25 text-orange-400 border border-orange-500/30 transition-colors"
              >
                Scammer Analysis
              </Link>
              <button
                onClick={() => handleRemove(entry.user_id)}
                disabled={isRemoving}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-500 border border-zinc-700 transition-colors disabled:opacity-50 ml-auto"
              >
                {isRemoving ? '...' : 'Remove'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
