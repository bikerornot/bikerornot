'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  deleteModerationRejection,
  approveModerationRejection,
  testImageModeration,
  type ModerationRejectionRow,
  type ModerationTestResult,
} from '@/app/actions/moderation-rejections'
import { useRouter } from 'next/navigation'

const SURFACE_LABELS: Record<string, string> = {
  post: 'Feed Post',
  avatar: 'Avatar',
  bike_photo: 'Bike / Garage',
  event_flyer: 'Event Flyer',
  group_cover: 'Group Cover',
  classifieds: 'Classified',
}

const REASON_LABELS: Record<string, string> = {
  nudity_raw: 'Raw nudity',
  nudity_partial: 'Partial nudity',
  nudity_sexual: 'Sexual activity',
  nudity_explicit: 'Explicit',
  gore: 'Gore',
  weapon: 'Weapon',
}

function formatTimeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatExpiresIn(dateStr: string): string {
  const diff = Math.floor((new Date(dateStr).getTime() - Date.now()) / 1000)
  if (diff <= 0) return 'expired'
  if (diff < 3600) return `expires in ${Math.floor(diff / 60)}m`
  return `expires in ${Math.floor(diff / 3600)}h`
}

interface Props {
  initialRows: ModerationRejectionRow[]
}

export default function ModerationRejectionsClient({ initialRows }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<ModerationRejectionRow[]>(initialRows)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ModerationTestResult | { error: string } | null>(null)

  async function handleTest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (testing) return
    const form = e.currentTarget
    const fd = new FormData(form)
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testImageModeration(fd)
      setTestResult(result)
      // Refresh the rejection list so a freshly-blocked test image appears below
      if ('verdict' in result && result.verdict === 'rejected') router.refresh()
    } finally {
      setTesting(false)
      form.reset()
    }
  }

  async function handleDelete(id: string) {
    if (busyId) return
    setBusyId(id)
    try {
      await deleteModerationRejection(id)
      setRows((prev) => prev.filter((r) => r.id !== id))
    } finally {
      setBusyId(null)
    }
  }

  async function handleApprove(id: string) {
    if (busyId) return
    setBusyId(id)
    try {
      const res = await approveModerationRejection(id)
      if ('error' in res) {
        alert(`Approve failed: ${res.error}`)
      } else {
        setRows((prev) => prev.filter((r) => r.id !== id))
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-6 max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Moderation Rejections</h1>
        <p className="text-zinc-400 text-sm mt-0.5">
          Images blocked by the AI content filter. Stored privately for 24 hours so you can review false positives, then auto-purged.
        </p>
      </div>

      {/* Tester — upload an image and see what sightengine returns. Rejections
          land in the queue below automatically (surface = admin_test). Approved
          and pending results show inline only. */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <div>
          <h2 className="text-white font-semibold text-sm">Test an image</h2>
          <p className="text-zinc-500 text-xs mt-0.5">Upload to see what the AI moderation returns. If rejected, it appears in the queue below for review.</p>
        </div>
        <form onSubmit={handleTest} className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            name="file"
            accept="image/*"
            required
            disabled={testing}
            className="text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-300 hover:file:bg-zinc-700 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={testing}
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
          >
            {testing ? 'Testing…' : '✨ Run moderation'}
          </button>
        </form>
        {testResult && 'error' in testResult && (
          <p className="text-red-400 text-sm">{testResult.error}</p>
        )}
        {testResult && 'verdict' in testResult && (
          <div className={`rounded-lg px-3 py-2 border text-sm ${
            testResult.verdict === 'rejected' ? 'bg-red-500/10 border-red-500/30 text-red-200' :
            testResult.verdict === 'pending' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-200' :
            'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
          }`}>
            <p className="font-semibold uppercase">{testResult.verdict}{testResult.reason ? ` — ${testResult.reason}` : ''}</p>
            {testResult.scores && (
              <div className="text-xs mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5 opacity-90">
                {Object.entries(testResult.scores)
                  .filter(([, v]) => typeof v === 'number')
                  .sort((a, b) => (b[1] as number) - (a[1] as number))
                  .map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-2">
                      <span className="opacity-70">{k.replace(/_/g, ' ')}</span>
                      <span className="font-mono">{((v as number) * 100).toFixed(0)}%</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-emerald-400 text-lg font-semibold mb-1">Nothing recently rejected.</p>
          <p className="text-zinc-500 text-sm">If users are reporting blocks you're not seeing here, more than 24 hours has passed.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((r) => (
            <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
              <div className="relative aspect-[4/3] bg-zinc-800">
                {r.signed_url ? (
                  <Image
                    src={r.signed_url}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600 text-sm">file expired</div>
                )}
                <div className="absolute top-2 left-2 flex flex-wrap gap-1.5 max-w-[calc(100%-3rem)]">
                  <span className="text-[10px] font-bold bg-red-500/85 text-white px-2 py-0.5 rounded">
                    {REASON_LABELS[r.reason ?? ''] ?? r.reason ?? 'rejected'}
                  </span>
                  <span className="text-[10px] font-semibold bg-zinc-900/85 text-zinc-200 px-2 py-0.5 rounded">
                    {SURFACE_LABELS[r.surface] ?? r.surface}
                  </span>
                </div>
              </div>

              <div className="p-3 flex-1 flex flex-col gap-2">
                <div className="text-xs text-zinc-500 flex items-center gap-2 flex-wrap">
                  {r.user_username ? (
                    <Link
                      href={`/admin/users?search=${encodeURIComponent(r.user_username)}`}
                      className="text-orange-400 hover:text-orange-300"
                    >
                      @{r.user_username}
                    </Link>
                  ) : (
                    <span>unknown user</span>
                  )}
                  <span>·</span>
                  <span>{formatTimeAgo(r.created_at)}</span>
                  <span>·</span>
                  <span className="text-zinc-600">{formatExpiresIn(r.expires_at)}</span>
                </div>

                {r.scores && (
                  <div className="text-xs text-zinc-400 grid grid-cols-2 gap-x-3 gap-y-0.5">
                    {Object.entries(r.scores)
                      .filter(([, v]) => typeof v === 'number' && v > 0.05)
                      .sort((a, b) => (b[1] as number) - (a[1] as number))
                      .slice(0, 6)
                      .map(([k, v]) => (
                        <div key={k} className="flex items-baseline justify-between gap-2 truncate">
                          <span className="text-zinc-500 truncate">{k.replace(/_/g, ' ')}</span>
                          <span className="font-mono">{((v as number) * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                  </div>
                )}

                <div className="mt-auto flex gap-2">
                  <button
                    onClick={() => handleApprove(r.id)}
                    disabled={!!busyId}
                    title="False positive — allowlist this image so it goes through next time the user uploads it"
                    className="flex-1 bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-50 text-emerald-300 text-xs font-semibold py-1.5 rounded-lg transition-colors border border-emerald-500/30"
                  >
                    {busyId === r.id ? '…' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    disabled={!!busyId}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-xs font-semibold py-1.5 rounded-lg transition-colors border border-zinc-700"
                  >
                    {busyId === r.id ? '…' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
