'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { SuspiciousProfile } from '@/app/actions/ai-analysis'
import { getReportAIVerdict, type AIVerdict } from '@/app/actions/report-ai-verdict'
import { addToWatchlist, banUser } from '@/app/actions/admin'
import { RiskSignalBadges } from '@/app/admin/components/RiskSignalBadge'
import { UserAvatarWithPreview } from '@/app/admin/components/UserAvatarWithPreview'

interface Props {
  initialProfiles: SuspiciousProfile[]
}

function riskBadge(score: number) {
  if (score >= 70) return <span className="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-0.5 rounded-full">High</span>
  if (score >= 50) return <span className="bg-orange-500/20 text-orange-400 text-xs font-bold px-2 py-0.5 rounded-full">Medium</span>
  return <span className="bg-yellow-500/20 text-yellow-400 text-xs font-bold px-2 py-0.5 rounded-full">Low</span>
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function AiAnalysisClient({ initialProfiles }: Props) {
  const [profiles, setProfiles] = useState(initialProfiles)
  const [verdicts, setVerdicts] = useState<Record<string, AIVerdict>>({})
  const [verdictErrors, setVerdictErrors] = useState<Record<string, string>>({})
  const [verdictLoadingFor, setVerdictLoadingFor] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

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

  async function handleAddToWatchlist(userId: string, username: string) {
    const note = prompt(`Why add @${username} to the watchlist?`, 'Borderline — keep an eye on them')
    if (note === null) return
    setBusyId(userId)
    try {
      await addToWatchlist(userId, note.trim() || 'Added from AI Analysis')
      setProfiles((prev) => prev.filter((p) => p.id !== userId))
    } finally {
      setBusyId(null)
    }
  }

  async function handleBan(userId: string, username: string) {
    if (!confirm(`Ban @${username}?`)) return
    setBusyId(userId)
    try {
      await banUser(userId, 'Banned from AI Analysis')
      setProfiles((prev) => prev.filter((p) => p.id !== userId))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-white">AI Analysis</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Profiles flagged by behavior patterns. Already-watchlisted and banned users are hidden — they're handled in their own queues.
        </p>
        <p className="text-zinc-500 text-xs mt-1.5">
          <span className="font-semibold text-zinc-400">Workflow:</span>{' '}
          Run 🤖 AI Verdict → if borderline, "Add to Watchlist" with a note → if confirmed scammer, ban. Real users with no action just age out.
        </p>
      </div>

      {profiles.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <p className="text-emerald-400 text-lg mb-1">All clear</p>
          <p className="text-zinc-500 text-sm">No suspicious patterns detected in the last 14 days.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-zinc-500">{profiles.length} profile{profiles.length !== 1 ? 's' : ''} flagged</p>

          {profiles.map((p) => {
            const location = [p.city, p.state].filter(Boolean).join(', ')
            const verdict = verdicts[p.id]
            const verdictError = verdictErrors[p.id]

            return (
              <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <UserAvatarWithPreview
                    username={p.username}
                    firstName={p.firstName}
                    profilePhotoUrl={p.profilePhotoUrl}
                    href={`/admin/users/${p.id}`}
                  />

                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/admin/users/${p.id}`} className="text-white font-semibold hover:text-orange-400 transition-colors">
                        @{p.username}
                      </Link>
                      {riskBadge(p.riskScore)}
                      {!p.verified && (
                        <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">Unverified</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <RiskSignalBadges signals={p.signals} />
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-400">
                      <span>{p.gender === 'female' ? 'Female' : p.gender === 'male' ? 'Male' : '—'}</span>
                      {location && <span>{location}</span>}
                      <span>Joined {formatDate(p.joined)}</span>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <span className="text-zinc-300">
                        <span className="font-semibold text-white">{p.messagesSent}</span> msgs sent
                      </span>
                      <span className="text-zinc-300">
                        <span className="font-semibold text-white">{p.conversations}</span> convos
                      </span>
                      <span className="text-zinc-300">
                        <span className="font-semibold text-white">{p.posts}</span> posts
                      </span>
                      <span className="text-zinc-500">
                        Messaged: {p.messagedMen} men, {p.messagedWomen} women
                      </span>
                    </div>
                  </div>

                  <div className="flex-shrink-0 text-right">
                    <p className={`text-2xl font-bold ${
                      p.riskScore >= 70 ? 'text-red-400' : p.riskScore >= 50 ? 'text-orange-400' : 'text-yellow-400'
                    }`}>{p.riskScore}</p>
                    <p className="text-xs text-zinc-500">risk</p>
                  </div>
                </div>

                {/* Action row */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleAIVerdict(p.id)}
                    disabled={verdictLoadingFor === p.id || !!verdict}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-500/15 hover:bg-purple-500/25 disabled:opacity-50 text-purple-300 border border-purple-500/30 transition-colors inline-flex items-center justify-center gap-1.5"
                  >
                    {verdictLoadingFor === p.id ? '🤖 Analyzing…' : verdict ? '🤖 Done' : '🤖 AI Verdict'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddToWatchlist(p.id, p.username)}
                    disabled={busyId === p.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 border border-zinc-700 transition-colors"
                  >
                    Add to Watchlist
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBan(p.id, p.username)}
                    disabled={busyId === p.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/15 hover:bg-red-500/25 disabled:opacity-50 text-red-400 border border-red-500/30 transition-colors"
                  >
                    Ban User
                  </button>
                  <Link
                    href={`/admin/scammer/${p.id}`}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700 transition-colors ml-auto"
                  >
                    Deep Analysis
                  </Link>
                </div>

                {/* AI verdict result panel */}
                {(verdict || verdictError) && (
                  <div className="pt-3 border-t border-zinc-800">
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
      )}
    </div>
  )
}
