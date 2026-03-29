'use client'

import { useState, useEffect, useTransition } from 'react'
import { getKpiData, type KpiData, type TrendPoint } from '@/app/actions/kpis'

const RANGES = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatPercent(n: number): string {
  return (n * 100).toFixed(1) + '%'
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s}s`
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

export default function KpisClient() {
  const [range, setRange] = useState(30)
  const [data, setData] = useState<KpiData | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchData(range)
  }, [range])

  function fetchData(days: number) {
    setError(null)
    const end = new Date()
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
    startTransition(async () => {
      try {
        const result = await getKpiData(formatDate(start), formatDate(end))
        setData(result)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load KPIs')
      }
    })
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">KPI Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Google Analytics + Supabase combined metrics</p>
        </div>
      </div>
      <div className="sticky top-0 z-30 bg-zinc-950 py-3 -mx-6 px-6 mb-4 border-b border-zinc-800/50">
        <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-1 w-fit">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setRange(r.days)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                range === r.days
                  ? 'bg-orange-500 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {isPending && !data && (
        <p className="text-zinc-500 text-sm py-12 text-center">Loading KPIs...</p>
      )}

      {data && (
        <div className="space-y-6">
          {/* Traffic — from Google Analytics */}
          <Section title="Traffic" subtitle="Google Analytics">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard label="Unique Visitors" value={formatNumber(data.visitors)} />
              <KpiCard label="Sessions" value={formatNumber(data.sessions)} />
              <KpiCard label="Bounce Rate" value={formatPercent(data.bounceRate)} muted={data.bounceRate > 0.6} />
              <KpiCard label="Avg Session" value={formatDuration(data.avgSessionDuration)} />
            </div>
          </Section>

          {/* Growth — combined */}
          <Section title="Growth" subtitle="GA + Supabase">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard label="New Signups" value={formatNumber(data.newSignups)} />
              <KpiCard
                label="Visitor → Signup"
                value={formatPercent(data.visitorToSignupRate)}
                good={data.visitorToSignupRate > 0.02}
              />
              <KpiCard label="Onboarding Completed" value={formatNumber(data.onboardingCompleted)} />
              <KpiCard
                label="Onboarding Rate"
                value={formatPercent(data.onboardingCompleteRate)}
                good={data.onboardingCompleteRate > 0.7}
              />
            </div>
          </Section>

          {/* Active Users — Supabase */}
          <Section title="Active Users" subtitle="Supabase">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard label="DAU" value={formatNumber(data.dau)} />
              <KpiCard label="WAU" value={formatNumber(data.wau)} />
              <KpiCard label="MAU" value={formatNumber(data.mau)} />
              <KpiCard
                label="Stickiness (DAU/MAU)"
                value={formatPercent(data.stickiness)}
                good={data.stickiness > 0.2}
              />
            </div>
          </Section>

          {/* Engagement — GA + Supabase */}
          <Section title="Engagement" subtitle="GA + Supabase">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard label="Total Actions" value={formatNumber(data.totalActions)} />
              <KpiCard
                label="Actions / Session"
                value={data.actionsPerSession.toFixed(2)}
                good={data.actionsPerSession > 1}
              />
              <KpiCard label="Posts / Active User / Day" value={data.postsPerActiveUser.toFixed(2)} />
              <KpiCard
                label="Lurker Rate"
                value={formatPercent(data.lurkerRate)}
                muted={data.lurkerRate > 0.7}
              />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              <KpiCard label="Posts" value={formatNumber(data.postsInRange)} />
              <KpiCard label="Comments" value={formatNumber(data.commentsInRange)} />
              <KpiCard label="Likes" value={formatNumber(data.likesInRange)} />
              <KpiCard
                label="FR Acceptance Rate"
                value={formatPercent(data.friendAcceptanceRate)}
                good={data.friendAcceptanceRate > 0.5}
              />
            </div>
          </Section>

          {/* Retention — Supabase */}
          <Section title="Retention" subtitle={`Cohort: ${data.retention.cohortSize} signups in range`}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                label="Day 1 Return"
                value={formatPercent(data.retention.day1Rate)}
                good={data.retention.day1Rate > 0.4}
              />
              <KpiCard
                label="Day 7 Return"
                value={formatPercent(data.retention.day7Rate)}
                good={data.retention.day7Rate > 0.2}
              />
              <KpiCard
                label="Day 30 Return"
                value={formatPercent(data.retention.day30Rate)}
                good={data.retention.day30Rate > 0.1}
              />
              <KpiCard
                label="Friended within 7d"
                value={formatPercent(data.retention.friendConnectionRate)}
                good={data.retention.friendConnectionRate > 0.3}
              />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              <KpiCard
                label="Returned D1"
                value={`${data.retention.day1Return} / ${data.retention.cohortSize}`}
              />
              <KpiCard
                label="Returned D7"
                value={`${data.retention.day7Return} / ${data.retention.cohortSize}`}
              />
              <KpiCard
                label="Returned D30"
                value={`${data.retention.day30Return} / ${data.retention.cohortSize}`}
              />
              <KpiCard
                label="Time to First Friend"
                value={data.retention.medianHoursToFirstFriend != null
                  ? data.retention.medianHoursToFirstFriend < 24
                    ? `${Math.round(data.retention.medianHoursToFirstFriend)}h`
                    : `${(data.retention.medianHoursToFirstFriend / 24).toFixed(1)}d`
                  : 'N/A'
                }
              />
            </div>
          </Section>

          {/* Network Health — Supabase */}
          <Section title="Network Health" subtitle="Supabase">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <KpiCard label="Total Users" value={formatNumber(data.totalUsers)} />
              <KpiCard label="Friendships" value={formatNumber(data.totalFriendships)} />
              <KpiCard
                label="Avg Friends / User"
                value={data.avgFriendsPerUser.toFixed(1)}
                good={data.avgFriendsPerUser > 3}
              />
              <KpiCard label="Groups" value={formatNumber(data.totalGroups)} />
              <KpiCard label="Median Posts / User / Wk" value={data.medianPostsPerUserPerWeek.toString()} />
            </div>
          </Section>

          {/* Trends — sparklines */}
          <Section title="Trends" subtitle="Daily over selected range">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {data.trends.signups.length > 1 && (
                <TrendCard label="Daily Signups" data={data.trends.signups} />
              )}
              {data.trends.posts.length > 1 && (
                <TrendCard label="Daily Posts" data={data.trends.posts} />
              )}
              {data.trends.sessions.length > 1 && (
                <TrendCard label="Daily Sessions (GA)" data={data.trends.sessions} />
              )}
            </div>
          </Section>

          {/* Device Breakdown — GA */}
          {data.devices.length > 0 && (
            <Section title="Devices" subtitle="Google Analytics">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {data.devices.map((d, i) => (
                  <KpiCard
                    key={i}
                    label={d.device.charAt(0).toUpperCase() + d.device.slice(1)}
                    value={`${formatPercent(d.percentage)} (${formatNumber(d.sessions)})`}
                  />
                ))}
              </div>
            </Section>
          )}

          {/* Top Landing Pages — GA */}
          {data.topPages.length > 0 && (
            <Section title="Top Pages" subtitle="Google Analytics">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                      <th className="text-left px-4 py-2.5 font-medium">Page</th>
                      <th className="text-right px-4 py-2.5 font-medium">Views</th>
                      <th className="text-right px-4 py-2.5 font-medium">Users</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topPages.map((p, i) => (
                      <tr key={i} className="border-b border-zinc-800/50 last:border-0">
                        <td className="px-4 py-2.5 text-zinc-300 font-mono text-xs">{p.path}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-400">{p.pageviews.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-400">{p.users.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Bounce Rate by Page — GA */}
          {data.bounceByPage.length > 0 && (
            <Section title="Bounce Rate by Page" subtitle="Google Analytics">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                      <th className="text-left px-4 py-2.5 font-medium">Page</th>
                      <th className="text-right px-4 py-2.5 font-medium">Sessions</th>
                      <th className="text-right px-4 py-2.5 font-medium">Bounce Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bounceByPage.map((p, i) => (
                      <tr key={i} className="border-b border-zinc-800/50 last:border-0">
                        <td className="px-4 py-2.5 text-zinc-300 font-mono text-xs">{p.path}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-400">{p.sessions.toLocaleString()}</td>
                        <td className={`px-4 py-2.5 text-right ${p.bounceRate > 0.6 ? 'text-red-400' : 'text-zinc-400'}`}>
                          {formatPercent(p.bounceRate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Traffic Sources — GA */}
          {data.trafficSources.length > 0 && (
            <Section title="Traffic Sources" subtitle="Google Analytics">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                      <th className="text-left px-4 py-2.5 font-medium">Source / Medium</th>
                      <th className="text-right px-4 py-2.5 font-medium">Sessions</th>
                      <th className="text-right px-4 py-2.5 font-medium">Users</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.trafficSources.map((s, i) => (
                      <tr key={i} className="border-b border-zinc-800/50 last:border-0">
                        <td className="px-4 py-2.5 text-zinc-300">
                          {s.source} <span className="text-zinc-600">/ {s.medium}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-zinc-400">{s.sessions.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-400">{s.users.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </div>
      )}

      {isPending && data && (
        <div className="fixed top-4 right-4 bg-zinc-800 text-zinc-400 text-xs px-3 py-1.5 rounded-full">
          Refreshing...
        </div>
      )}
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

function KpiCard({ label, value, good, muted }: { label: string; value: string; good?: boolean; muted?: boolean }) {
  let valueColor = 'text-white'
  if (good === true) valueColor = 'text-emerald-400'
  if (good === false || muted) valueColor = 'text-zinc-500'

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4">
      <p className="text-zinc-500 text-xs font-medium mb-1">{label}</p>
      <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
    </div>
  )
}

function TrendCard({ label, data }: { label: string; data: TrendPoint[] }) {
  if (data.length < 2) return null

  const values = data.map((d) => d.value)
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const w = 400
  const h = 80
  const padding = 4

  const points = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * (w - padding * 2)
    const y = h - padding - ((v - min) / range) * (h - padding * 2)
    return `${x},${y}`
  }).join(' ')

  const latest = values[values.length - 1]
  const prev = values[values.length - 2]
  const trend = latest > prev ? 'up' : latest < prev ? 'down' : 'flat'
  const total = values.reduce((s, v) => s + v, 0)
  const avg = total / values.length

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-zinc-500 text-xs font-medium">{label}</p>
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 text-xs">avg {avg.toFixed(1)}/day</span>
          <span className={`text-xs font-medium ${
            trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-zinc-500'
          }`}>
            {trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '\u2192'}
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20" preserveAspectRatio="none">
        <polyline
          points={points}
          fill="none"
          stroke="#f97316"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="flex justify-between mt-1">
        <span className="text-zinc-600 text-[10px]">{data[0].date.slice(5)}</span>
        <span className="text-zinc-600 text-[10px]">{data[data.length - 1].date.slice(5)}</span>
      </div>
    </div>
  )
}
