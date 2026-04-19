'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { unblockUser, type BlockedProfile } from '@/app/actions/blocks'
import { getImageUrl } from '@/lib/supabase/image'

interface Props {
  initialBlocked: BlockedProfile[]
}

export default function BlockedUsersSection({ initialBlocked }: Props) {
  const [blocked, setBlocked] = useState<BlockedProfile[]>(initialBlocked)
  const [pendingId, setPendingId] = useState<string | null>(null)

  async function handleUnblock(profile: BlockedProfile) {
    if (pendingId) return
    setPendingId(profile.id)
    // Optimistic remove — restore on failure
    const prev = blocked
    setBlocked((b) => b.filter((p) => p.id !== profile.id))
    try {
      await unblockUser(profile.id)
    } catch {
      setBlocked(prev)
    } finally {
      setPendingId(null)
    }
  }

  if (blocked.length === 0) {
    return (
      <p className="text-zinc-500 text-base">
        You haven't blocked anyone.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-zinc-800">
      {blocked.map((p) => {
        const avatarUrl = p.profile_photo_url ? getImageUrl('avatars', p.profile_photo_url) : null
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ')
        return (
          <li key={p.id} className="flex items-center gap-3 py-3">
            <Link href={`/profile/${p.username}`} className="flex-shrink-0">
              <div className="w-12 h-12 rounded-full bg-zinc-800 overflow-hidden">
                {avatarUrl ? (
                  <Image src={avatarUrl} alt={p.username ?? ''} width={48} height={48} className="object-cover w-full h-full" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold">
                    {(p.first_name?.[0] ?? p.username?.[0] ?? '?').toUpperCase()}
                  </div>
                )}
              </div>
            </Link>
            <div className="flex-1 min-w-0">
              <Link
                href={`/profile/${p.username}`}
                className="block text-white font-semibold hover:underline truncate"
              >
                @{p.username ?? 'unknown'}
              </Link>
              {name && (
                <p className="text-zinc-400 text-sm truncate">{name}</p>
              )}
            </div>
            <button
              onClick={() => handleUnblock(p)}
              disabled={pendingId === p.id}
              className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors border border-zinc-700 flex-shrink-0"
            >
              {pendingId === p.id ? '…' : 'Unblock'}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
