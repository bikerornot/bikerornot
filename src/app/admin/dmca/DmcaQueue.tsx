'use client'

import { useState } from 'react'
import { updateDmcaStatus, removeContentForDmca, forwardAndRestoreCounterNotice, dismissCounterNotice, type RemoveResult } from '@/app/actions/dmca'
import type { DmcaCounterNotice } from '@/lib/supabase/types'

interface DmcaNotice {
  id: string
  full_name: string
  email: string
  address: string
  phone: string | null
  relationship: 'owner' | 'authorized_rep'
  work_description: string
  infringing_urls: string
  good_faith_belief: boolean
  accuracy_statement: boolean
  electronic_signature: string
  status: 'received' | 'reviewing' | 'actioned' | 'dismissed'
  notes: string | null
  created_at: string
  reviewed_at: string | null
}

const STATUS_COLORS: Record<string, string> = {
  received:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  reviewing: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  actioned:  'bg-green-500/15 text-green-400 border-green-500/30',
  dismissed: 'bg-zinc-700/50 text-zinc-400 border-zinc-700',
}

const CN_STATUS_COLORS: Record<string, string> = {
  received:  'bg-amber-500/15 text-amber-400 border-amber-500/30',
  forwarded: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  restored:  'bg-green-500/15 text-green-400 border-green-500/30',
  dismissed: 'bg-zinc-700/50 text-zinc-400 border-zinc-700',
}

function parseUrl(url: string): { type: 'post' | 'profile' | 'unknown'; label: string } {
  const trimmed = url.trim()
  if (/\/posts\/[0-9a-f-]{36}/i.test(trimmed)) return { type: 'post', label: 'Post' }
  if (/\/profile\/[a-zA-Z0-9_.-]+/.test(trimmed)) {
    const match = trimmed.match(/\/profile\/([a-zA-Z0-9_.-]+)/)
    return { type: 'profile', label: `Profile (@${match?.[1] ?? '...'})` }
  }
  return { type: 'unknown', label: 'Unknown URL' }
}

