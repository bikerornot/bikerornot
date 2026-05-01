'use client'

import { useState } from 'react'
import Link from 'next/link'
import { removeFromWatchlist, type WatchlistEntry } from '@/app/actions/admin'
import { getReportAIVerdict, type AIVerdict } from '@/app/actions/report-ai-verdict'
import { RiskSignalBadges } from '@/app/admin/components/RiskSignalBadge'
import { UserAvatarWithPreview } from '@/app/admin/components/UserAvatarWithPreview'

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function WatchlistClient({ initialEntries }: { initialEntries: WatchlistEntry[] }) {
  const [entries, setEntries] = useState(initialEntries)
  const [removingId, setRemovingId] = useState<string | null>(null)
  // Per-user verdict cache. Watchlist verdicts don't have a conversation
  // context (no specific flag), so we just key by user_id.
  const [verdicts, setVerdicts] = useState<Record<string, AIVerdict>>({})
  const [verdictErrors, setVerdictErrors] = useState<Record<string, string>>({})
  const [verdictLoadingFor, setVerdictLoadingFor] = useState<string | null>(null)

  async function handleAIVerdict(userId: string) {
    if (verdicts[userId] || verdictLoadingFor) return
    setVerdictLoadingFor(userId)
    setVerdictErrors((prev) => { const next = { ...prev }; delete next[userId]; return next })
    try {
      const result = await getReportAIVerdict(userId)
      if ('error' in result) setVerdictErrors((prev) => ({ ...prev, [userId]: result.error }))
      else setVerdicts((prev) => ({ ...prev, [userId]: result }))
    } catch (err: any) {
      setVerdictErrors((prev) => ({ ...prev, [userId]: err?.message ?? 'Verdict failed' }))
    } finally {
      setVerdictLoadingFor(null)
    }
  }

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
        const isRemoving = removingId === entry.user_id
        const verdict = verdicts[entry.user_id]
        const verdictError = verdictErrors[entry.user_id]

        return (
          <div
            key={entry.id}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-5"
          >
            {/* User info row */}
            <div className="flex items-start gap-3 mb-3">
              <UserAvatarWithPreview
                username={user?.username ?? null}
                firstName={user?.first_name}
                profilePhotoUrl={user?.profile_photo_url ?? null}
                href={`/admin/users/${entry.user_id}`}
              />
              <div className="flex-1 min-w-0 space-y-1">
                <Link
                  href={`/admin/users/${entry.user_id}`}
                  className="text-white font-semibold text-sm hover:text-orange-400 transition-colors"
                >
                  {user?.first_name} {user?.last_name}
                  {user?.username && (
                    <span className="text-zinc-400 font-normal ml-1.5">@{user.username}</span>
                  )}
                </Link>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                    user?.status === 'banned' ? 'bg-red-500/20 text-red-400' :
                    user?.status === 'suspended' ? 'bg-orange-500/20 text-orange-400' :
                    'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {user?.status ?? 'unknown'}
                  </span>
                  <span className="text-zinc-600 text-xs">Added {formatDate(entry.created_at)}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <RiskSignalBadges signals={user?.signals} />
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
                type="button"
                onClick={() => handleAIVerdict(entry.user_id)}
                disabled={verdictLoadingFor === entry.user_id || !!verdict}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-500/15 hover:bg-purple-500/25 disabled:opacity-50 text-purple-300 border border-purple-500/30 transition-colors inline-flex items-center justify-center gap-1.5"
                title="Run AI scammer analysis on this user"
              >
                {verdictLoadingFor === entry.user_id ? '🤖 Analyzing…' : verdict ? '🤖 Done' : '🤖 AI Verdict'}
              </button>
              <button
                onClick={() => handleRemove(entry.user_id)}
                disabled={isRemoving}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-500 border border-zinc-700 transition-colors disabled:opacity-50 ml-auto"
              >
                {isRemoving ? '...' : 'Remove'}
              </button>
            </div>

            {(verdict || verdictError) && (
              <div className="pt-3 mt-3 border-t border-zinc-800">
                {verdictError && (
                  <p className="text-red-400 text-xs">AI verdict failed: {verdictError}</p>
                )}
                {verdict && (() => {
                  const tone =
                    verdict.label === 'likely_scammer'
                      ? 'bg-red-500/10 border-red-500/40 text-red-200'
                      : verdict.label === 'likely_real'
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                        : verdict.label === 'likely_victim'
                          ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-200'
                          : 'bg-yellow-500/10 border-yellow-500/40 text-yellow-200'
                  return (
                    <div className={`rounded-lg border px-3 py-2.5 text-xs space-y-1.5 ${tone}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-bold uppercase tracking-wide">
                          🤖 {verdict.label.replace(/_/g, ' ')} · {verdict.confidence}%
                        </span>
                        <span className="text-[10px] uppercase font-semibold opacity-80">
                          Suggests: {verdict.recommended_action.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="leading-relaxed text-[13px]">{verdict.rationale}</p>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
