'use client'

import { useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { getSafetyOverview, type SafetyOverview } from '@/app/actions/admin'

function formatTimeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
  return `${Math.floor(diff / 86400)} days ago`
}

export default function SafetyClient() {
  const [data, setData] = useState<SafetyOverview | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    startTransition(async () => {
      const result = await getSafetyOverview()
      setData(result)
    })
  }, [])

  if (!data && isPending) {
    return <div className="p-6"><p className="text-zinc-500 text-sm">Loading Safety Center...</p></div>
  }

  if (!data) return null

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Safety Center</h1>
        <p className="text-zinc-500 text-sm mt-0.5">What needs your attention right now</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Banned Today" value={data.bannedToday} href="/admin/users?status=banned" />
        <StatCard label="Banned This Week" value={data.bannedThisWeek} />
        <StatCard label="Auto-Bans (7d)" value={data.autoBansThisWeek} accent={data.autoBansThisWeek > 0} />
        <StatCard label="Pending Reports" value={data.pendingReports} href="/admin/reports" accent={data.pendingReports > 0} />
        <StatCard label="Pending AI Flags" value={data.pendingFlags} href="/admin/flags" accent={data.pendingFlags > 0} />
        <StatCard label="Watchlist" value={data.watchlistCount} href="/admin/watchlist" />
      </div>

      {/* Priority: Recent Auto-Bans */}
      {data.recentAutoBans.length > 0 && (
        <Section title="Auto-Bans (Last 24h)" subtitle="Review to confirm">
          <div className="space-y-2">
            {data.recentAutoBans.map((u) => (
              <div key={u.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                <div>
                  <Link href={`/admin/users/${u.id}`} className="text-sm font-semibold text-white hover:text-orange-400">
                    @{u.username ?? 'unknown'}
                  </Link>
                  <p className="text-zinc-500 text-xs mt-0.5 truncate max-w-md">{u.ban_reason}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-600 text-xs">{formatTimeAgo(u.updated_at)}</span>
                  <Link href={`/admin/users/${u.id}`} className="text-xs text-orange-400 hover:text-orange-300">Review</Link>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Priority: High-Score AI Flags */}
      {data.highScoreFlags.length > 0 && (
        <Section title="High-Confidence AI Flags" subtitle="Score 70%+">
          <div className="space-y-2">
            {data.highScoreFlags.map((f) => (
              <div key={f.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded border flex-shrink-0 ${
                    f.score >= 0.85 ? 'bg-red-500/20 text-red-400 border-red-500/30'
                    : 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                  }`}>
                    {Math.round(f.score * 100)}%
                  </span>
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${
                    f.flag_type === 'comment' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {f.flag_type === 'comment' ? 'Comment' : 'DM'}
                  </span>
                  <Link href={`/admin/users/${f.sender_id}`} className="text-sm font-semibold text-white hover:text-orange-400 flex-shrink-0">
                    @{f.sender_username ?? 'unknown'}
                  </Link>
                  <p className="text-zinc-500 text-xs truncate">{f.content.slice(0, 80)}</p>
                </div>
                <Link href="/admin/flags" className="text-xs text-orange-400 hover:text-orange-300 flex-shrink-0 ml-2">Review</Link>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Hot Reports */}
      {data.hotReports.length > 0 && (
        <Section title="Hot Reports" subtitle="Multiple reporters">
          <div className="space-y-2">
            {data.hotReports.map((r, i) => (
              <div key={i} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded">
                    {r.reporter_count}x
                  </span>
                  <span className="text-zinc-400 text-xs capitalize">{r.reported_type}</span>
                  <span className="text-zinc-500 text-xs">{r.reason}</span>
                </div>
                <Link href="/admin/reports" className="text-xs text-orange-400 hover:text-orange-300">Review</Link>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* High-Risk New Signups */}
      {data.highRiskSignups.length > 0 && (
        <Section title="High-Risk New Signups" subtitle="Last 24h — female, under 35, no phone verification">
          <div className="space-y-2">
            {data.highRiskSignups.map((u) => (
              <div key={u.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                <div>
                  <Link href={`/admin/users/${u.id}`} className="text-sm font-semibold text-white hover:text-orange-400">
                    @{u.username ?? 'unknown'}
                  </Link>
                  <p className="text-zinc-500 text-xs mt-0.5">
                    {u.first_name} {u.last_name} — {u.country ?? 'US'} — {formatTimeAgo(u.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/admin/scammer/${u.id}`} className="text-xs text-blue-400 hover:text-blue-300">Analyze</Link>
                  <Link href={`/admin/users/${u.id}`} className="text-xs text-orange-400 hover:text-orange-300">Investigate</Link>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Recent Bans */}
      <Section title="Recent Bans" subtitle="Last 10">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {data.recentBans.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-6">No recent bans</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                  <th className="text-left px-4 py-2.5 font-medium">User</th>
                  <th className="text-left px-4 py-2.5 font-medium">Reason</th>
                  <th className="text-right px-4 py-2.5 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {data.recentBans.map((u) => (
                  <tr key={u.id} className="border-b border-zinc-800/50 last:border-0">
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/users/${u.id}`} className="text-white hover:text-orange-400 font-medium">
                        @{u.username ?? 'unknown'}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500 text-xs truncate max-w-xs">{u.ban_reason ?? '—'}</td>
                    <td className="px-4 py-2.5 text-zinc-600 text-xs text-right">{formatTimeAgo(u.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Section>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <span className="text-xs text-zinc-600">{subtitle}</span>
      </div>
      {children}
    </div>
  )
}

function StatCard({ label, value, href, accent }: { label: string; value: number; href?: string; accent?: boolean }) {
  const inner = (
    <div className={`bg-zinc-900 border rounded-xl px-4 py-3 ${accent ? 'border-orange-500/30' : 'border-zinc-800'} ${href ? 'hover:bg-zinc-800/50 transition-colors' : ''}`}>
      <p className="text-zinc-500 text-xs font-medium">{label}</p>
      <p className={`text-2xl font-bold ${accent ? 'text-orange-400' : 'text-white'}`}>{value}</p>
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}
