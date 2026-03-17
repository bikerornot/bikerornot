'use client'

import { useState, useTransition, useEffect } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import {
  getDailyMemberCounts, getDailyPostCounts,
  getDailyFriendRequestCounts, getDailyCommentCounts,
  type DailyMemberCount, type DailyPostCount,
  type DailyFriendRequestCount, type DailyCommentCount,
} from '@/app/actions/admin'

const PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Last 6 months', days: 180 },
  { label: 'Last year', days: 365 },
]

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

const tooltipStyle = {
  backgroundColor: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: '0.75rem',
  fontSize: '0.8rem',
}

const axisProps = {
  stroke: '#52525b',
  tick: { fontSize: 11, fill: '#71717a' } as const,
}

export default function AnalyticsClient() {
  const today = toDateStr(new Date())
  const thirtyAgo = toDateStr(new Date(Date.now() - 30 * 86400000))

  const [startDate, setStartDate] = useState(thirtyAgo)
  const [endDate, setEndDate] = useState(today)
  const [data, setData] = useState<DailyMemberCount[] | null>(null)
  const [postData, setPostData] = useState<DailyPostCount[] | null>(null)
  const [friendRequestData, setFriendRequestData] = useState<DailyFriendRequestCount[] | null>(null)
  const [commentData, setCommentData] = useState<DailyCommentCount[] | null>(null)
  const [pending, startTransition] = useTransition()
  const [activePreset, setActivePreset] = useState(30)

  function fetchData(start: string, end: string) {
    startTransition(async () => {
      const [members, posts, friendRequests, comments] = await Promise.all([
        getDailyMemberCounts(start, end),
        getDailyPostCounts(start, end),
        getDailyFriendRequestCounts(start, end),
        getDailyCommentCounts(start, end),
      ])
      setData(members)
      setPostData(posts)
      setFriendRequestData(friendRequests)
      setCommentData(comments)
    })
  }

  function handlePreset(days: number) {
    const end = today
    const start = toDateStr(new Date(Date.now() - days * 86400000))
    setStartDate(start)
    setEndDate(end)
    setActivePreset(days)
    fetchData(start, end)
  }

  function handleCustom() {
    setActivePreset(0)
    fetchData(startDate, endDate)
  }

  // Auto-load on mount
  useEffect(() => {
    fetchData(startDate, endDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalNew = data?.reduce((sum, d) => sum + d.newSignups, 0) ?? 0
  const latestTotal = data && data.length > 0 ? data[data.length - 1].total : 0

  return (
    <div className="space-y-4">
      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.days}
            onClick={() => handlePreset(p.days)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activePreset === p.days
                ? 'bg-orange-500 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-zinc-500 text-xs font-medium block mb-1">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>
        <div>
          <label className="text-zinc-500 text-xs font-medium block mb-1">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>
        <button
          onClick={handleCustom}
          disabled={pending}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          {pending ? 'Loading...' : 'Apply'}
        </button>
      </div>

      {/* Stats summary */}
      {data && data.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1">Current Total</p>
            <p className="text-2xl font-bold text-emerald-400">{latestTotal.toLocaleString()}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1">New in Range</p>
            <p className="text-2xl font-bold text-orange-400">{totalNew.toLocaleString()}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1">Avg / Day</p>
            <p className="text-2xl font-bold text-white">
              {data.length > 0 ? (totalNew / data.length).toFixed(1) : '0'}
            </p>
          </div>
        </div>
      )}

      {/* Total members chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        {pending && (
          <div className="h-80 flex items-center justify-center">
            <p className="text-zinc-500 text-sm">Loading chart...</p>
          </div>
        )}
        {!pending && data && data.length > 0 && (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="date" tickFormatter={formatDateLabel} {...axisProps} interval="preserveStartEnd" />
              <YAxis {...axisProps} tickFormatter={(v: number) => v.toLocaleString()} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(label: any) => formatDateLabel(String(label))}
                formatter={(value: any, name: any) => [
                  Number(value).toLocaleString(),
                  name === 'total' ? 'Total Members' : 'New Signups',
                ]}
              />
              <Area type="monotone" dataKey="total" stroke="#f97316" strokeWidth={2} fill="url(#totalGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
        {!pending && data && data.length === 0 && (
          <div className="h-80 flex items-center justify-center">
            <p className="text-zinc-500 text-sm">No data for this range.</p>
          </div>
        )}
      </div>

      {/* Posts per day */}
      {!pending && postData && postData.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold text-sm">Posts per Day</h3>
            <span className="text-zinc-500 text-xs">
              {postData.reduce((s, d) => s + d.count, 0).toLocaleString()} total · {postData.reduce((s, d) => s + d.organic, 0).toLocaleString()} organic
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={postData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="postsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="postsOrganicGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="date" tickFormatter={formatDateLabel} {...axisProps} interval="preserveStartEnd" />
              <YAxis {...axisProps} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(label: any) => formatDateLabel(String(label))}
                formatter={(value: any, name: any) => [
                  Number(value).toLocaleString(),
                  name === 'count' ? 'Total' : 'Organic',
                ]}
              />
              <Legend formatter={(value) => (value === 'count' ? 'Total' : 'Organic')} />
              <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} fill="url(#postsGradient)" />
              <Area type="monotone" dataKey="organic" stroke="#10b981" strokeWidth={2} fill="url(#postsOrganicGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Daily signups */}
      {!pending && data && data.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold text-sm">Daily New Signups</h3>
            <span className="text-zinc-500 text-xs">
              {data.reduce((s, d) => s + d.newSignups, 0).toLocaleString()} total · {data.reduce((s, d) => s + d.organicSignups, 0).toLocaleString()} organic
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="signupGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="signupOrganicGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="date" tickFormatter={formatDateLabel} {...axisProps} interval="preserveStartEnd" />
              <YAxis {...axisProps} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(label: any) => formatDateLabel(String(label))}
                formatter={(value: any, name: any) => [
                  Number(value).toLocaleString(),
                  name === 'newSignups' ? 'Total' : 'Organic',
                ]}
              />
              <Legend formatter={(value) => (value === 'newSignups' ? 'Total' : 'Organic')} />
              <Area type="monotone" dataKey="newSignups" stroke="#f97316" strokeWidth={2} fill="url(#signupGradient)" />
              <Area type="monotone" dataKey="organicSignups" stroke="#10b981" strokeWidth={2} fill="url(#signupOrganicGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Friend requests per day */}
      {!pending && friendRequestData && friendRequestData.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold text-sm">Friend Requests per Day</h3>
            <span className="text-zinc-500 text-xs">
              {friendRequestData.reduce((s, d) => s + d.count, 0).toLocaleString()} total · {friendRequestData.reduce((s, d) => s + d.organic, 0).toLocaleString()} organic
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={friendRequestData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="friendReqGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="friendReqOrganicGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="date" tickFormatter={formatDateLabel} {...axisProps} interval="preserveStartEnd" />
              <YAxis {...axisProps} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(label: any) => formatDateLabel(String(label))}
                formatter={(value: any, name: any) => [
                  Number(value).toLocaleString(),
                  name === 'count' ? 'Total' : 'Organic',
                ]}
              />
              <Legend formatter={(value) => (value === 'count' ? 'Total' : 'Organic')} />
              <Area type="monotone" dataKey="count" stroke="#a855f7" strokeWidth={2} fill="url(#friendReqGradient)" />
              <Area type="monotone" dataKey="organic" stroke="#10b981" strokeWidth={2} fill="url(#friendReqOrganicGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Comments per day */}
      {!pending && commentData && commentData.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold text-sm">Comments per Day</h3>
            <span className="text-zinc-500 text-xs">
              {commentData.reduce((s, d) => s + d.count, 0).toLocaleString()} total · {commentData.reduce((s, d) => s + d.organic, 0).toLocaleString()} organic
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={commentData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="commentsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#eab308" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="commentsOrganicGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="date" tickFormatter={formatDateLabel} {...axisProps} interval="preserveStartEnd" />
              <YAxis {...axisProps} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(label: any) => formatDateLabel(String(label))}
                formatter={(value: any, name: any) => [
                  Number(value).toLocaleString(),
                  name === 'count' ? 'Total' : 'Organic',
                ]}
              />
              <Legend formatter={(value) => (value === 'count' ? 'Total' : 'Organic')} />
              <Area type="monotone" dataKey="count" stroke="#eab308" strokeWidth={2} fill="url(#commentsGradient)" />
              <Area type="monotone" dataKey="organic" stroke="#10b981" strokeWidth={2} fill="url(#commentsOrganicGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
