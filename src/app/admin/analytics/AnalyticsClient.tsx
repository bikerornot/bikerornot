'use client'

import { useState, useTransition } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { getDailyMemberCounts, type DailyMemberCount } from '@/app/actions/admin'

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

export default function AnalyticsClient() {
  const today = toDateStr(new Date())
  const thirtyAgo = toDateStr(new Date(Date.now() - 30 * 86400000))

  const [startDate, setStartDate] = useState(thirtyAgo)
  const [endDate, setEndDate] = useState(today)
  const [data, setData] = useState<DailyMemberCount[] | null>(null)
  const [pending, startTransition] = useTransition()
  const [activePreset, setActivePreset] = useState(30)

  function fetchData(start: string, end: string) {
    startTransition(async () => {
      const result = await getDailyMemberCounts(start, end)
      setData(result)
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

  // Auto-load on first render
  if (data === null && !pending) {
    fetchData(startDate, endDate)
  }

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

      {/* Chart */}
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
              <XAxis
                dataKey="date"
                tickFormatter={formatDateLabel}
                stroke="#52525b"
                tick={{ fontSize: 11, fill: '#71717a' }}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke="#52525b"
                tick={{ fontSize: 11, fill: '#71717a' }}
                tickFormatter={(v: number) => v.toLocaleString()}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: '0.75rem',
                  fontSize: '0.8rem',
                }}
                labelFormatter={(label: any) => formatDateLabel(String(label))}
                formatter={(value: any, name: any) => [
                  Number(value).toLocaleString(),
                  name === 'total' ? 'Total Members' : 'New Signups',
                ]}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#f97316"
                strokeWidth={2}
                fill="url(#totalGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
        {!pending && data && data.length === 0 && (
          <div className="h-80 flex items-center justify-center">
            <p className="text-zinc-500 text-sm">No data for this range.</p>
          </div>
        )}
      </div>

      {/* Daily signups bar */}
      {data && data.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-white font-semibold text-sm mb-3">Daily New Signups</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="signupGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateLabel}
                stroke="#52525b"
                tick={{ fontSize: 11, fill: '#71717a' }}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke="#52525b"
                tick={{ fontSize: 11, fill: '#71717a' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: '0.75rem',
                  fontSize: '0.8rem',
                }}
                labelFormatter={(label: any) => formatDateLabel(String(label))}
                formatter={(value: any) => [Number(value).toLocaleString(), 'New Signups']}
              />
              <Area
                type="monotone"
                dataKey="newSignups"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#signupGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
