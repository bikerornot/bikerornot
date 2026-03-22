'use client'

import { useState } from 'react'
import Link from 'next/link'
import { banUser } from '@/app/actions/admin'
import { dismissFlag, reviewFlag, type ContentFlag } from '@/app/actions/scam-scan'

const STATUS_FILTER = ['all', 'pending', 'reviewed', 'dismissed'] as const
type StatusFilter = (typeof STATUS_FILTER)[number]

const TYPE_FILTER = ['all', 'message', 'comment'] as const
type TypeFilter = (typeof TYPE_FILTER)[number]

function TypeBadge({ type }: { type: 'message' | 'comment' }) {
  return type === 'comment' ? (
    <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
      Comment
    </span>
  ) : (
    <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
      DM
    </span>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color =
    score >= 0.85
      ? 'bg-red-500/20 text-red-400 border-red-500/30'
      : score >= 0.70
      ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
      : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${color}`}>
      {pct}%
    </span>
  )
}

export default function FlagsClient({ initialFlags }: { initialFlags: ContentFlag[] }) {
  const [flags, setFlags] = useState(initialFlags)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const visible = flags.filter((f) => {
    if (statusFilter !== 'all' && f.status !== statusFilter) return false
    if (typeFilter !== 'all' && f.flag_type !== typeFilter) return false
    // Skip flags from banned users — their content is shadow-hidden anyway
    if (f.sender?.status === 'banned') return false
    return true
  })

  const pendingCount = flags.filter((f) => f.status === 'pending' && f.sender?.status !== 'banned').length

  async function handleDismiss(flagId: string) {
    setLoadingId(flagId)
    await dismissFlag(flagId)
    setFlags((prev) => prev.map((f) => (f.id === flagId ? { ...f, status: 'dismissed' } : f)))
    setLoadingId(null)
  }

  async function handleReview(flagId: string) {
    setLoadingId(flagId)
    await reviewFlag(flagId)
    setFlags((prev) => prev.map((f) => (f.id === flagId ? { ...f, status: 'reviewed' } : f)))
    setLoadingId(null)
  }

  async function handleBan(flagId: string, userId: string) {
    if (!confirm('Ban this user?')) return
    setLoadingId(flagId)
    await banUser(userId, 'Banned by admin after AI scam flag review')
    await reviewFlag(flagId)
    setFlags((prev) =>
      prev.map((f) => {
        if (f.id === flagId) return { ...f, status: 'reviewed' }
        if (f.sender_id === userId) return { ...f, status: 'reviewed' }
        return f
      })
    )
    setLoadingId(null)
  }

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {STATUS_FILTER.map((s) => {
          const count = s === 'pending' ? pendingCount : undefined
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize flex items-center gap-1.5 ${
                statusFilter === s
                  ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-white'
              }`}
            >
              {s}
              {count != null && count > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Type filter */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {TYPE_FILTER.map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
              typeFilter === t
                ? 'bg-zinc-700 text-white border border-zinc-600'
                : 'bg-zinc-800/50 text-zinc-500 border border-zinc-800 hover:text-zinc-300'
            }`}
          >
            {t === 'all' ? 'All Types' : t === 'message' ? 'DMs' : 'Comments'}
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-zinc-500 text-sm">
            {statusFilter === 'pending' ? 'No pending flags. All clear.' : 'Nothing here.'}
          </p>
        </div>
      )}

      <div className="space-y-4">
        {visible.map((flag) => {
          const sender = flag.sender
          const isLoading = loadingId === flag.id

          return (
            <div
              key={flag.id}
              className={`bg-zinc-900 border rounded-xl p-5 ${
                flag.status === 'pending' ? 'border-zinc-700' : 'border-zinc-800 opacity-60'
              }`}
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 min-w-0 flex-wrap">
                  <ScoreBadge score={flag.score} />
                  <TypeBadge type={flag.flag_type} />
                  {sender ? (
                    <Link
                      href={`/admin/users/${sender.id}`}
                      className="text-sm font-semibold text-white hover:text-orange-400 transition-colors truncate"
                    >
                      {sender.first_name} {sender.last_name}
                      {sender.username && (
                        <span className="text-zinc-400 font-normal ml-1">@{sender.username}</span>
                      )}
                    </Link>
                  ) : (
                    <span className="text-zinc-500 text-sm">Unknown sender</span>
                  )}
                  {flag.flag_type === 'message' && flag.recipient && (
                    <span className="text-zinc-500 text-xs">
                      to{' '}
                      <Link
                        href={`/admin/users/${flag.recipient.id}`}
                        className="text-zinc-300 hover:text-orange-400 transition-colors font-medium"
                      >
                        {flag.recipient.username ? `@${flag.recipient.username}` : `${flag.recipient.first_name} ${flag.recipient.last_name}`}
                      </Link>
                    </span>
                  )}
                  {flag.flag_type === 'comment' && (
                    <span className="text-zinc-500 text-xs">on a post</span>
                  )}
                  {sender?.status === 'banned' && (
                    <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded font-medium">
                      Banned
                    </span>
                  )}
                </div>
                <span className="text-zinc-600 text-xs whitespace-nowrap">
                  {new Date(flag.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              {/* AI reason */}
              {flag.reason && (
                <p className="text-xs text-zinc-500 mb-2 italic">AI: "{flag.reason}"</p>
              )}

              {/* Message content */}
              <div className="bg-zinc-800 rounded-lg px-4 py-3 text-sm text-zinc-300 break-words mb-4">
                {flag.content}
              </div>

              {/* Actions */}
              {flag.status === 'pending' && (
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                  <button
                    disabled={isLoading}
                    onClick={() => handleDismiss(flag.id)}
                    className="px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700 transition-colors disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                  <button
                    disabled={isLoading}
                    onClick={() => handleReview(flag.id)}
                    className="px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border border-blue-500/30 transition-colors disabled:opacity-50"
                  >
                    Mark Reviewed
                  </button>
                  {sender && sender.status !== 'banned' && (
                    <button
                      disabled={isLoading}
                      onClick={() => handleBan(flag.id, sender.id)}
                      className="px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 transition-colors disabled:opacity-50"
                    >
                      Ban User
                    </button>
                  )}
                  {sender && (
                    <Link
                      href={`/admin/users/${sender.id}`}
                      className="px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700 transition-colors text-center"
                    >
                      View Profile
                    </Link>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
