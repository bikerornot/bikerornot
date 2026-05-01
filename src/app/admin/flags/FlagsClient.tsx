'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { banUser } from '@/app/actions/admin'
import { dismissFlag, reviewFlag, dismissAllFlagsForUser, getFlagConversationMessages, scanConversation, type ContentFlag, type FlagConversationMessage, type ConversationScanResult } from '@/app/actions/scam-scan'
import { getReportAIVerdict, type AIVerdict } from '@/app/actions/report-ai-verdict'
import { RiskSignalBadges } from '@/app/admin/components/RiskSignalBadge'
import InlineUserProfile from '@/app/admin/reports/InlineUserProfile'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
function avatarUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}`
}

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
  const [expandedConvos, setExpandedConvos] = useState<Record<string, FlagConversationMessage[]>>({})
  const [loadingConvo, setLoadingConvo] = useState<string | null>(null)
  const [scanResults, setScanResults] = useState<Record<string, ConversationScanResult>>({})
  const [scanningId, setScanningId] = useState<string | null>(null)
  const [profileOpenFor, setProfileOpenFor] = useState<string | null>(null)
  // AI verdicts are keyed by flag_id (not sender_id) since the verdict is
  // now conversation-aware — the same sender may be a "likely_scammer" in
  // one conversation and a "likely_victim" in another. Each flag gets its
  // own verdict scoped to its conversation.
  const [verdicts, setVerdicts] = useState<Record<string, AIVerdict>>({})
  const [verdictErrors, setVerdictErrors] = useState<Record<string, string>>({})
  const [verdictLoadingFor, setVerdictLoadingFor] = useState<string | null>(null)
  // Counter-party profile expansion is keyed by flag_id (one open at a time per flag)
  const [counterPartyProfileOpen, setCounterPartyProfileOpen] = useState<string | null>(null)

  async function handleAIVerdict(flagId: string, senderId: string, conversationId: string | null) {
    if (verdicts[flagId] || verdictLoadingFor) return
    setVerdictLoadingFor(flagId)
    setVerdictErrors((prev) => { const next = { ...prev }; delete next[flagId]; return next })
    try {
      const result = await getReportAIVerdict(senderId, conversationId)
      if ('error' in result) {
        setVerdictErrors((prev) => ({ ...prev, [flagId]: result.error }))
      } else {
        setVerdicts((prev) => ({ ...prev, [flagId]: result }))
      }
    } catch (err: any) {
      setVerdictErrors((prev) => ({ ...prev, [flagId]: err?.message ?? 'Verdict failed' }))
    } finally {
      setVerdictLoadingFor(null)
    }
  }

  async function toggleConversation(flagId: string, conversationId: string) {
    if (expandedConvos[flagId]) {
      setExpandedConvos((prev) => { const next = { ...prev }; delete next[flagId]; return next })
      return
    }
    setLoadingConvo(flagId)
    try {
      const messages = await getFlagConversationMessages(conversationId)
      setExpandedConvos((prev) => ({ ...prev, [flagId]: messages }))
    } finally {
      setLoadingConvo(null)
    }
  }

  async function handleScanConversation(flagId: string, conversationId: string) {
    setScanningId(flagId)
    try {
      const result = await scanConversation(conversationId)
      console.log('Scan result:', result)
      setScanResults((prev) => ({ ...prev, [flagId]: result }))
    } catch (err) {
      console.error('Scan error:', err)
    } finally {
      setScanningId(null)
    }
  }

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
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {/* Sender avatar with hover-to-enlarge preview */}
                  {sender && (
                    <div className="relative group flex-shrink-0">
                      <div className="w-14 h-14 rounded-full bg-zinc-800 overflow-hidden ring-1 ring-zinc-700">
                        {sender.profile_photo_url ? (
                          <Image
                            src={avatarUrl(sender.profile_photo_url)}
                            alt={sender.username ?? sender.first_name}
                            width={56}
                            height={56}
                            className="object-cover w-full h-full"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-400 text-lg font-bold">
                            {(sender.first_name?.[0] ?? sender.username?.[0] ?? '?').toUpperCase()}
                          </div>
                        )}
                      </div>
                      {sender.profile_photo_url && (
                        <div className="hidden group-hover:block absolute z-40 left-full top-0 ml-3 pointer-events-none">
                          <div className="w-64 h-64 rounded-xl overflow-hidden ring-2 ring-orange-500/60 shadow-2xl bg-zinc-900">
                            <Image
                              src={avatarUrl(sender.profile_photo_url)}
                              alt={sender.username ?? sender.first_name}
                              width={256}
                              height={256}
                              className="object-cover w-full h-full"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ScoreBadge score={flag.score} />
                      <TypeBadge type={flag.flag_type} />
                      {sender ? (
                        <Link
                          href={`/admin/users/${sender.id}`}
                          className="text-sm font-semibold text-white hover:text-orange-400 transition-colors"
                        >
                          {sender.first_name} {sender.last_name}
                          {sender.username && (
                            <span className="text-zinc-400 font-normal ml-1">@{sender.username}</span>
                          )}
                        </Link>
                      ) : (
                        <span className="text-zinc-500 text-sm">Unknown sender</span>
                      )}
                      {sender?.status === 'banned' && (
                        <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded font-medium">
                          Banned
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <RiskSignalBadges signals={sender?.signals} />
                    </div>
                    {flag.flag_type === 'message' && flag.recipient && (
                      <p className="text-zinc-500 text-xs">
                        to{' '}
                        <Link
                          href={`/admin/users/${flag.recipient.id}`}
                          className="text-zinc-300 hover:text-orange-400 transition-colors font-medium"
                        >
                          {flag.recipient.username ? `@${flag.recipient.username}` : `${flag.recipient.first_name} ${flag.recipient.last_name}`}
                        </Link>
                      </p>
                    )}
                    {flag.flag_type === 'comment' && (
                      <p className="text-zinc-500 text-xs">on a post</p>
                    )}
                  </div>
                </div>
                <span className="text-zinc-600 text-xs whitespace-nowrap flex-shrink-0">
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

              {/* Flagged content */}
              <div className="bg-zinc-800 rounded-lg px-4 py-3 text-sm text-white break-words mb-3">
                {flag.content}
              </div>

              {/* Full conversation toggle — DM flags only */}
              {flag.flag_type === 'message' && flag.conversation_id && (
                <div className="mb-4">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => toggleConversation(flag.id, flag.conversation_id!)}
                      disabled={loadingConvo === flag.id}
                      className="text-xs font-medium text-orange-400 hover:text-orange-300 transition-colors"
                    >
                      {loadingConvo === flag.id
                        ? 'Loading...'
                        : expandedConvos[flag.id]
                        ? 'Hide Messages'
                        : 'View Full Conversation'}
                    </button>
                    {!scanResults[flag.id] && (
                      <button
                        onClick={() => handleScanConversation(flag.id, flag.conversation_id!)}
                        disabled={scanningId === flag.id}
                        className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        {scanningId === flag.id ? 'Scanning...' : 'AI Scan Conversation'}
                      </button>
                    )}
                  </div>

                  {/* AI scan result */}
                  {scanResults[flag.id] && (
                    <div className="mt-2 bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <ScoreBadge score={scanResults[flag.id].score} />
                        <span className="text-xs text-zinc-400">Conversation Scan</span>
                      </div>
                      <p className="text-sm text-zinc-300">{scanResults[flag.id].summary}</p>
                      {scanResults[flag.id].patterns.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {scanResults[flag.id].patterns.map((p, i) => (
                            <span key={i} className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">
                              {p}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {expandedConvos[flag.id] && (
                    <div className="mt-2 bg-zinc-800/50 border border-zinc-700 rounded-lg max-h-80 overflow-y-auto">
                      {expandedConvos[flag.id].length === 0 ? (
                        <p className="text-zinc-500 text-xs p-3 text-center">No messages found</p>
                      ) : (
                        <div className="divide-y divide-zinc-700/50">
                          {expandedConvos[flag.id].map((msg) => {
                            const isSuspicious = scanResults[flag.id]?.suspiciousMessageIds.includes(msg.id)
                            return (
                            <div
                              key={msg.id}
                              className={`px-3 py-2 ${isSuspicious ? 'bg-red-500/10 border-l-2 border-red-500' : msg.sender_id === flag.sender_id ? 'bg-red-500/5' : ''}`}
                            >
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={`text-xs font-semibold ${msg.sender_id === flag.sender_id ? 'text-red-400' : 'text-zinc-300'}`}>
                                  @{msg.sender_username ?? 'unknown'}
                                </span>
                                <span className="text-zinc-600 text-xs">
                                  {new Date(msg.created_at).toLocaleString('en-US', {
                                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                                  })}
                                </span>
                              </div>
                              <p className="text-sm text-zinc-300 break-words">{msg.content}</p>
                            </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

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
                    <button
                      type="button"
                      onClick={() => setProfileOpenFor((cur) => (cur === flag.id ? null : flag.id))}
                      className="px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700 transition-colors text-center inline-flex items-center justify-center gap-1.5"
                      aria-expanded={profileOpenFor === flag.id}
                    >
                      {profileOpenFor === flag.id ? 'Hide Profile' : 'View Profile'}
                      <svg
                        className={`w-3 h-3 transition-transform ${profileOpenFor === flag.id ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  )}
                  {sender && (
                    <button
                      type="button"
                      onClick={() => handleAIVerdict(flag.id, sender.id, flag.conversation_id)}
                      disabled={verdictLoadingFor === flag.id || !!verdicts[flag.id]}
                      className="px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold bg-purple-500/15 hover:bg-purple-500/25 disabled:opacity-50 text-purple-300 border border-purple-500/30 transition-colors inline-flex items-center justify-center gap-1.5"
                      title="Run AI scammer analysis on this user (uses the flagged conversation when available)"
                    >
                      {verdictLoadingFor === flag.id ? '🤖 Analyzing…' : verdicts[flag.id] ? '🤖 Done' : '🤖 AI Verdict'}
                    </button>
                  )}
                </div>
              )}

              {sender && (verdicts[flag.id] || verdictErrors[flag.id]) && (
                <div className="pt-3 mt-3 border-t border-zinc-800 space-y-2">
                  {verdictErrors[flag.id] && (
                    <p className="text-red-400 text-xs">AI verdict failed: {verdictErrors[flag.id]}</p>
                  )}
                  {verdicts[flag.id] && (() => {
                    const v = verdicts[flag.id]
                    const tone =
                      v.label === 'likely_scammer'
                        ? 'bg-red-500/10 border-red-500/40 text-red-200'
                        : v.label === 'likely_real'
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                          : v.label === 'likely_victim'
                            ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-200'
                            : 'bg-yellow-500/10 border-yellow-500/40 text-yellow-200'
                    const senderId = sender.id
                    const otherPendingFromSameUser = flags.filter(
                      (f) => f.sender_id === senderId && f.status === 'pending' && f.id !== flag.id,
                    ).length
                    const exonerated = v.label === 'likely_real' || v.label === 'likely_victim'
                    return (
                      <>
                        <div className={`rounded-lg border px-3 py-2.5 text-xs space-y-2 ${tone}`}>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-bold uppercase tracking-wide">
                              🤖 {v.label.replace(/_/g, ' ')} · {v.confidence}%
                            </span>
                            <span className="text-[10px] uppercase font-semibold opacity-80">
                              Suggests: {v.recommended_action.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <p className="leading-relaxed text-[13px]">{v.rationale}</p>
                          {exonerated && otherPendingFromSameUser > 0 && (
                            <button
                              type="button"
                              disabled={loadingId === flag.id}
                              onClick={async () => {
                                if (!confirm(`Dismiss all ${otherPendingFromSameUser + 1} pending flags from @${sender.username}? You've already judged them as ${v.label.replace(/_/g, ' ')}.`)) return
                                setLoadingId(flag.id)
                                const result = await dismissAllFlagsForUser(senderId)
                                setFlags((prev) => prev.map((f) => (f.sender_id === senderId && f.status === 'pending' ? { ...f, status: 'dismissed' } : f)))
                                setLoadingId(null)
                                console.log(`Dismissed ${result.dismissed} flags from @${sender.username}`)
                              }}
                              className="bg-zinc-900/40 hover:bg-zinc-900/60 disabled:opacity-50 text-current text-xs font-semibold px-3 py-1.5 rounded-lg border border-current/30 transition-colors"
                            >
                              Dismiss all {otherPendingFromSameUser + 1} pending flags from @{sender.username}
                            </button>
                          )}
                        </div>
                        {v.counter_party_concern && (() => {
                          const cp = v.counter_party_concern
                          const cpAvatar = cp.profile_photo_url ? avatarUrl(cp.profile_photo_url) : null
                          const cpInitial = (cp.first_name?.[0] ?? cp.username?.[0] ?? '?').toUpperCase()
                          const cpProfileLink = cp.user_id ? `/admin/users/${cp.user_id}` : null
                          const cpAlreadyBanned = cp.status === 'banned'
                          // Tone shifts when the counter-party is already banned:
                          // it's no longer a "do something" alert — it's a
                          // "confirmed, this user is fine" signal.
                          const panelTone = cpAlreadyBanned
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                            : 'border-red-500/40 bg-red-500/10 text-red-200'
                          const ringTone = cpAlreadyBanned ? 'ring-emerald-500/40' : 'ring-red-500/40'
                          const previewRing = cpAlreadyBanned ? 'ring-emerald-500/60' : 'ring-red-500/60'
                          return (
                            <div className={`rounded-lg border px-3 py-2.5 text-xs space-y-2 ${panelTone}`}>
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="font-bold uppercase tracking-wide">
                                  {cpAlreadyBanned ? '✅ Counter-party already banned' : '⚠️ Counter-party concern'}
                                </span>
                                {cpAlreadyBanned && (
                                  <span className="text-[10px] uppercase font-bold bg-red-500/30 text-red-100 border border-red-500/50 px-2 py-0.5 rounded">
                                    BANNED
                                  </span>
                                )}
                                <span className="text-[10px] uppercase font-semibold opacity-80">
                                  AI says: {cp.label.replace(/_/g, ' ')}
                                </span>
                              </div>

                              {/* Avatar + handle row, mirrors the main flag header */}
                              <div className="flex items-center gap-3">
                                <div className="relative group flex-shrink-0">
                                  <div className={`w-12 h-12 rounded-full bg-zinc-800 overflow-hidden ring-1 ${ringTone}`}>
                                    {cpAvatar ? (
                                      <Image src={cpAvatar} alt={cp.username ?? 'counter-party'} width={48} height={48} className="object-cover w-full h-full" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-zinc-300 text-base font-bold">{cpInitial}</div>
                                    )}
                                  </div>
                                  {cpAvatar && (
                                    <div className="hidden group-hover:block absolute z-40 left-full top-0 ml-3 pointer-events-none">
                                      <div className={`w-64 h-64 rounded-xl overflow-hidden ring-2 ${previewRing} shadow-2xl bg-zinc-900`}>
                                        <Image src={cpAvatar} alt={cp.username ?? 'counter-party'} width={256} height={256} className="object-cover w-full h-full" />
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  {cpProfileLink ? (
                                    <Link href={cpProfileLink} className="text-sm font-semibold text-current hover:text-white transition-colors">
                                      @{cp.username ?? 'unknown'}
                                    </Link>
                                  ) : (
                                    <span className="text-sm font-semibold text-current">@{cp.username ?? 'unknown'}</span>
                                  )}
                                  {cp.first_name && <p className="text-[11px] opacity-70">{cp.first_name}</p>}
                                </div>
                              </div>

                              <p className="leading-relaxed text-[13px]">{cp.rationale}</p>

                              <div className="flex flex-wrap gap-2 pt-1">
                                {cp.user_id && (
                                  <button
                                    type="button"
                                    onClick={() => setCounterPartyProfileOpen((cur) => (cur === flag.id ? null : flag.id))}
                                    className="bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold px-3 py-1.5 rounded-lg border border-zinc-700 transition-colors inline-flex items-center gap-1.5"
                                    aria-expanded={counterPartyProfileOpen === flag.id}
                                  >
                                    {counterPartyProfileOpen === flag.id ? 'Hide profile' : 'View profile'}
                                    <svg className={`w-3 h-3 transition-transform ${counterPartyProfileOpen === flag.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </button>
                                )}
                                {cp.user_id && !cpAlreadyBanned && (
                                  <button
                                    type="button"
                                    disabled={loadingId === flag.id}
                                    onClick={async () => {
                                      if (!cp.user_id) return
                                      if (!confirm(`Ban @${cp.username ?? 'this user'} (the counter-party)?`)) return
                                      setLoadingId(flag.id)
                                      await banUser(cp.user_id, 'Banned by admin via AI counter-party verdict (other side of flagged conversation)')
                                      await dismissFlag(flag.id)
                                      setFlags((prev) => prev.map((f) => (f.id === flag.id ? { ...f, status: 'dismissed' } : f)))
                                      setLoadingId(null)
                                    }}
                                    className="bg-red-500/30 hover:bg-red-500/40 disabled:opacity-50 text-red-100 text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-500/50 transition-colors"
                                  >
                                    Ban @{cp.username} & dismiss this flag
                                  </button>
                                )}
                              </div>

                              {counterPartyProfileOpen === flag.id && cp.user_id && (
                                <div className="pt-3 mt-1 border-t border-red-500/30">
                                  <InlineUserProfile userId={cp.user_id} />
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </>
                    )
                  })()}
                </div>
              )}

              {profileOpenFor === flag.id && sender && (
                <div className="pt-3 mt-3 border-t border-zinc-800">
                  <InlineUserProfile userId={sender.id} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
