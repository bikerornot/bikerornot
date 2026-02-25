'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Group } from '@/lib/supabase/types'
import { joinGroup, leaveGroup } from '@/app/actions/groups'
import { getImageUrl } from '@/lib/supabase/image'

interface Props {
  initialGroups: Group[]
  currentUserId: string
}

export default function GroupsClient({ initialGroups, currentUserId }: Props) {
  const [groups, setGroups] = useState<Group[]>(initialGroups)
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState<Set<string>>(new Set())

  const filtered = groups.filter(
    (g) =>
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      (g.description ?? '').toLowerCase().includes(search.toLowerCase())
  )

  async function handleJoin(groupId: string, privacy: 'public' | 'private') {
    if (pending.has(groupId)) return
    setPending((p) => new Set(p).add(groupId))
    try {
      await joinGroup(groupId)
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? {
                ...g,
                is_member: true,
                member_status: privacy === 'public' ? 'active' : 'pending',
                member_role: 'member',
                member_count: privacy === 'public' ? (g.member_count ?? 0) + 1 : g.member_count,
              }
            : g
        )
      )
    } catch (err) {
      console.error(err)
    } finally {
      setPending((p) => {
        const next = new Set(p)
        next.delete(groupId)
        return next
      })
    }
  }

  async function handleLeave(groupId: string) {
    if (pending.has(groupId)) return
    setPending((p) => new Set(p).add(groupId))
    try {
      await leaveGroup(groupId)
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? {
                ...g,
                is_member: false,
                member_status: null,
                member_role: null,
                member_count: Math.max(0, (g.member_count ?? 1) - 1),
              }
            : g
        )
      )
    } catch (err) {
      console.error(err)
    } finally {
      setPending((p) => {
        const next = new Set(p)
        next.delete(groupId)
        return next
      })
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Groups</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Find and join rider groups</p>
        </div>
        <Link
          href="/groups/new"
          className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          + Create Group
        </Link>
      </div>

      <div className="mb-5">
        <input
          type="text"
          placeholder="Search groups…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
        />
      </div>

      {filtered.length === 0 && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-10 text-center">
          <p className="text-zinc-400 text-sm">No groups found.</p>
          {search && (
            <p className="text-zinc-600 text-xs mt-1">Try a different search term.</p>
          )}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((group) => {
          const coverUrl = group.cover_photo_url
            ? getImageUrl('covers', group.cover_photo_url)
            : null
          const isLoading = pending.has(group.id)
          const isAdmin = group.member_role === 'admin'
          const isActiveMember = group.member_status === 'active'
          const isPending = group.member_status === 'pending'

          return (
            <div
              key={group.id}
              className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden"
            >
              {/* Cover */}
              <Link href={`/groups/${group.slug}`} className="block">
                <div className="h-24 bg-zinc-800 relative overflow-hidden">
                  {coverUrl ? (
                    <Image src={coverUrl} alt={group.name} fill className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-4xl">🏍</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                </div>
              </Link>

              <div className="p-4">
                <Link href={`/groups/${group.slug}`} className="hover:text-orange-400 transition-colors">
                  <h3 className="text-white font-semibold">{group.name}</h3>
                </Link>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-zinc-500">
                    {group.privacy === 'private' ? '🔒 Private' : '🌐 Public'}
                  </span>
                  <span className="text-zinc-700">·</span>
                  <span className="text-xs text-zinc-500">
                    {group.member_count ?? 0} member{group.member_count !== 1 ? 's' : ''}
                  </span>
                </div>
                {group.description && (
                  <p className="text-zinc-400 text-sm mt-1.5 line-clamp-2">{group.description}</p>
                )}
                <div className="mt-3">
                  {isAdmin ? (
                    <span className="text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2.5 py-1 rounded-full font-medium">
                      Admin
                    </span>
                  ) : isActiveMember ? (
                    <button
                      onClick={() => handleLeave(group.id)}
                      disabled={isLoading}
                      className="text-xs bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 text-zinc-300 border border-zinc-700 px-3 py-1.5 rounded-full font-medium transition-colors disabled:opacity-40"
                    >
                      {isLoading ? '…' : 'Leave'}
                    </button>
                  ) : isPending ? (
                    <button
                      onClick={() => handleLeave(group.id)}
                      disabled={isLoading}
                      className="text-xs bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 text-zinc-400 border border-zinc-700 px-3 py-1.5 rounded-full font-medium transition-colors disabled:opacity-40"
                    >
                      {isLoading ? '…' : 'Pending'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleJoin(group.id, group.privacy)}
                      disabled={isLoading}
                      className="text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-full font-medium transition-colors disabled:opacity-40"
                    >
                      {isLoading ? '…' : group.privacy === 'private' ? 'Request' : 'Join'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
