'use client'

import { useState, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { AdminUserRow } from '@/app/actions/admin'
import { getImageUrl } from '@/lib/supabase/image'

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'flagged', label: '🚩 Flagged' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'banned', label: 'Banned' },
]

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam', harassment: 'Harassment', hate_speech: 'Hate speech',
  nudity: 'Nudity', violence: 'Violence', fake_account: 'Fake account', other: 'Other',
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface Props {
  initialUsers: AdminUserRow[]
  total: number
  pageSize: number
  initialSearch: string
  initialStatus: string
  initialPage: number
}

export default function UsersClient({
  initialUsers,
  total,
  pageSize,
  initialSearch,
  initialStatus,
  initialPage,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [search, setSearch] = useState(initialSearch)
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  const navigate = useCallback(
    (params: { search?: string; status?: string; page?: number }) => {
      const sp = new URLSearchParams()
      if (params.search ?? initialSearch) sp.set('search', params.search ?? initialSearch)
      if (params.status ?? initialStatus) sp.set('status', params.status ?? initialStatus)
      if ((params.page ?? initialPage) > 1) sp.set('page', String(params.page ?? initialPage))
      startTransition(() => {
        router.push(`/admin/users${sp.toString() ? '?' + sp.toString() : ''}`)
      })
    },
    [router, initialSearch, initialStatus, initialPage, startTransition]
  )

  function handleSearch(value: string) {
    setSearch(value)
    if (debounceTimer) clearTimeout(debounceTimer)
    const t = setTimeout(() => navigate({ search: value, status: initialStatus, page: 1 }), 400)
    setDebounceTimer(t)
  }

  function handleStatus(value: string) {
    navigate({ search, status: value, page: 1 })
  }

  function handlePage(page: number) {
    navigate({ search, status: initialStatus, page })
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by username or name…"
            className="w-full pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl text-sm focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>
        <div className="flex gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => handleStatus(f.value)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                initialStatus === f.value
                  ? 'bg-orange-500 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {initialUsers.length === 0 ? (
          <p className="text-center text-zinc-600 py-12 text-sm">No users found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">User</th>
                  <th className="text-left px-4 py-3 font-medium">Location</th>
                  <th className="text-left px-4 py-3 font-medium">Signup country</th>
                  <th className="text-left px-4 py-3 font-medium">Joined</th>
                  <th className="text-left px-4 py-3 font-medium">Posts</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {initialUsers.map((u, i) => {
                  const avatarUrl = u.profile_photo_url
                    ? getImageUrl('avatars', u.profile_photo_url)
                    : null
                  return (
                    <tr
                      key={u.id}
                      className={`border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors cursor-pointer ${
                        i === initialUsers.length - 1 ? 'border-b-0' : ''
                      }`}
                      onClick={() => router.push(`/admin/users/${u.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-zinc-700 flex-shrink-0 overflow-hidden">
                            {avatarUrl ? (
                              <Image src={avatarUrl} alt="" width={32} height={32} className="object-cover w-full h-full" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs font-bold">
                                {u.first_name?.[0]?.toUpperCase() ?? '?'}
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="text-zinc-200 font-medium">{u.first_name} {u.last_name}</p>
                            <p className="text-zinc-500 text-xs">@{u.username ?? 'no username'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-400 text-xs">
                        {u.city && u.state ? `${u.city}, ${u.state}` : u.state ?? u.city ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <span className={`text-xs font-medium ${u.risk_flags.length > 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                            {u.signup_country ?? '—'}
                          </span>
                          {u.signup_region && (
                            <p className="text-xs text-zinc-500">{u.signup_region}</p>
                          )}
                          {u.risk_flags.map((flag, fi) => (
                            <div key={fi} className="flex items-center gap-1">
                              <span className="text-[10px] bg-red-500/15 text-red-400 border border-red-500/20 rounded px-1.5 py-0.5 leading-tight">
                                🚩 {flag}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">{formatDate(u.created_at)}</td>
                      <td className="px-4 py-3 text-zinc-400 text-xs">{u.post_count}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          u.status === 'banned' ? 'bg-red-500/20 text-red-400' :
                          u.status === 'suspended' ? 'bg-orange-500/20 text-orange-400' :
                          'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/users/${u.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-zinc-500 hover:text-orange-400 transition-colors text-xs font-medium"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-zinc-500 text-xs">
            Showing {((initialPage - 1) * pageSize) + 1}–{Math.min(initialPage * pageSize, total)} of {total.toLocaleString()}
          </p>
          <div className="flex gap-1.5">
            <button
              onClick={() => handlePage(initialPage - 1)}
              disabled={initialPage <= 1}
              className="px-3 py-1.5 bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 rounded-lg text-xs transition-colors"
            >
              ← Prev
            </button>
            <span className="px-3 py-1.5 text-zinc-400 text-xs">
              {initialPage} / {totalPages}
            </span>
            <button
              onClick={() => handlePage(initialPage + 1)}
              disabled={initialPage >= totalPages}
              className="px-3 py-1.5 bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 rounded-lg text-xs transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
