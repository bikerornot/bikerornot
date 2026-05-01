'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  bulkDismissReports,
  bulkRemoveContent,
  type ContentReport,
  type ReportSignal,
} from '@/app/actions/reports'
import { banUser } from '@/app/actions/admin'
import { getReportAIVerdict, type AIVerdict } from '@/app/actions/report-ai-verdict'
import InlineUserProfile from './InlineUserProfile'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

function postImageUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/posts/${path}`
}

function avatarUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}`
}

const SIGNAL_LABELS: Record<ReportSignal, { label: string; emoji: string; tone: string; tooltip: string }> = {
  new_account:    { label: 'New',           emoji: '🆕', tone: 'bg-blue-500/20 text-blue-300 border-blue-500/30',     tooltip: 'Account created less than 7 days ago' },
  no_bike:        { label: 'No bike',       emoji: '🏍️', tone: 'bg-amber-500/20 text-amber-300 border-amber-500/30',  tooltip: 'No bikes in garage — strong signal for fake / scammer accounts on a biker site' },
  datacenter_ip:  { label: 'VPN/DC IP',     emoji: '🚫', tone: 'bg-red-500/20 text-red-300 border-red-500/30',         tooltip: 'Signed up from a known cloud / VPS / VPN IP range — real users sign up from residential ISPs' },
  burst_dms:      { label: 'Burst DMs',     emoji: '💬', tone: 'bg-red-500/20 text-red-300 border-red-500/30',         tooltip: 'Sent more than 10 DMs within 24 hours of signup — spray-and-pray pattern' },
  robotic_opener: { label: 'Copy-paste',    emoji: '🔁', tone: 'bg-red-500/20 text-red-300 border-red-500/30',         tooltip: '3+ different conversations got the exact same first message' },
}

