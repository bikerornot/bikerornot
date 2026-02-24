'use client'

import { useState } from 'react'
import Link from 'next/link'
import { dismissReport, actionReport, type ReportRow } from '@/app/actions/reports'

const REASON_LABELS: Record<string, string> = {
  spam:         'Spam',
  harassment:   'Harassment',
  hate_speech:  'Hate speech',
  nudity:       'Nudity / sexual content',
  violence:     'Violence',
  fake_account: 'Fake account',
  other:        'Other',
}

function formatTimeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ReportQueue({ initialReports }: { initialReports: ReportRow[] }) {
  const [reports, setReports] = useState<ReportRow[]>(initialReports)
  const [acting, setActing] = useState<string | null>(null)

  function remove(id: string) {
    setReports((prev) => prev.filter((r) => r.id !== id))
  }

  async function handleDismiss(id: string) {
    setActing(id)
    try {
      await dismissReport(id)
      remove(id)
    } finally {
      setActing(null)
    }
  }

  async function handleAction(id: string, action: 'remove_content' | 'suspend_user' | 'ban_user') {
    setActing(id)
    try {
      await actionReport(id, action)
      remove(id)
    } finally {
      setActing(null)
    }
  }

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
      {reports.map((r) => {
        const isBusy = acting === r.id
        const profileLink = r.content_author_username
          ? `/profile/${r.content_author_username}`
          : null

        return (
          <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            {/* Report meta */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    r.reported_type === 'profile'
                      ? 'bg-purple-500/20 text-purple-300'
                      : r.reported_type === 'post'
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'bg-zinc-700 text-zinc-300'
                  }`}>
                    {r.reported_type}
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300">
                    {REASON_LABELS[r.reason] ?? r.reason}
                  </span>
                </div>
                <p className="text-zinc-500 text-xs">
                  Reported by{' '}
                  <span className="text-zinc-300">@{r.reporter?.username ?? 'unknown'}</span>
                  {' · '}{formatTimeAgo(r.created_at)}
                </p>
              </div>
            </div>

            {/* Reported content preview */}
            <div className="bg-zinc-800 rounded-xl p-3 space-y-1">
              {r.content_author_username && (
                <p className="text-xs text-zinc-500">
                  Author:{' '}
                  {profileLink ? (
                    <Link href={profileLink} className="text-zinc-300 hover:text-orange-400 transition-colors">
                      @{r.content_author_username}
                    </Link>
                  ) : (
                    <span className="text-zinc-300">@{r.content_author_username}</span>
                  )}
                </p>
              )}
              {r.content_preview ? (
                <p className="text-sm text-zinc-200 leading-relaxed">
                  {r.content_preview}
                  {r.content_preview.length === 120 && <span className="text-zinc-500">…</span>}
                </p>
              ) : (
                <p className="text-sm text-zinc-500 italic">Content not found (may have been deleted)</p>
              )}
            </div>

            {/* Reporter's additional details */}
            {r.details && (
              <p className="text-sm text-zinc-400 italic">"{r.details}"</p>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleDismiss(r.id)}
                disabled={isBusy}
                className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 text-xs font-semibold px-4 py-2 rounded-lg transition-colors border border-zinc-700"
              >
                Dismiss
              </button>
              {r.reported_type !== 'profile' && (
                <button
                  onClick={() => handleAction(r.id, 'remove_content')}
                  disabled={isBusy}
                  className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-red-400 hover:text-red-300 text-xs font-semibold px-4 py-2 rounded-lg transition-colors border border-zinc-700"
                >
                  Remove content
                </button>
              )}
              <button
                onClick={() => handleAction(r.id, 'suspend_user')}
                disabled={isBusy}
                className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-orange-400 hover:text-orange-300 text-xs font-semibold px-4 py-2 rounded-lg transition-colors border border-zinc-700"
              >
                Suspend user
              </button>
              <button
                onClick={() => handleAction(r.id, 'ban_user')}
                disabled={isBusy}
                className="bg-red-900/40 hover:bg-red-900/60 disabled:opacity-40 text-red-400 text-xs font-semibold px-4 py-2 rounded-lg transition-colors border border-red-800/50"
              >
                Ban user
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
