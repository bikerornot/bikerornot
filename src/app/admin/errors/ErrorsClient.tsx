'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  getErrorIssues,
  getIssueOccurrences,
  resolveIssue,
  reopenIssue,
  clearResolvedErrors,
  type ErrorIssue,
  type ErrorLog,
} from '@/app/actions/errors'

const SOURCE_COLORS: Record<string, string> = {
  client: 'bg-blue-500/20 text-blue-400',
  server: 'bg-red-500/20 text-red-400',
  server_action: 'bg-orange-500/20 text-orange-400',
  api: 'bg-purple-500/20 text-purple-400',
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  const now = Date.now()
  const diff = Math.floor((now - d.getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function copyOccurrence(issue: ErrorIssue, log: ErrorLog) {
  const lines: string[] = []
  lines.push(`${issue.occurrence_count}x ${issue.source} ${issue.message}`)
  if (log.url) lines.push(log.url)
  if (log.stack) lines.push(log.stack)
  if (log.user_agent) lines.push(log.user_agent)
  if (log.metadata && Object.keys(log.metadata).length > 0) {
    lines.push(JSON.stringify(log.metadata, null, 2))
  }
  navigator.clipboard.writeText(lines.join('\n'))
}

function IssueRow({ issue, onStatusChange }: { issue: ErrorIssue; onStatusChange: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [occurrences, setOccurrences] = useState<ErrorLog[] | null>(null)
  const [loadingOccurrences, setLoadingOccurrences] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  async function handleExpand() {
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    if (!occurrences) {
      setLoadingOccurrences(true)
      const logs = await getIssueOccurrences(issue.id)
      setOccurrences(logs)
      setLoadingOccurrences(false)
    }
  }

  async function handleToggleStatus() {
    setToggling(true)
    try {
      if (issue.status === 'open') {
        await resolveIssue(issue.id)
      } else {
        await reopenIssue(issue.id)
      }
      onStatusChange()
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className={`bg-zinc-900 border rounded-xl overflow-hidden ${
      issue.status === 'resolved' ? 'border-zinc-800/50 opacity-60' : 'border-zinc-800'
    }`}>
      {/* Issue header */}
      <div className="flex items-start gap-3 px-4 py-3">
        <button onClick={handleExpand} className="flex-1 text-left flex items-start gap-3 min-w-0">
          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${SOURCE_COLORS[issue.source] ?? 'bg-zinc-700 text-zinc-400'}`}>
            {issue.source.replace('_', ' ')}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{issue.message}</p>
            <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500 flex-wrap">
              <span className="text-orange-400 font-semibold">{issue.occurrence_count}x</span>
              <span>Last: {formatTime(issue.last_seen_at)}</span>
              <span>First: {formatTime(issue.first_seen_at)}</span>
              {issue.status === 'resolved' && issue.resolved_by_user?.username && (
                <span className="text-emerald-400">
                  Resolved by @{issue.resolved_by_user.username}
                </span>
              )}
            </div>
          </div>
          <svg
            className={`w-4 h-4 text-zinc-500 flex-shrink-0 mt-1 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Resolve / Reopen button */}
        <button
          onClick={handleToggleStatus}
          disabled={toggling}
          className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 ${
            issue.status === 'open'
              ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
              : 'bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          {toggling ? '...' : issue.status === 'open' ? 'Resolve' : 'Reopen'}
        </button>
      </div>

      {/* Expanded: individual occurrences */}
      {expanded && (
        <div className="border-t border-zinc-800">
          {loadingOccurrences ? (
            <p className="text-zinc-500 text-xs py-4 text-center">Loading occurrences...</p>
          ) : occurrences && occurrences.length > 0 ? (
            <div className="divide-y divide-zinc-800/50">
              {occurrences.map((log) => (
                <div key={log.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-center gap-3 text-xs text-zinc-500">
                    <span>{formatTime(log.created_at)}</span>
                    {log.user?.username && (
                      <Link
                        href={`/profile/${log.user.username}`}
                        className="text-orange-400 hover:text-orange-300"
                      >
                        @{log.user.username}
                      </Link>
                    )}
                    {log.url && <span className="truncate max-w-[250px]">{log.url}</span>}
                    <button
                      onClick={() => {
                        copyOccurrence(issue, log)
                        setCopied(log.id)
                        setTimeout(() => setCopied(null), 1500)
                      }}
                      className="ml-auto text-zinc-600 hover:text-orange-400 transition-colors flex-shrink-0"
                      title="Copy error details"
                    >
                      {copied === log.id ? (
                        <span className="text-emerald-400 text-[11px] font-medium">Copied</span>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <rect x="9" y="9" width="13" height="13" rx="2" />
                          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {log.stack && (
                    <pre className="text-zinc-400 text-xs bg-zinc-950 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-40">{log.stack}</pre>
                  )}
                  {log.user_agent && (
                    <p className="text-zinc-600 text-[11px] break-all">{log.user_agent}</p>
                  )}
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <pre className="text-zinc-500 text-[11px] bg-zinc-950 rounded p-2 overflow-x-auto">{JSON.stringify(log.metadata, null, 2)}</pre>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-zinc-500 text-xs py-4 text-center">No occurrences found</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function ErrorsClient() {
  const [issues, setIssues] = useState<ErrorIssue[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<'open' | 'resolved' | ''>('open')
  const [page, setPage] = useState(0)
  const [clearing, setClearing] = useState(false)
  const limit = 50

  function loadIssues() {
    setLoading(true)
    getErrorIssues({
      source: sourceFilter || undefined,
      status: (statusFilter || undefined) as 'open' | 'resolved' | undefined,
      limit,
      offset: page * limit,
    }).then((result) => {
      setIssues(result.issues)
      setTotal(result.total)
      setLoading(false)
    })
  }

  useEffect(() => {
    loadIssues()
  }, [sourceFilter, statusFilter, page])

  async function handleClear() {
    if (!confirm('Delete resolved error issues older than 30 days?')) return
    setClearing(true)
    const deleted = await clearResolvedErrors(30)
    setClearing(false)
    alert(`Deleted ${deleted} resolved issues.`)
    loadIssues()
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Error Issues</h1>
          <p className="text-zinc-500 text-sm mt-1">{total} {statusFilter || 'total'} issues</p>
        </div>
        <button
          onClick={handleClear}
          disabled={clearing}
          className="text-sm text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50"
        >
          {clearing ? 'Clearing...' : 'Clear resolved 30d+'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-4 flex-wrap">
        {/* Status filter */}
        <div className="flex gap-1.5">
          {(['open', 'resolved', ''] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(0) }}
              className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                statusFilter === s
                  ? 'bg-orange-500 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {s === '' ? 'All' : s === 'open' ? 'Open' : 'Resolved'}
            </button>
          ))}
        </div>

        {/* Source filter */}
        <div className="flex gap-1.5">
          {['', 'client', 'server', 'server_action', 'api'].map((src) => (
            <button
              key={src}
              onClick={() => { setSourceFilter(src); setPage(0) }}
              className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                sourceFilter === src
                  ? 'bg-zinc-700 text-white'
                  : 'bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {src || 'All sources'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-zinc-500 text-sm py-8 text-center">Loading...</p>
      ) : issues.length === 0 ? (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-10 text-center">
          <p className="text-zinc-500 text-sm">
            {statusFilter === 'open' ? 'No open error issues.' : 'No error issues found.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {issues.map((issue) => (
            <IssueRow key={issue.id} issue={issue} onStatusChange={loadIssues} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="text-sm text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-zinc-500">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="text-sm text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