function SignalBadge({ signal }: { signal: ReportSignal }) {
  const meta = SIGNAL_LABELS[signal]
  if (!meta) return null
  return (
    <span
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border inline-flex items-center gap-1 ${meta.tone}`}
      title={meta.tooltip}
    >
      <span>{meta.emoji}</span>
      <span>{meta.label}</span>
    </span>
  )
}

const REASON_LABELS: Record<string, string> = {
  spam:         'Spam',
  harassment:   'Harassment',
  hate_speech:  'Hate speech',
  nudity:       'Nudity',
  violence:     'Violence',
  fake_account: 'Fake account',
  other:        'Other',
}

const TYPE_COLORS: Record<string, string> = {
  post:    'bg-blue-500/20 text-blue-300',
  comment: 'bg-zinc-700 text-zinc-300',
  profile: 'bg-purple-500/20 text-purple-300',
}

function formatTimeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type FilterType = 'all' | 'post' | 'comment' | 'profile'

interface Props {
  initialReports: ContentReport[]
}

export default function ReportQueue({ initialReports }: Props) {
  const [, startTransition] = useTransition()
  const [reports, setReports] = useState<ContentReport[]>(initialReports)
  const [filter, setFilter] = useState<FilterType>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const filtered = filter === 'all' ? reports : reports.filter((r) => r.content_type === filter)

  const counts = {
    all: reports.length,
    post: reports.filter((r) => r.content_type === 'post').length,
    comment: reports.filter((r) => r.content_type === 'comment').length,
    profile: reports.filter((r) => r.content_type === 'profile').length,
  }

  function toggleSelect(contentId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(contentId)) next.delete(contentId)
      else next.add(contentId)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((r) => r.content_id)))
    }
  }

  function removeFromList(contentIds: string[]) {
    setReports((prev) => prev.filter((r) => !contentIds.includes(r.content_id)))
    setSelected((prev) => {
      const next = new Set(prev)
      contentIds.forEach((id) => next.delete(id))
      return next
    })
  }

  async function handleBulkDismiss(contentIds?: string[]) {
    const ids = contentIds ?? Array.from(selected)
    if (!ids.length) return
    const reportIds = reports
      .filter((r) => ids.includes(r.content_id))
      .flatMap((r) => r.report_ids)

    setBusy(true)
    try {
      await bulkDismissReports(reportIds)
      startTransition(() => removeFromList(ids))
    } finally {
      setBusy(false)
    }
  }

  async function handleBulkRemove(contentIds?: string[]) {
    const ids = contentIds ?? Array.from(selected)
    if (!ids.length) return
    const items = reports
      .filter((r) => ids.includes(r.content_id) && r.content_type !== 'profile')
      .map((r) => ({ type: r.content_type as 'post' | 'comment', contentId: r.content_id, reportIds: r.report_ids }))

    if (!items.length) return

    setBusy(true)
    try {
      await bulkRemoveContent(items)
      startTransition(() => removeFromList(items.map((i) => i.contentId)))
    } finally {
      setBusy(false)
    }
  }

  async function handleBan(contentId: string) {
    const report = reports.find((r) => r.content_id === contentId)
    if (!report?.content_author_id) return
    if (!confirm(`Ban @${report.content_author_username ?? 'this user'}?`)) return
    setBusy(true)
    try {
      await banUser(report.content_author_id, 'Banned by admin from report review')
      // Also dismiss the reports for this content
      await bulkDismissReports(report.report_ids)
      startTransition(() => removeFromList([contentId]))
    } finally {
      setBusy(false)
    }
  }

  const selectedReports = reports.filter((r) => selected.has(r.content_id))
  const selectedHasRemovable = selectedReports.some((r) => r.content_type !== 'profile')

  const FILTER_TABS: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'post', label: 'Posts' },
    { key: 'comment', label: 'Comments' },
    { key: 'profile', label: 'Profiles' },
  ]

  if (reports.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-600">
        <p className="text-4xl mb-3">✅</p>
        <p className="text-sm">No pending reports.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setFilter(tab.key); setSelected(new Set()) }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              filter === tab.key
                ? 'bg-orange-500 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
            }`}
          >
            {tab.label}
            {counts[tab.key] > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full leading-none ${
                filter === tab.key ? 'bg-white/20 text-white' : 'bg-zinc-700 text-zinc-400'
              }`}>
                {counts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-30 flex items-center gap-3 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 shadow-xl">
          <span className="text-zinc-300 text-sm font-medium flex-1">
            {selected.size} item{selected.size !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => setSelected(new Set())}
            className="text-zinc-500 hover:text-white text-xs transition-colors"
          >
            Clear
          </button>
          <button
            onClick={() => handleBulkDismiss()}
            disabled={busy}
            className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 text-xs font-semibold px-4 py-2 rounded-lg transition-colors border border-zinc-700"
          >
            Dismiss All
          </button>
          {selectedHasRemovable && (
            <button
              onClick={() => handleBulkRemove()}
              disabled={busy}
              className="bg-red-900/40 hover:bg-red-900/60 disabled:opacity-40 text-red-400 text-xs font-semibold px-4 py-2 rounded-lg transition-colors border border-red-800/50"
            >
              Remove Content
            </button>
          )}
        </div>
      )}

      {/* Select all row */}
      {filtered.length > 1 && (
        <div className="flex items-center gap-2 px-1">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
          >
            <Checkbox checked={selected.size === filtered.length && filtered.length > 0} indeterminate={selected.size > 0 && selected.size < filtered.length} />
            <span>{selected.size === filtered.length ? 'Deselect all' : `Select all ${filtered.length}`}</span>
          </button>
        </div>
      )}

      {/* Content cards */}
      {filtered.length === 0 ? (
        <p className="text-center text-zinc-600 text-sm py-8">No {filter} reports</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <ContentCard
              key={r.content_id}
              report={r}
              isSelected={selected.has(r.content_id)}
              onToggle={() => toggleSelect(r.content_id)}
              onDismiss={() => handleBulkDismiss([r.content_id])}
              onRemove={() => handleBulkRemove([r.content_id])}
              onBan={() => handleBan(r.content_id)}
              busy={busy}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Checkbox({ checked, indeterminate }: { checked: boolean; indeterminate?: boolean }) {
  return (
    <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
      checked || indeterminate
        ? 'bg-orange-500 border-orange-500'
        : 'border-zinc-600 bg-transparent'
    }`}>
      {checked && (
        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
          <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {!checked && indeterminate && (
        <div className="w-2 h-0.5 bg-white rounded-full" />
      )}
    </div>
  )
}

interface CardProps {
  report: ContentReport
  isSelected: boolean
  onToggle: () => void
  onDismiss: () => void
  onRemove: () => void
  onBan: () => void
  busy: boolean
}

function ContentCard({ report: r, isSelected, onToggle, onDismiss, onRemove, onBan, busy }: CardProps) {
  const [profileOpen, setProfileOpen] = useState(false)
  const [verdict, setVerdict] = useState<AIVerdict | null>(null)
  const [verdictLoading, setVerdictLoading] = useState(false)
  const [verdictError, setVerdictError] = useState<string | null>(null)
  const profileLink = r.content_author_username ? `/profile/${r.content_author_username}` : null
  const adminUserLink = r.content_author_id ? `/admin/users/${r.content_author_id}` : null
  const isRemovable = r.content_type !== 'profile'
  const authorAvatar = r.content_author_profile_photo_url ? avatarUrl(r.content_author_profile_photo_url) : null
  const authorInitial = (r.content_author_first_name?.[0] ?? r.content_author_username?.[0] ?? '?').toUpperCase()

  async function handleAIVerdict() {
    if (!r.content_author_id || verdictLoading) return
    setVerdictLoading(true)
    setVerdictError(null)
    try {
      const result = await getReportAIVerdict(r.content_author_id)
      if ('error' in result) setVerdictError(result.error)
      else setVerdict(result)
    } catch (err: any) {
      setVerdictError(err?.message ?? 'Verdict failed')
    } finally {
      setVerdictLoading(false)
    }
  }

  return (
    <div className={`bg-zinc-900 border rounded-xl p-4 transition-colors ${
      isSelected ? 'border-orange-500/50 bg-orange-500/5' : 'border-zinc-800'
    }`}>
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button onClick={onToggle} className="mt-0.5 flex-shrink-0" aria-label="Select">
          <Checkbox checked={isSelected} />
        </button>

        <div className="flex-1 min-w-0 space-y-3">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[r.content_type]}`}>
                {r.content_type}
              </span>
              {r.reasons.map((reason) => (
                <span
                  key={reason}
                  className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300"
                >
                  {REASON_LABELS[reason] ?? reason}
                </span>
              ))}
              {r.report_count > 1 && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                  {r.report_count} reports
                </span>
              )}
            </div>
            <p className="text-zinc-600 text-xs whitespace-nowrap flex-shrink-0">
              {formatTimeAgo(r.latest_reported_at)}
            </p>
          </div>

          {/* Author row — avatar, handle, risk signals */}
          {r.content_author_username && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative group flex-shrink-0">
                <div className="w-14 h-14 rounded-full bg-zinc-800 overflow-hidden ring-1 ring-zinc-700">
                  {authorAvatar ? (
                    <Image src={authorAvatar} alt={r.content_author_username} width={56} height={56} className="object-cover w-full h-full" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-400 text-lg font-bold">{authorInitial}</div>
                  )}
                </div>
                {/* Hover preview — floats to the right of the row, large enough
                    to spot fake / stock / underage faces at a glance. Disabled
                    on touch devices via :hover (touch never matches). */}
                {authorAvatar && (
                  <div className="hidden group-hover:block absolute z-40 left-full top-0 ml-3 pointer-events-none">
                    <div className="w-64 h-64 rounded-xl overflow-hidden ring-2 ring-orange-500/60 shadow-2xl bg-zinc-900">
                      <Image src={authorAvatar} alt={r.content_author_username} width={256} height={256} className="object-cover w-full h-full" />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-zinc-500">Author:</span>
                {profileLink ? (
                  <Link href={profileLink} className="text-sm font-semibold text-zinc-200 hover:text-orange-400 transition-colors">
                    @{r.content_author_username}
                  </Link>
                ) : (
                  <span className="text-sm font-semibold text-zinc-200">@{r.content_author_username}</span>
                )}
                {adminUserLink && (
                  <Link href={adminUserLink} className="text-zinc-600 hover:text-orange-400 transition-colors text-xs" title="Open admin profile">
                    ↗
                  </Link>
                )}
                {r.content_author_signals.map((s) => <SignalBadge key={s} signal={s} />)}
              </div>
            </div>
          )}

          {/* Reporters */}
          {r.reporters.length > 0 && (
            <div className="text-xs text-zinc-500">
              Reported by:{' '}
              <span className="text-zinc-400">
                {r.reporters.slice(0, 3).map((rp, i) => (
                  <span key={i}>
                    {i > 0 && ', '}@{rp.username ?? 'unknown'}
                  </span>
                ))}
                {r.reporters.length > 3 && ` +${r.reporters.length - 3} more`}
              </span>
            </div>
          )}

          {/* Content preview */}
          {(r.content_preview || r.content_images.length > 0) && (
            <div className="bg-zinc-800 rounded-xl p-3 space-y-2">
              {r.content_preview && (
                <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{r.content_preview}</p>
              )}
              {r.content_images.length > 0 && (
                <div className={`grid gap-1.5 ${r.content_images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} max-w-sm`}>
                  {r.content_images.map((path, i) => (
                    <a
                      key={i}
                      href={postImageUrl(path)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg overflow-hidden bg-zinc-900 aspect-square"
                    >
                      <Image
                        src={postImageUrl(path)}
                        alt={`Post image ${i + 1}`}
                        width={300}
                        height={300}
                        className="object-cover w-full h-full hover:opacity-90 transition-opacity"
                      />
                    </a>
                  ))}
                </div>
              )}
              {!r.content_preview && r.content_images.length === 0 && (
                <p className="text-sm text-zinc-500 italic">Content not found (may have been deleted)</p>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onDismiss}
              disabled={busy}
              className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors border border-zinc-700"
            >
              Dismiss
            </button>
            {isRemovable && (
              <button
                onClick={onRemove}
                disabled={busy}
                className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-red-400 hover:text-red-300 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors border border-zinc-700"
              >
                Remove content
              </button>
            )}
            {r.content_author_id && (
              <button
                onClick={onBan}
                disabled={busy}
                className="bg-red-500/15 hover:bg-red-500/25 disabled:opacity-40 text-red-400 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors border border-red-500/30"
              >
                Ban User
              </button>
            )}
            {r.content_author_id && (
              <button
                type="button"
                onClick={() => setProfileOpen((o) => !o)}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors border border-zinc-700 flex items-center gap-1.5"
                aria-expanded={profileOpen}
              >
                {profileOpen ? 'Hide profile' : 'User profile'}
                <svg
                  className={`w-3 h-3 transition-transform ${profileOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
            {r.content_author_id && (
              <button
                type="button"
                onClick={handleAIVerdict}
                disabled={verdictLoading || !!verdict}
                className="bg-purple-500/15 hover:bg-purple-500/25 disabled:opacity-50 text-purple-300 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors border border-purple-500/30 flex items-center gap-1.5"
                title="Run AI scammer analysis on this user"
              >
                {verdictLoading ? '🤖 Analyzing…' : verdict ? '🤖 Done' : '🤖 AI Verdict'}
              </button>
            )}
          </div>

          {(verdict || verdictError) && (
            <div className="pt-3 mt-1 border-t border-zinc-800">
              {verdictError && (
                <p className="text-red-400 text-xs">AI verdict failed: {verdictError}</p>
              )}
              {verdict && (
                <div
                  className={`rounded-lg border px-3 py-2.5 text-xs space-y-1.5 ${
                    verdict.label === 'likely_scammer'
                      ? 'bg-red-500/10 border-red-500/40 text-red-200'
                      : verdict.label === 'likely_real'
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                        : 'bg-yellow-500/10 border-yellow-500/40 text-yellow-200'
                  }`}
                >
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
              )}
            </div>
          )}

          {profileOpen && r.content_author_id && (
            <div className="pt-3 mt-3 border-t border-zinc-800">
              <InlineUserProfile userId={r.content_author_id} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
