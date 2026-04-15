'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  listGameReports,
  restoreGamePhoto,
  keepOutGamePhoto,
  type ReportedPhoto,
  type ReportReason,
} from '@/app/actions/game-reports'

const REASON_LABELS: Record<ReportReason, string> = {
  wrong_year: 'Wrong year',
  wrong_make: 'Wrong make',
  wrong_model: 'Wrong model',
  bad_angle: 'Photo is not a good angle',
  multiple_bikes: 'Multiple bikes in photo',
}
function reasonLabel(r: ReportReason): string {
  return REASON_LABELS[r]
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

function bikePhotoUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/bikes/${path}`
}

interface Props {
  initialReports: ReportedPhoto[]
}

export default function GameReportsClient({ initialReports }: Props) {
  const [reports, setReports] = useState<ReportedPhoto[]>(initialReports)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function refresh() {
    const fresh = await listGameReports()
    setReports(fresh)
  }

  async function handleRestore(photoId: string) {
    if (busyId) return
    setBusyId(photoId)
    try {
      await restoreGamePhoto(photoId)
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function handleKeepOut(photoId: string) {
    if (busyId) return
    setBusyId(photoId)
    try {
      await keepOutGamePhoto(photoId)
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Game Photo Reports</h1>
          <p className="text-zinc-400 text-sm mt-0.5">Quarantined photos awaiting admin decision.</p>
        </div>
        <span className="text-zinc-500 text-sm">{reports.length} open</span>
      </div>

      {reports.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-emerald-400 text-lg font-semibold mb-1">No open reports</p>
          <p className="text-zinc-500 text-sm">Every reported photo has been resolved.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.bike_photo_id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="flex flex-col sm:flex-row">
                <div className="relative w-full sm:w-64 aspect-[4/3] sm:aspect-auto bg-zinc-800 flex-shrink-0">
                  <Image
                    src={bikePhotoUrl(r.storage_path)}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, 256px"
                  />
                </div>
                <div className="flex-1 p-4 flex flex-col gap-3">
                  <div>
                    <p className="text-white font-semibold">
                      {r.bike ? `${r.bike.year ?? '?'} ${r.bike.make ?? ''} ${r.bike.model ?? ''}`.trim() : 'Unknown bike'}
                    </p>
                    {r.owner?.username && (
                      <p className="text-zinc-500 text-sm mt-0.5">
                        Owner:{' '}
                        <Link href={`/admin/users?search=${encodeURIComponent(r.owner.username)}`} className="text-orange-400 hover:text-orange-300">
                          @{r.owner.username}
                        </Link>
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-1.5">
                      {r.report_count} report{r.report_count === 1 ? '' : 's'}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {r.reasons.map((rs) => (
                        <span
                          key={rs.reason}
                          className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded-full border border-zinc-700"
                        >
                          {reasonLabel(rs.reason)} {rs.count > 1 ? `× ${rs.count}` : ''}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="text-xs text-zinc-500">
                    Reported by:{' '}
                    {r.reporters
                      .filter((rep, idx, arr) => arr.findIndex((x) => x.username === rep.username) === idx)
                      .map((rep) => rep.username ?? '?')
                      .join(', ')}
                  </div>

                  <div className="flex gap-2 mt-auto pt-2">
                    <button
                      onClick={() => handleRestore(r.bike_photo_id)}
                      disabled={!!busyId}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
                    >
                      {busyId === r.bike_photo_id ? '…' : 'Restore to Game'}
                    </button>
                    <button
                      onClick={() => handleKeepOut(r.bike_photo_id)}
                      disabled={!!busyId}
                      className="flex-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-sm font-semibold py-2 rounded-lg transition-colors border border-zinc-700"
                    >
                      {busyId === r.bike_photo_id ? '…' : 'Keep Out'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
