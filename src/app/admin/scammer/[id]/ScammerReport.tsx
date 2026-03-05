'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  searchUsersForAdmin,
  suspendUser,
  banUser,
  type AdminUserDetail,
  type AdminSearchResult,
} from '@/app/actions/admin'
import type { ScammerResult } from '@/lib/scammer-score'
import { getImageUrl } from '@/lib/supabase/image'

interface Props {
  userId: string
  profile: AdminUserDetail
  result: ScammerResult
}

const GRADE_STYLES: Record<string, { bg: string; text: string; bar: string }> = {
  green:  { bg: 'bg-emerald-500/20', text: 'text-emerald-400', bar: 'bg-emerald-500' },
  yellow: { bg: 'bg-yellow-500/20',  text: 'text-yellow-400',  bar: 'bg-yellow-500' },
  orange: { bg: 'bg-orange-500/20',  text: 'text-orange-400',  bar: 'bg-orange-500' },
  red:    { bg: 'bg-red-500/20',     text: 'text-red-400',     bar: 'bg-red-500' },
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

export default function ScammerReport({ userId, profile, result }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<AdminSearchResult[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Collapsible categories
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  // Action modals
  const [showSuspend, setShowSuspend] = useState(false)
  const [showBan, setShowBan] = useState(false)
  const [reason, setReason] = useState('')
  const [days, setDays] = useState('7')
  const [error, setError] = useState('')

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSearch(q: string) {
    setSearchQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.trim().length < 2) {
      setSearchResults([])
      setSearchOpen(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      const results = await searchUsersForAdmin(q)
      setSearchResults(results)
      setSearchOpen(true)
    }, 300)
  }

  function toggleCategory(idx: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function run(action: () => Promise<void>) {
    setError('')
    startTransition(async () => {
      try {
        await action()
        router.refresh()
        setShowSuspend(false)
        setShowBan(false)
        setReason('')
      } catch (e: any) {
        setError(e.message ?? 'Action failed')
      }
    })
  }

  const style = GRADE_STYLES[result.gradeColor] ?? GRADE_STYLES.green
  const avatarUrl = profile.profile_photo_url
    ? getImageUrl('avatars', profile.profile_photo_url)
    : null
  const accountDays = daysSince(profile.created_at)

  return (
    <div className="space-y-6">
      {/* Back + Search */}
      <div className="flex items-center gap-4 flex-wrap">
        <Link
          href="/admin/users"
          className="flex items-center gap-1.5 text-zinc-500 hover:text-white transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          All users
        </Link>

        <div ref={searchRef} className="relative flex-1 max-w-sm ml-auto">
          <input
            type="text"
            placeholder="Search user to analyze..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
          />
          {searchOpen && searchResults.length > 0 && (
            <ul className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden z-50 shadow-xl">
              {searchResults.map((u) => (
                <li key={u.id}>
                  <button
                    onClick={() => {
                      setSearchOpen(false)
                      setSearchQuery('')
                      router.push(`/admin/scammer/${u.id}`)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800 transition-colors"
                  >
                    {u.profile_photo_url ? (
                      <Image
                        src={getImageUrl('avatars', u.profile_photo_url)}
                        alt=""
                        width={24}
                        height={24}
                        className="rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs text-zinc-400">
                        {u.first_name[0]}
                      </div>
                    )}
                    <span className="text-sm text-white">{u.first_name} {u.last_name}</span>
                    {u.username && (
                      <span className="text-xs text-zinc-500">@{u.username}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Score Display */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="text-center">
            <p className={`text-5xl font-bold ${style.text}`}>{result.totalScore}</p>
            <p className="text-zinc-500 text-xs mt-1">/ 100</p>
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold px-3 py-1 rounded-full ${style.bg} ${style.text}`}>
                {result.grade}
              </span>
              <span className="text-zinc-500 text-sm">Risk Level</span>
            </div>
            <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${style.bar}`}
                style={{ width: `${result.totalScore}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Profile Summary */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt=""
              width={48}
              height={48}
              className="rounded-full object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-zinc-700 flex items-center justify-center text-lg text-zinc-400">
              {profile.first_name[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold">{profile.first_name} {profile.last_name}</p>
            <p className="text-zinc-400 text-sm">@{profile.username ?? 'no username'}</p>
          </div>
          <div className="text-right text-sm space-y-1">
            <p className="text-zinc-400">Account age: <span className="text-white font-medium">{accountDays} days</span></p>
            <p className="text-zinc-400">
              Status:{' '}
              <span className={
                profile.status === 'banned' ? 'text-red-400 font-medium' :
                profile.status === 'suspended' ? 'text-orange-400 font-medium' :
                'text-emerald-400 font-medium'
              }>
                {profile.status}
              </span>
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-3">
          <Link
            href={`/admin/users/${userId}`}
            className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
          >
            View full user detail
          </Link>
          {profile.username && (
            <Link
              href={`/profile/${profile.username}`}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              View public profile
            </Link>
          )}
        </div>
      </div>

      {/* Top Findings */}
      {result.topFindings.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-white font-semibold text-sm mb-3">Top Findings</h2>
          <ul className="space-y-2">
            {result.topFindings.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-red-400 mt-0.5 flex-shrink-0">&#x2022;</span>
                <span className="text-zinc-300">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Category Breakdown */}
      <div className="space-y-2">
        <h2 className="text-white font-semibold text-sm mb-1">Category Breakdown</h2>
        {result.categories.map((cat, idx) => {
          const pct = cat.maxPoints > 0 ? (cat.points / cat.maxPoints) * 100 : 0
          const catColor = pct >= 60 ? 'red' : pct >= 30 ? 'orange' : pct > 0 ? 'yellow' : 'green'
          const cs = GRADE_STYLES[catColor]
          const isExpanded = expanded.has(idx)

          return (
            <div key={idx} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <button
                onClick={() => toggleCategory(idx)}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-zinc-800/50 transition-colors"
              >
                <svg
                  className={`w-4 h-4 text-zinc-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <span className="text-sm text-white font-medium flex-1 text-left">{cat.name}</span>
                <span className={`text-xs font-bold ${cs.text}`}>
                  {cat.points}/{cat.maxPoints}
                </span>
                <div className="w-24 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${cs.bar}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>
              {isExpanded && (
                <div className="px-5 pb-4 pt-1 border-t border-zinc-800/50">
                  {cat.findings.length === 0 ? (
                    <p className="text-zinc-600 text-sm">No findings in this category.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {cat.findings.map((f, fi) => (
                        <li key={fi} className="flex items-start gap-2 text-sm">
                          <span className={`mt-0.5 flex-shrink-0 ${cs.text}`}>&#x2022;</span>
                          <span className="text-zinc-400">{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Quick Actions */}
      {profile.status === 'active' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-white font-semibold text-sm mb-3">Quick Actions</h2>
          {error && (
            <p className="text-red-400 text-sm mb-3">{error}</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => setShowSuspend(true)}
              className="px-4 py-2 bg-orange-500/20 text-orange-400 rounded-lg text-sm font-medium hover:bg-orange-500/30 transition-colors"
            >
              Suspend User
            </button>
            <button
              onClick={() => setShowBan(true)}
              className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/30 transition-colors"
            >
              Ban User
            </button>
          </div>

          {/* Suspend Modal */}
          {showSuspend && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
              <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md space-y-4">
                <h3 className="text-white font-semibold">Suspend User</h3>
                <div>
                  <label className="text-zinc-400 text-sm block mb-1">Reason</label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                    placeholder="e.g. Suspected scammer behavior"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 text-sm block mb-1">Duration (days)</label>
                  <input
                    type="number"
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                    min={1}
                  />
                </div>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowSuspend(false)}
                    className="px-4 py-2 text-zinc-400 text-sm hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={pending || !reason.trim()}
                    onClick={() => run(() => suspendUser(userId, reason.trim(), parseInt(days) || 7))}
                    className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-500 disabled:opacity-50 transition-colors"
                  >
                    {pending ? 'Suspending...' : 'Suspend'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Ban Modal */}
          {showBan && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
              <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md space-y-4">
                <h3 className="text-white font-semibold">Ban User</h3>
                <div>
                  <label className="text-zinc-400 text-sm block mb-1">Reason</label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
                    placeholder="e.g. Confirmed romance scammer"
                  />
                </div>
                <p className="text-red-400 text-xs">This will permanently ban the user and suspend all groups they created.</p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowBan(false)}
                    className="px-4 py-2 text-zinc-400 text-sm hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={pending || !reason.trim()}
                    onClick={() => run(() => banUser(userId, reason.trim()))}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-500 disabled:opacity-50 transition-colors"
                  >
                    {pending ? 'Banning...' : 'Ban'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
