'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getErrorLogs, clearOldErrors, type ErrorLog } from '@/app/actions/errors'

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
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function ErrorsClient() {
  const [errors, setErrors] = useState<ErrorLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const limit = 50

  useEffect(() => {
    setLoading(true)
    getErrorLogs({ source: sourceFilter || undefined, limit, offset: page * limit }).then((result) => {
      setErrors(result.errors)
      setTotal(result.total)
      setLoading(false)
    })
  }, [sourceFilter, page])

  async function handleClear() {
    if (!confirm('Delete error logs older than 30 days?')) return
    setClearing(true)
    const deleted = await clearOldErrors(30)
    setClearing(false)
    alert(`Deleted ${deleted} old error logs.`)
    // Refresh
    const result = await getErrorLogs({ source: sourceFilter || undefined, limit, offset: 0 })
    setErrors(result.errors)
    setTotal(result.total)
    setPage(0)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Error Logs</h1>
          <p className="text-zinc-500 text-sm mt-1">{total} total errors</p>
        </div>
        <button
          onClick={handleClear}
          disabled={clearing}
          className="text-sm text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50"
        >
          {clearing ? 'Clearing…' : 'Clear 30d+'}
        </button>
      </div>

      {/* Source filter pills */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'client', 'server', 'server_action', 'api'].map((src) => (
          <button
            key={src}
            onClick={() => { setSourceFilter(src); setPage(0) }}
            className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
              sourceFilter === src
                ? 'bg-orange-500 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {src || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-zinc-500 text-sm py-8 text-center">Loading…</p>
      ) : errors.length === 0 ? (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-10 text-center">
          <p className="text-zinc-500 text-sm">No errors logged.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {errors.map((err) => (
            <div
              key={err.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"
            >
              <button
                onClick={() => setExpandedId(expandedId === err.id ? null : err.id)}
                className="w-full text-left px-4 py-3 flex items-start gap-3"
              >
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${SOURCE_COLORS[err.source] ?? 'bg-zinc-700 text-zinc-400'}`}>
                  {err.source.replace('_', ' ')}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{err.message}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                    <span>{formatTime(err.created_at)}</span>
                    {err.user?.username && (
                      <Link
                        href={`/profile/${err.user.username}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-orange-400 hover:text-orange-300"
                      >
                        @{err.user.username}
                      </Link>
                    )}
                    {err.url && <span className="truncate max-w-[200px]">{err.url}</span>}
                  </div>
                </div>
                <svg
                  className={`w-4 h-4 text-zinc-500 flex-shrink-0 mt-1 transition-transform ${expandedId === err.id ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {expandedId === err.id && (
                <div className="border-t border-zinc-800 px-4 py-3 space-y-3">
                  {err.stack && (
                    <div>
                      <p className="text-zinc-500 text-xs font-medium mb-1">Stack trace</p>
                      <pre className="text-zinc-400 text-xs bg-zinc-950 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-60">{err.stack}</pre>
                    </div>
                  )}
                  {err.user_agent && (
                    <div>
                      <p className="text-zinc-500 text-xs font-medium mb-1">User agent</p>
                      <p className="text-zinc-400 text-xs break-all">{err.user_agent}</p>
                    </div>
                  )}
                  {err.metadata && Object.keys(err.metadata).length > 0 && (
                    <div>
                      <p className="text-zinc-500 text-xs font-medium mb-1">Metadata</p>
                      <pre className="text-zinc-400 text-xs bg-zinc-950 rounded-lg p-3 overflow-x-auto">{JSON.stringify(err.metadata, null, 2)}</pre>
                    </div>
                  )}
                  <div className="flex items-center gap-4 text-xs text-zinc-600">
                    <span>ID: {err.id}</span>
                    <span>{new Date(err.created_at).toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
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
