'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  bulkDismissReports,
  bulkRemoveContent,
  type ContentReport,
} from '@/app/actions/reports'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

function postImageUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/posts/${path}`
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
  busy: boolean
}

function ContentCard({ report: r, isSelected, onToggle, onDismiss, onRemove, busy }: CardProps) {
  const profileLink = r.content_author_username ? `/profile/${r.content_author_username}` : null
  const adminUserLink = r.content_author_id ? `/admin/users/${r.content_author_id}` : null
  const isRemovable = r.content_type !== 'profile'

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

          {/* Author + reporters */}
          <div className="flex items-center gap-3 text-xs text-zinc-500 flex-wrap">
            {r.content_author_username && (
              <span>
                Author:{' '}
                {profileLink ? (
                  <Link href={profileLink} className="text-zinc-300 hover:text-orange-400 transition-colors">
                    @{r.content_author_username}
                  </Link>
                ) : (
                  <span className="text-zinc-300">@{r.content_author_username}</span>
                )}
                {adminUserLink && (
                  <Link href={adminUserLink} className="ml-1.5 text-zinc-600 hover:text-orange-400 transition-colors">
                    ↗
                  </Link>
                )}
              </span>
            )}
            {r.reporters.length > 0 && (
              <span>
                Reported by:{' '}
                <span className="text-zinc-400">
                  {r.reporters.slice(0, 3).map((rp, i) => (
                    <span key={i}>
                      {i > 0 && ', '}@{rp.username ?? 'unknown'}
                    </span>
                  ))}
                  {r.reporters.length > 3 && ` +${r.reporters.length - 3} more`}
                </span>
              </span>
            )}
          </div>

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
            {adminUserLink && (
              <Link
                href={adminUserLink}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors border border-zinc-700"
              >
                User profile →
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
