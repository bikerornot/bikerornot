'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Group, GROUP_CATEGORIES, type GroupCategory } from '@/lib/supabase/types'
import { joinGroup, leaveGroup } from '@/app/actions/groups'
import { getImageUrl } from '@/lib/supabase/image'
import { haversine } from '@/lib/geo'

type SortBy = 'newest' | 'most_members' | 'near_me'

interface Props {
  initialGroups: Group[]
  currentUserId: string
  userLat: number | null
  userLng: number | null
}

export default function GroupsClient({ initialGroups, currentUserId, userLat, userLng }: Props) {
  const [groups, setGroups] = useState<Group[]>(initialGroups)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'my'>('all')
  const [categoryFilter, setCategoryFilter] = useState<GroupCategory | null>(null)
  const [sortBy, setSortBy] = useState<SortBy>('newest')
  const [pending, setPending] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    let result = groups

    // Text search
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          (g.description ?? '').toLowerCase().includes(q)
      )
    }

    // My Groups filter
    if (filter === 'my') {
      result = result.filter((g) => g.is_member)
    }

    // Category filter
    if (categoryFilter) {
      result = result.filter((g) => g.category === categoryFilter)
    }

    // Sort
    result = [...result]
    if (sortBy === 'most_members') {
      result.sort((a, b) => (b.member_count ?? 0) - (a.member_count ?? 0))
    } else if (sortBy === 'near_me' && userLat != null && userLng != null) {
      result.sort((a, b) => {
        const distA = a.latitude != null && a.longitude != null
          ? haversine(userLat, userLng, a.latitude, a.longitude)
          : Infinity
        const distB = b.latitude != null && b.longitude != null
          ? haversine(userLat, userLng, b.latitude, b.longitude)
          : Infinity
        return distA - distB
      })
    }
    // 'newest' is the default order from server

    return result
  }, [groups, search, filter, categoryFilter, sortBy, userLat, userLng])

  function getDistance(group: Group): number | null {
    if (sortBy !== 'near_me' || userLat == null || userLng == null) return null
    if (group.latitude == null || group.longitude == null) return null
    return Math.round(haversine(userLat, userLng, group.latitude, group.longitude))
  }

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

  function isRecentlyActive(lastPostAt: string | null): boolean {
    if (!lastPostAt) return false
    return Date.now() - new Date(lastPostAt).getTime() < 24 * 60 * 60 * 1000
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
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

      {/* My Groups / All Groups toggle */}
      <div className="flex gap-1 mb-6 bg-zinc-900 rounded-xl p-1 w-fit">
        {(['all', 'my'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-orange-500 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            {f === 'all' ? 'All Groups' : 'My Groups'}
          </button>
        ))}
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setCategoryFilter(null)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            categoryFilter === null
              ? 'bg-orange-500 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          All
        </button>
        {GROUP_CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => setCategoryFilter(categoryFilter === c.value ? null : c.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              categoryFilter === c.value
                ? 'bg-orange-500 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Search + Sort row */}
      <div className="flex gap-2 mb-5">
        <input
          type="text"
          placeholder="Search groups..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
        >
          <option value="newest">Newest</option>
          <option value="most_members">Most Members</option>
          {userLat != null && <option value="near_me">Near Me</option>}
        </select>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-10 text-center">
          <p className="text-zinc-400 text-sm">No groups found.</p>
          {(search || categoryFilter || filter === 'my') && (
            <p className="text-zinc-600 text-xs mt-1">Try adjusting your filters.</p>
          )}
        </div>
      )}

      {/* Group cards */}
      <div className="space-y-6">
        {filtered.map((group) => {
          const coverUrl = group.cover_photo_url
            ? getImageUrl('covers', group.cover_photo_url)
            : null
          const isLoading = pending.has(group.id)
          const isAdmin = group.member_role === 'admin'
          const isActiveMember = group.member_status === 'active'
          const isPending = group.member_status === 'pending'
          const distance = getDistance(group)
          const categoryLabel = group.category
            ? GROUP_CATEGORIES.find((c) => c.value === group.category)?.label
            : null
          const locationStr = [group.city, group.state].filter(Boolean).join(', ')

          return (
            <div
              key={group.id}
              className="bg-zinc-900 rounded-xl border border-zinc-800 border-l-orange-500/40 border-l-2 overflow-hidden"
            >
              {/* Cover — only shown when group has a cover photo */}
              {coverUrl && (
                <Link href={`/groups/${group.slug}`} className="block">
                  <div className="h-44 relative overflow-hidden">
                    <Image src={coverUrl} alt={group.name} fill className="object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  </div>
                </Link>
              )}

              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/groups/${group.slug}`} className="hover:text-orange-400 transition-colors">
                    <h3 className="text-white font-semibold">{group.name}</h3>
                  </Link>
                  {isRecentlyActive(group.last_post_at) && (
                    <span className="shrink-0 w-2 h-2 rounded-full bg-green-500 mt-2" title="Active in last 24h" />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  <span className="text-xs text-zinc-500">
                    {group.privacy === 'private' ? '🔒 Private' : '🌐 Public'}
                  </span>
                  {(group.member_count ?? 0) >= 10 && (
                    <>
                      <span className="text-zinc-700">·</span>
                      <span className="text-xs text-zinc-500">
                        {group.member_count} member{group.member_count !== 1 ? 's' : ''}
                      </span>
                    </>
                  )}
                  {categoryLabel && (
                    <>
                      <span className="text-zinc-700">·</span>
                      <span className="text-xs bg-orange-500/15 text-orange-400 px-1.5 py-0.5 rounded-full">
                        {categoryLabel}
                      </span>
                    </>
                  )}
                </div>
                {(locationStr || distance != null) && (
                  <div className="flex items-center gap-2 mt-1">
                    {locationStr && (
                      <span className="text-xs text-zinc-500">{locationStr}</span>
                    )}
                    {distance != null && (
                      <>
                        {locationStr && <span className="text-zinc-700">·</span>}
                        <span className="text-xs text-zinc-400">{distance} mi</span>
                      </>
                    )}
                  </div>
                )}
                {group.description && (
                  <p className="text-zinc-400 text-sm mt-1.5 line-clamp-2">{group.description}</p>
                )}
                <div className="mt-3">
                  {isActiveMember || isAdmin ? (
                    <Link
                      href={`/groups/${group.slug}`}
                      className="inline-block text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 px-3 py-1.5 rounded-full font-medium transition-colors"
                    >
                      Enter
                    </Link>
                  ) : isPending ? (
                    <button
                      onClick={() => handleLeave(group.id)}
                      disabled={isLoading}
                      className="text-xs bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 text-zinc-400 border border-zinc-700 px-3 py-1.5 rounded-full font-medium transition-colors disabled:opacity-40"
                    >
                      {isLoading ? '...' : 'Pending'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleJoin(group.id, group.privacy)}
                      disabled={isLoading}
                      className="text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-full font-medium transition-colors disabled:opacity-40"
                    >
                      {isLoading ? '...' : group.privacy === 'private' ? 'Request' : 'Join'}
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