function UrlRow({ url, noticeId, onRemoved }: {
  url: string
  noticeId: string
  onRemoved: (result: RemoveResult) => void
}) {
  const [confirm, setConfirm] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removed, setRemoved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed = parseUrl(url)
  const canRemove = parsed.type !== 'unknown'

  async function handleRemove() {
    setRemoving(true)
    setError(null)
    try {
      const result = await removeContentForDmca(url)
      await updateDmcaStatus(noticeId, 'actioned')
      setRemoved(true)
      setConfirm(false)
      onRemoved(result)
    } catch (e: any) {
      setError(e.message ?? 'Failed to remove content')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2">
        <a
          href={url.trim()}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 text-orange-400 hover:text-orange-300 text-xs font-mono break-all leading-relaxed"
        >
          {url.trim()}
        </a>

        {canRemove && !removed && !confirm && (
          <button
            onClick={() => setConfirm(true)}
            className="flex-shrink-0 px-2.5 py-1 bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 rounded-lg text-xs font-semibold transition-colors"
          >
            Remove
          </button>
        )}

        {removed && (
          <span className="flex-shrink-0 px-2.5 py-1 bg-green-500/15 text-green-400 border border-green-500/30 rounded-lg text-xs font-semibold">
            ✓ Removed
          </span>
        )}
      </div>

      {confirm && !removed && (
        <div className="ml-0 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5 space-y-2">
          <p className="text-red-300 text-xs leading-relaxed">
            {parsed.type === 'post'
              ? 'This will permanently delete the post. This cannot be undone.'
              : `This will suspend the user's account. You can reinstate them later from the Users panel.`}
            {' '}The notice will automatically be marked as Actioned.
          </p>
          {error && (
            <div className="bg-red-500/20 border border-red-500/40 rounded-lg px-3 py-2">
              <p className="text-red-300 text-xs font-semibold">Error: {error}</p>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleRemove}
              disabled={removing}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors"
            >
              {removing ? 'Removing…' : parsed.type === 'post' ? 'Delete Post' : 'Suspend User'}
            </button>
            <button
              onClick={() => { setConfirm(false); setError(null) }}
              disabled={removing}
              className="px-3 py-1.5 text-zinc-400 hover:text-white text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function CounterNoticeCard({
  cn,
  onAction,
}: {
  cn: DmcaCounterNotice
  onAction: (id: string, newStatus: DmcaCounterNotice['status']) => void
}) {
  const [confirm, setConfirm] = useState<'restore' | 'dismiss' | null>(null)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  async function handleRestore() {
    setActing(true)
    setError(null)
    try {
      await forwardAndRestoreCounterNotice(cn.id, cn.original_url)
      onAction(cn.id, 'restored')
      setConfirm(null)
    } catch (e: any) {
      setError(e.message ?? 'Failed to restore content')
    } finally {
      setActing(false)
    }
  }

  async function handleDismiss() {
    setActing(true)
    setError(null)
    try {
      await dismissCounterNotice(cn.id)
      onAction(cn.id, 'dismissed')
      setConfirm(null)
    } catch (e: any) {
      setError(e.message ?? 'Failed to dismiss')
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-amber-500/10 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white text-xs font-semibold">{cn.full_name}</span>
            <span className="text-zinc-500 text-xs">{cn.email}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${CN_STATUS_COLORS[cn.status]}`}>
              {cn.status}
            </span>
          </div>
          <p className="text-amber-400/70 text-xs mt-0.5 font-mono truncate">{cn.original_url}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-zinc-600 text-xs">
            {new Date(cn.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
          <svg
            className={`w-3.5 h-3.5 text-zinc-500 mt-1 ml-auto transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-amber-500/20 p-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-zinc-500 uppercase tracking-wide mb-1">Contact</p>
              <p className="text-white">{cn.full_name}</p>
              <p className="text-zinc-300">{cn.email}</p>
              {cn.phone && <p className="text-zinc-300">{cn.phone}</p>}
              <p className="text-zinc-400 text-xs mt-1">{cn.address}</p>
            </div>
            <div>
              <p className="text-zinc-500 uppercase tracking-wide mb-1">Original URL</p>
              <a
                href={cn.original_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-400 hover:text-orange-300 font-mono break-all"
              >
                {cn.original_url}
              </a>
            </div>
          </div>

          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Content description</p>
            <p className="text-zinc-300 text-xs leading-relaxed bg-zinc-800 rounded-lg p-3">
              {cn.removed_content_description}
            </p>
          </div>

          <div className="flex gap-4 text-xs text-zinc-400">
            <span>✅ Good faith: <span className={cn.good_faith_statement ? 'text-green-400' : 'text-red-400'}>{cn.good_faith_statement ? 'Yes' : 'No'}</span></span>
            <span>✅ Jurisdiction: <span className={cn.jurisdiction_consent ? 'text-green-400' : 'text-red-400'}>{cn.jurisdiction_consent ? 'Yes' : 'No'}</span></span>
          </div>

          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Signature</p>
            <p className="text-zinc-300 text-xs italic">{cn.electronic_signature}</p>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/40 rounded-lg px-3 py-2">
              <p className="text-red-300 text-xs font-semibold">Error: {error}</p>
            </div>
          )}

          {cn.status === 'received' && confirm === null && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={() => setConfirm('restore')}
                className="px-3 py-1.5 bg-green-500/15 hover:bg-green-500/25 text-green-400 border border-green-500/30 rounded-lg text-xs font-semibold transition-colors"
              >
                Forward &amp; Restore
              </button>
              <button
                onClick={() => setConfirm('dismiss')}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700 rounded-lg text-xs font-semibold transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}

          {confirm === 'restore' && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-3 space-y-2">
              <p className="text-green-300 text-xs leading-relaxed">
                This will restore the content and mark this counter-notice as Restored.
                Per 17 U.S.C. § 512(g)(3), you should forward this notice to the original complainant
                — they then have 10–14 business days to seek a court order before the content is restored.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleRestore}
                  disabled={acting}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors"
                >
                  {acting ? 'Processing…' : 'Confirm Restore'}
                </button>
                <button
                  onClick={() => setConfirm(null)}
                  disabled={acting}
                  className="px-3 py-1.5 text-zinc-400 hover:text-white text-xs transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {confirm === 'dismiss' && (
            <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-3 space-y-2">
              <p className="text-zinc-300 text-xs leading-relaxed">
                Dismiss this counter-notice without restoring content?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDismiss}
                  disabled={acting}
                  className="px-3 py-1.5 bg-zinc-600 hover:bg-zinc-500 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors"
                >
                  {acting ? '…' : 'Confirm Dismiss'}
                </button>
                <button
                  onClick={() => setConfirm(null)}
                  disabled={acting}
                  className="px-3 py-1.5 text-zinc-400 hover:text-white text-xs transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function DmcaQueue({
  initialNotices,
  initialCounterNotices,
}: {
  initialNotices: DmcaNotice[]
  initialCounterNotices: DmcaCounterNotice[]
}) {
  const [notices, setNotices] = useState(initialNotices)
  const [counterNotices, setCounterNotices] = useState(initialCounterNotices)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [updating, setUpdating] = useState<string | null>(null)
  const [removedContent, setRemovedContent] = useState<Record<string, RemoveResult[]>>({})

  async function handleUpdate(id: string, status: 'reviewing' | 'actioned' | 'dismissed') {
    setUpdating(id)
    try {
      await updateDmcaStatus(id, status, notes[id])
      setNotices((prev) =>
        prev.map((n) =>
          n.id === id
            ? { ...n, status, notes: notes[id] ?? n.notes, reviewed_at: new Date().toISOString() }
            : n
        )
      )
    } catch {
      alert('Failed to update. Please try again.')
    } finally {
      setUpdating(null)
    }
  }

  function handleContentRemoved(noticeId: string, result: RemoveResult) {
    setNotices((prev) =>
      prev.map((n) =>
        n.id === noticeId
          ? { ...n, status: 'actioned', reviewed_at: new Date().toISOString() }
          : n
      )
    )
    setRemovedContent((prev) => ({
      ...prev,
      [noticeId]: [...(prev[noticeId] ?? []), result],
    }))
  }

  function handleCounterNoticeAction(id: string, newStatus: DmcaCounterNotice['status']) {
    setCounterNotices((prev) =>
      prev.map((cn) =>
        cn.id === id
          ? { ...cn, status: newStatus, reviewed_at: new Date().toISOString() }
          : cn
      )
    )
  }

  if (notices.length === 0) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-12 text-center">
        <p className="text-zinc-400">No DMCA notices on file.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {notices.map((notice) => {
        // Counter-notices linked to this notice
        const linked = counterNotices.filter((cn) => cn.original_notice_id === notice.id)
        // Also counter-notices with matching URL (if no original_notice_id)
        const urlLinked = counterNotices.filter(
          (cn) =>
            !cn.original_notice_id &&
            notice.infringing_urls.split('\n').some((u) => u.trim() === cn.original_url.trim())
        )
        const allLinked = [...linked, ...urlLinked]

        return (
          <div key={notice.id} className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            {/* Summary row */}
            <button
              className="w-full flex items-start gap-4 p-4 text-left hover:bg-zinc-800/50 transition-colors"
              onClick={() => setExpanded(expanded === notice.id ? null : notice.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-white font-semibold text-sm">{notice.full_name}</span>
                  <span className="text-zinc-500 text-xs">{notice.email}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[notice.status]}`}>
                    {notice.status}
                  </span>
                  {(removedContent[notice.id]?.length ?? 0) > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full border bg-green-500/15 text-green-400 border-green-500/30 font-medium">
                      {removedContent[notice.id].length} removed
                    </span>
                  )}
                  {allLinked.length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full border bg-amber-500/15 text-amber-400 border-amber-500/30 font-medium">
                      {allLinked.length} counter-notice{allLinked.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <p className="text-zinc-400 text-xs line-clamp-1">{notice.work_description}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-zinc-500 text-xs">
                  {new Date(notice.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </p>
                <svg
                  className={`w-4 h-4 text-zinc-500 mt-1 ml-auto transition-transform ${expanded === notice.id ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Expanded detail */}
            {expanded === notice.id && (
              <div className="border-t border-zinc-800 p-5 space-y-5">

                {/* Contact + relationship */}
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Contact</p>
                    <p className="text-white">{notice.full_name}</p>
                    <p className="text-zinc-300">{notice.email}</p>
                    {notice.phone && <p className="text-zinc-300">{notice.phone}</p>}
                    <p className="text-zinc-400 text-xs mt-1">{notice.address}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Relationship</p>
                    <p className="text-zinc-300">
                      {notice.relationship === 'owner' ? 'Copyright owner' : 'Authorized representative'}
                    </p>
                    <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1 mt-3">Signature</p>
                    <p className="text-zinc-300 italic">{notice.electronic_signature}</p>
                  </div>
                </div>

                {/* Copyrighted work */}
                <div>
                  <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Copyrighted work described</p>
                  <p className="text-zinc-300 text-sm leading-relaxed bg-zinc-800 rounded-lg p-3">
                    {notice.work_description}
                  </p>
                </div>

                {/* Infringing URLs with remove buttons */}
                <div>
                  <p className="text-zinc-500 text-xs uppercase tracking-wide mb-2">
                    Infringing URLs — click Remove to delete the content
                  </p>
                  <div className="bg-zinc-800 rounded-lg p-3 space-y-3">
                    {notice.infringing_urls.split('\n').filter(Boolean).map((url, i) => (
                      <UrlRow
                        key={i}
                        url={url}
                        noticeId={notice.id}
                        onRemoved={(result) => handleContentRemoved(notice.id, result)}
                      />
                    ))}
                  </div>
                </div>

                {/* Attestations */}
                <div className="flex gap-4 text-sm text-zinc-400">
                  <span>✅ Good faith: <span className={notice.good_faith_belief ? 'text-green-400' : 'text-red-400'}>{notice.good_faith_belief ? 'Yes' : 'No'}</span></span>
                  <span>✅ Under perjury: <span className={notice.accuracy_statement ? 'text-green-400' : 'text-red-400'}>{notice.accuracy_statement ? 'Yes' : 'No'}</span></span>
                </div>

                {/* Counter-notices linked to this takedown */}
                {allLinked.length > 0 && (
                  <div>
                    <p className="text-zinc-500 text-xs uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Counter-Notices ({allLinked.length})
                    </p>
                    <div className="space-y-2">
                      {allLinked.map((cn) => (
                        <CounterNoticeCard
                          key={cn.id}
                          cn={cn}
                          onAction={handleCounterNoticeAction}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Admin notes + status actions */}
                <div className="border-t border-zinc-800 pt-4 space-y-3">
                  <div>
                    <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1.5">
                      Admin notes (optional)
                    </label>
                    <textarea
                      value={notes[notice.id] ?? notice.notes ?? ''}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [notice.id]: e.target.value }))}
                      rows={2}
                      placeholder="Internal notes about this notice…"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleUpdate(notice.id, 'reviewing')}
                      disabled={updating === notice.id || notice.status === 'reviewing'}
                      className="px-4 py-2 bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-400 border border-yellow-500/30 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40"
                    >
                      Mark Reviewing
                    </button>
                    <button
                      onClick={() => handleUpdate(notice.id, 'actioned')}
                      disabled={updating === notice.id || notice.status === 'actioned'}
                      className="px-4 py-2 bg-green-500/15 hover:bg-green-500/25 text-green-400 border border-green-500/30 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40"
                    >
                      Mark Actioned
                    </button>
                    <button
                      onClick={() => handleUpdate(notice.id, 'dismissed')}
                      disabled={updating === notice.id || notice.status === 'dismissed'}
                      className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40"
                    >
                      Dismiss
                    </button>
                  </div>
                  {notice.reviewed_at && (
                    <p className="text-zinc-600 text-xs">
                      Last updated {new Date(notice.reviewed_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </p>
                  )}
                </div>

              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
