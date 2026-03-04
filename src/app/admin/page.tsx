import Link from 'next/link'
import { getDashboardStats, getRefSources } from '@/app/actions/admin'
import type { RecentSignup, RecentReport } from '@/app/actions/admin'

export const metadata = { title: 'Dashboard — BikerOrNot Admin' }
export const dynamic = 'force-dynamic'

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

function KpiCard({
  label,
  total,
  last24h,
  last7d,
  accent,
}: {
  label: string
  total: number
  last24h?: number
  last7d?: number
  accent?: 'orange' | 'red' | 'green'
}) {
  const valueColor =
    accent === 'orange' ? 'text-orange-400' :
    accent === 'red' ? 'text-red-400' :
    accent === 'green' ? 'text-emerald-400' :
    'text-white'

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1.5">{label}</p>
      <p className={`text-2xl font-bold ${valueColor}`}>{total.toLocaleString()}</p>
      {(last24h !== undefined || last7d !== undefined) && (
        <div className="flex gap-3 mt-1.5">
          {last24h !== undefined && (
            <span className="text-zinc-500 text-xs">
              <span className="text-zinc-300 font-medium">{last24h.toLocaleString()}</span> 24h
            </span>
          )}
          {last7d !== undefined && (
            <span className="text-zinc-500 text-xs">
              <span className="text-zinc-300 font-medium">{last7d.toLocaleString()}</span> 7d
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">{title}</h2>
  )
}

export default async function AdminDashboardPage() {
  const [stats, refSources] = await Promise.all([getDashboardStats(), getRefSources()])

  const onboardingRate = stats.totalUsers > 0
    ? Math.round((stats.onboardingComplete / stats.totalUsers) * 100)
    : 0

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Platform overview</p>
      </div>

      {/* Alert banners */}
      {stats.flaggedUsers > 0 && (
        <Link
          href="/admin/users?status=flagged"
          className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-3 mb-3 hover:bg-red-500/15 transition-colors"
        >
          <span className="text-red-400 text-lg">🚩</span>
          <span className="text-red-300 text-sm font-medium">
            {stats.flaggedUsers} active account{stats.flaggedUsers !== 1 ? 's' : ''} from high-risk countries
          </span>
          <span className="ml-auto text-red-400 text-sm">Review →</span>
        </Link>
      )}
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

      {/* ── GROWTH ─────────────────────────────────────────────── */}
      <SectionHeader title="Growth" />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1.5">Total Users</p>
          <p className="text-2xl font-bold text-emerald-400">{stats.totalUsers.toLocaleString()}</p>
          <p className="text-zinc-500 text-xs mt-1.5">
            <span className="text-zinc-300 font-medium">{onboardingRate}%</span> onboarded
          </p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1.5">Today</p>
          <p className="text-2xl font-bold text-white">{stats.newToday.toLocaleString()}</p>
          <p className="text-zinc-500 text-xs mt-1.5">
            <span className="text-zinc-300 font-medium">{stats.newLast24h.toLocaleString()}</span> last 24h
          </p>
        </div>
        <KpiCard label="This Week" total={stats.newThisWeek} />
        <KpiCard label="This Month" total={stats.newThisMonth} />
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1.5">Onboarded</p>
          <p className="text-2xl font-bold text-white">{stats.onboardingComplete.toLocaleString()}</p>
          <p className="text-zinc-500 text-xs mt-1.5">
            <span className="text-zinc-300 font-medium">{(stats.totalUsers - stats.onboardingComplete).toLocaleString()}</span> incomplete
          </p>
        </div>
      </div>

      {/* ── ENGAGEMENT ─────────────────────────────────────────── */}
      <SectionHeader title="Engagement" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Posts" total={stats.postsTotal} last24h={stats.posts24h} last7d={stats.posts7d} />
        <KpiCard label="Comments" total={stats.commentsTotal} last24h={stats.comments24h} last7d={stats.comments7d} />
        <KpiCard label="Messages" total={stats.messagesTotal} last24h={stats.messages24h} last7d={stats.messages7d} />
        <KpiCard label="Likes" total={stats.likesTotal} last24h={stats.likes24h} last7d={stats.likes7d} />
      </div>

      {/* ── SOCIAL ─────────────────────────────────────────────── */}
      <SectionHeader title="Social" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <KpiCard
          label="Friendships"
          total={stats.friendshipsTotal}
          last24h={stats.friendshipsFormed24h}
          last7d={stats.friendshipsFormed7d}
          accent="green"
        />
        <KpiCard
          label="Friend Requests"
          total={stats.friendRequestsSent7d}
          last24h={stats.friendRequestsSent24h}
          last7d={stats.friendRequestsSent7d}
        />
        <KpiCard label="Groups" total={stats.groupsTotal} last7d={stats.groupsCreated7d} />
      </div>

      {/* ── CONTENT ────────────────────────────────────────────── */}
      <SectionHeader title="Content" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <KpiCard label="Photos Uploaded" total={stats.photosUploaded7d} last24h={stats.photosUploaded24h} last7d={stats.photosUploaded7d} />
        <KpiCard label="Bikes in Garages" total={stats.bikesTotal} last24h={stats.bikesAdded24h} last7d={stats.bikesAdded7d} />
        <KpiCard label="Groups Created" total={stats.groupsTotal} last7d={stats.groupsCreated7d} />
      </div>

      {/* ── SAFETY ─────────────────────────────────────────────── */}
      <SectionHeader title="Safety" />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard
          label="Pending Reports"
          total={stats.pendingReports}
          accent={stats.pendingReports > 0 ? 'orange' : undefined}
        />
        <KpiCard label="Reports Filed" total={stats.reports7d} last24h={stats.reports24h} last7d={stats.reports7d} />
        <KpiCard
          label="Blocks"
          total={stats.blocks7d}
          last24h={stats.blocks24h}
          last7d={stats.blocks7d}
          accent={stats.blocks24h > 5 ? 'red' : undefined}
        />
        <KpiCard
          label="Banned"
          total={stats.bannedUsers}
          accent={stats.bannedUsers > 0 ? 'red' : undefined}
        />
        <KpiCard
          label="Suspended"
          total={stats.suspendedUsers}
          accent={stats.suspendedUsers > 0 ? 'orange' : undefined}
        />
      </div>

      {/* ── FLAGGED USERS ──────────────────────────────────────── */}
      {stats.flaggedUsers > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <KpiCard label="Flagged Users" total={stats.flaggedUsers} accent="red" />
        </div>
      )}

      {/* ── REFERRAL SOURCES ───────────────────────────────────── */}
      <SectionHeader title="Referral Sources" />
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-6">
        {refSources.length === 0 ? (
          <p className="text-zinc-600 text-sm text-center py-6">
            No referral data yet — add UTM params to your ad URLs to start tracking
          </p>
        ) : (
          <div className="px-5 py-4 flex flex-wrap gap-3">
            {refSources.map((r) => (
              <div key={r.label} className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 flex items-center gap-3">
                <span className="text-white text-sm font-medium">{r.label}</span>
                <span className="text-orange-400 text-sm font-bold">{r.count}</span>
              </div>
            ))}
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-4 py-2.5">
              <span className="text-zinc-500 text-sm">
                {refSources.reduce((s, r) => s + r.count, 0)} tracked total
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── RECENT ACTIVITY ────────────────────────────────────── */}
      <SectionHeader title="Recent Activity" />
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
