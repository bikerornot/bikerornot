import Link from 'next/link'
import { getDashboardStats } from '@/app/actions/admin'
import type { RecentSignup, RecentReport } from '@/app/actions/admin'

export const metadata = { title: 'Dashboard — BikerOrNot Admin' }

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  hate_speech: 'Hate speech',
  nudity: 'Nudity',
  violence: 'Violence',
  fake_account: 'Fake account',
  other: 'Other',
}

function formatTimeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface StatCardProps {
  label: string
  value: number
  sub?: string
  accent?: 'orange' | 'red' | 'green' | 'default'
}

function StatCard({ label, value, sub, accent = 'default' }: StatCardProps) {
  const valueColor =
    accent === 'orange' ? 'text-orange-400' :
    accent === 'red' ? 'text-red-400' :
    accent === 'green' ? 'text-emerald-400' :
    'text-white'

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-3xl font-bold ${valueColor}`}>{value.toLocaleString()}</p>
      {sub && <p className="text-zinc-600 text-xs mt-1">{sub}</p>}
    </div>
  )
}

export default async function AdminDashboardPage() {
  const stats = await getDashboardStats()

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Platform overview</p>
      </div>

      {/* Alert banner */}
      {stats.pendingReports > 0 && (
        <Link
          href="/admin/reports"
          className="flex items-center gap-3 bg-orange-500/10 border border-orange-500/30 rounded-xl px-5 py-3 mb-6 hover:bg-orange-500/15 transition-colors"
        >
          <span className="text-orange-400 text-lg">⚠</span>
          <span className="text-orange-300 text-sm font-medium">
            {stats.pendingReports} pending report{stats.pendingReports !== 1 ? 's' : ''} awaiting review
          </span>
          <span className="ml-auto text-orange-400 text-sm">Review →</span>
        </Link>
      )}

      {/* Top stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Total Users" value={stats.totalUsers} accent="green" />
        <StatCard label="New Today" value={stats.newToday} />
        <StatCard label="New This Week" value={stats.newThisWeek} />
        <StatCard label="New This Month" value={stats.newThisMonth} />
      </div>

      {/* Status row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Pending Reports"
          value={stats.pendingReports}
          accent={stats.pendingReports > 0 ? 'orange' : 'default'}
          sub={stats.pendingReports > 0 ? 'Needs attention' : 'All clear'}
        />
        <StatCard
          label="Banned Users"
          value={stats.bannedUsers}
          accent={stats.bannedUsers > 0 ? 'red' : 'default'}
        />
        <StatCard
          label="Suspended Users"
          value={stats.suspendedUsers}
          accent={stats.suspendedUsers > 0 ? 'orange' : 'default'}
        />
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent signups */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <h2 className="text-white font-semibold text-sm">Recent Signups</h2>
            <span className="text-zinc-600 text-xs">Last 8</span>
          </div>
          {stats.recentSignups.length === 0 ? (
            <p className="text-zinc-600 text-sm text-center py-8">No users yet</p>
          ) : (
            <ul>
              {stats.recentSignups.map((u: RecentSignup, i: number) => (
                <li
                  key={u.id}
                  className={`flex items-center gap-3 px-5 py-3 ${
                    i < stats.recentSignups.length - 1 ? 'border-b border-zinc-800/50' : ''
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-zinc-700 flex-shrink-0 flex items-center justify-center text-zinc-400 text-xs font-bold">
                    {u.first_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-200 text-sm font-medium truncate">
                      {u.first_name} {u.last_name}
                    </p>
                    <p className="text-zinc-500 text-xs truncate">
                      {u.username ? `@${u.username}` : 'no username'}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-zinc-500 text-xs">{formatTimeAgo(u.created_at)}</p>
                    {u.status !== 'active' && (
                      <span className={`text-xs font-semibold ${
                        u.status === 'banned' ? 'text-red-400' : 'text-orange-400'
                      }`}>
                        {u.status}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent reports */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <h2 className="text-white font-semibold text-sm">Pending Reports</h2>
            {stats.pendingReports > 0 && (
              <Link
                href="/admin/reports"
                className="text-orange-400 hover:text-orange-300 text-xs transition-colors"
              >
                View all →
              </Link>
            )}
          </div>
          {stats.recentReports.length === 0 ? (
            <p className="text-zinc-600 text-sm text-center py-8">No pending reports</p>
          ) : (
            <ul>
              {stats.recentReports.map((r: RecentReport, i: number) => (
                <li
                  key={r.id}
                  className={`flex items-center gap-3 px-5 py-3 ${
                    i < stats.recentReports.length - 1 ? 'border-b border-zinc-800/50' : ''
                  }`}
                >
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                    r.reported_type === 'profile'
                      ? 'bg-purple-500/20 text-purple-300'
                      : r.reported_type === 'post'
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'bg-zinc-700 text-zinc-300'
                  }`}>
                    {r.reported_type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-200 text-sm truncate">
                      {REASON_LABELS[r.reason] ?? r.reason}
                    </p>
                    {r.reporter_username && (
                      <p className="text-zinc-500 text-xs">by @{r.reporter_username}</p>
                    )}
                  </div>
                  <p className="text-zinc-500 text-xs flex-shrink-0">{formatTimeAgo(r.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
