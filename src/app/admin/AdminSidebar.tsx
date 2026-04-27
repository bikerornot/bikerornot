'use client'

import { usePathname } from 'next/navigation'
import { useState, useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import { toggleAdsEnabled } from '@/app/actions/ads'

interface Props {
  username: string
  role: string
  pendingReports: number
  pendingDmca: number
  pendingFlags: number
  watchlistCount: number
  initialActiveUsers: number
  initialAdsEnabled: boolean
}

// ─── Icons ───────────────────────────────────────────────────────────
const Icon = {
  dashboard: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  users: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  shield: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  ),
  image: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21" />
    </svg>
  ),
  megaphone: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
    </svg>
  ),
  game: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 12h4m-2-2v4" />
      <circle cx="16" cy="11" r="1" />
      <circle cx="18" cy="13" r="1" />
    </svg>
  ),
  business: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8l7-4v17M19 21V12l-7-4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 10v0M9 14v0M9 18v0" />
    </svg>
  ),
  error: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  back: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  ),
  hamburger: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  close: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
}

// ─── Nav config ──────────────────────────────────────────────────────
type Badges = { reports: number; dmca: number; flags: number; watchlist: number }

type NavSubItem = {
  href: string
  label: string
  exact?: boolean
  getBadge?: (b: Badges) => number
  trailing?: 'adsToggle'
}

type NavRootItem = NavSubItem & { icon: ReactNode }

type NavGroup = {
  key: string
  label: string
  icon: ReactNode
  items: NavSubItem[]
}

const rootTop: NavRootItem[] = [
  { href: '/admin', label: 'Dashboard', exact: true, icon: Icon.dashboard },
  { href: '/admin/users', label: 'Users', icon: Icon.users },
]

const groups: NavGroup[] = [
  {
    key: 'safety',
    label: 'Safety Center',
    icon: Icon.shield,
    items: [
      { href: '/admin/safety', label: 'Overview', exact: true },
      { href: '/admin/reports', label: 'Reports', getBadge: (b) => b.reports },
      { href: '/admin/flags', label: 'AI Flags', getBadge: (b) => b.flags },
      { href: '/admin/watchlist', label: 'Watchlist', getBadge: (b) => b.watchlist },
      { href: '/admin/ai-analysis', label: 'AI Analysis' },
      { href: '/admin/dmca', label: 'DMCA', getBadge: (b) => b.dmca },
      { href: '/admin/moderation-rejections', label: 'Image Rejections' },
    ],
  },
  {
    key: 'content',
    label: 'Content',
    icon: Icon.image,
    items: [
      { href: '/admin/images', label: 'Images' },
      { href: '/admin/messages', label: 'Messages' },
    ],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    icon: Icon.megaphone,
    items: [
      { href: '/admin/banners', label: 'Banners' },
      { href: '/admin/ads', label: 'Ads', trailing: 'adsToggle' },
      { href: '/admin/analytics', label: 'Analytics' },
      { href: '/admin/kpis', label: 'KPIs' },
    ],
  },
  {
    key: 'game',
    label: 'Game',
    icon: Icon.game,
    items: [
      { href: '/admin/game-photos', label: 'Game Photos' },
      { href: '/admin/game-reports', label: 'Game Reports' },
    ],
  },
  {
    key: 'business',
    label: 'Business',
    icon: Icon.business,
    items: [
      { href: '/admin/dealers', label: 'HD Dealers' },
    ],
  },
]

const rootBottom: NavRootItem[] = [
  { href: '/admin/errors', label: 'Errors', icon: Icon.error },
]

function matchesPath(item: { href: string; exact?: boolean }, pathname: string): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href)
}

function groupIsActive(g: NavGroup, pathname: string): boolean {
  return g.items.some((i) => matchesPath(i, pathname))
}

function groupTotalBadge(g: NavGroup, b: Badges): number {
  return g.items.reduce((sum, it) => sum + (it.getBadge ? it.getBadge(b) : 0), 0)
}

// ─── Component ───────────────────────────────────────────────────────
export default function AdminSidebar({
  username,
  role,
  pendingReports,
  pendingDmca,
  pendingFlags,
  watchlistCount,
  initialActiveUsers,
  initialAdsEnabled,
}: Props) {
  const pathname = usePathname()
  const [activeUsers, setActiveUsers] = useState(initialActiveUsers)
  const [menuOpen, setMenuOpen] = useState(false)
  const [adsEnabled, setAdsEnabled] = useState(initialAdsEnabled)
  const [adsToggling, setAdsToggling] = useState(false)

  const badges: Badges = {
    reports: pendingReports || 0,
    dmca: pendingDmca || 0,
    flags: pendingFlags || 0,
    watchlist: watchlistCount || 0,
  }

  // Each group opens when the current path is inside it.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const g of groups) initial[g.key] = groupIsActive(g, pathname)
    return initial
  })

  function toggleGroup(key: string) {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  async function handleAdsToggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setAdsToggling(true)
    const nextVal = await toggleAdsEnabled()
    setAdsEnabled(nextVal)
    setAdsToggling(false)
  }

  useEffect(() => { setMenuOpen(false) }, [pathname])

  useEffect(() => {
    function refresh() {
      fetch('/api/admin/active-count')
        .then((r) => r.json())
        .then((d) => { if (typeof d.count === 'number') setActiveUsers(d.count) })
        .catch(() => {})
    }
    const interval = setInterval(refresh, 30_000)
    return () => clearInterval(interval)
  }, [])

  const mobileIndicator = badges.reports + badges.dmca + badges.flags + badges.watchlist > 0

  const navBody = (variant: 'desktop' | 'mobile') => (
    <>
      {rootTop.map((item) => (
        <RootLink key={item.href} item={item} pathname={pathname} variant={variant} />
      ))}
      {groups.map((g) => (
        <NavGroupSection
          key={g.key}
          group={g}
          open={openGroups[g.key]}
          onToggle={() => toggleGroup(g.key)}
          pathname={pathname}
          badges={badges}
          variant={variant}
          adsEnabled={adsEnabled}
          adsToggling={adsToggling}
          onAdsToggle={handleAdsToggle}
        />
      ))}
      {rootBottom.map((item) => (
        <RootLink key={item.href} item={item} pathname={pathname} variant={variant} />
      ))}
    </>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 min-h-screen bg-zinc-900 border-r border-zinc-800 flex-col sticky top-0 h-screen">
        <div className="p-5 border-b border-zinc-800">
          <Link href="/feed" className="text-lg font-bold text-white tracking-tight">BikerOrNot</Link>
          <p className="text-orange-400 text-xs font-semibold mt-0.5 uppercase tracking-wider">Admin Panel</p>
          <Link href="/admin/online" className="flex items-center gap-1.5 mt-2 group w-fit">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
            <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors">
              <span className="text-emerald-400 font-semibold">{activeUsers}</span> online now
            </span>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navBody('desktop')}
        </nav>

        <div className="p-3 border-t border-zinc-800">
          <p className="text-zinc-600 text-xs px-3 mb-1.5">
            @{username}
            <span className="ml-1.5 bg-zinc-800 text-zinc-500 text-xs px-1.5 py-0.5 rounded font-medium">{role}</span>
          </p>
          <Link
            href="/feed"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            {Icon.back}
            Back to feed
          </Link>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800">
          <div>
            <div>
              <Link href="/feed" className="text-base font-bold text-white">BikerOrNot</Link>
              <span className="ml-2 text-orange-400 text-xs font-semibold">Admin</span>
            </div>
            <Link href="/admin/online" className="flex items-center gap-1.5 mt-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
              <span className="text-xs text-zinc-400">
                <span className="text-emerald-400 font-semibold">{activeUsers}</span> online
              </span>
            </Link>
          </div>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="relative p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            {menuOpen ? Icon.close : Icon.hamburger}
            {!menuOpen && mobileIndicator && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-orange-500" />
            )}
          </button>
        </div>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
            <div className="relative z-40 bg-zinc-900 border-b border-zinc-800 shadow-xl max-h-[calc(100vh-72px)] overflow-y-auto">
              <nav className="py-2">
                {navBody('mobile')}
              </nav>
              <div className="border-t border-zinc-800 px-5 py-3">
                <p className="text-zinc-600 text-xs mb-2">
                  @{username}
                  <span className="ml-1.5 bg-zinc-800 text-zinc-500 text-xs px-1.5 py-0.5 rounded font-medium">{role}</span>
                </p>
                <Link
                  href="/feed"
                  className="flex items-center gap-2 text-sm text-zinc-500 hover:text-white transition-colors"
                >
                  {Icon.back}
                  Back to feed
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

// ─── Subcomponents ───────────────────────────────────────────────────
function RootLink({
  item,
  pathname,
  variant,
}: {
  item: NavRootItem
  pathname: string
  variant: 'desktop' | 'mobile'
}) {
  const active = matchesPath(item, pathname)
  const cls =
    variant === 'desktop'
      ? `flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          active ? 'bg-orange-500/15 text-orange-400' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
        }`
      : `flex items-center justify-between px-5 py-3 text-sm font-medium transition-colors ${
          active ? 'bg-orange-500/10 text-orange-400' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
        }`
  const gapCls = variant === 'desktop' ? 'gap-2.5' : 'gap-3'
  return (
    <Link href={item.href} className={cls}>
      <span className={`flex items-center ${gapCls}`}>
        {item.icon}
        {item.label}
      </span>
    </Link>
  )
}

function NavGroupSection({
  group,
  open,
  onToggle,
  pathname,
  badges,
  variant,
  adsEnabled,
  adsToggling,
  onAdsToggle,
}: {
  group: NavGroup
  open: boolean
  onToggle: () => void
  pathname: string
  badges: Badges
  variant: 'desktop' | 'mobile'
  adsEnabled: boolean
  adsToggling: boolean
  onAdsToggle: (e: React.MouseEvent) => void
}) {
  const hasActive = groupIsActive(group, pathname)
  const totalBadge = groupTotalBadge(group, badges)

  const headerCls =
    variant === 'desktop'
      ? `w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          hasActive ? 'bg-orange-500/15 text-orange-400' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
        }`
      : `w-full flex items-center justify-between px-5 py-3 text-sm font-medium transition-colors ${
          hasActive ? 'bg-orange-500/10 text-orange-400' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
        }`
  const iconGap = variant === 'desktop' ? 'gap-2.5' : 'gap-3'

  return (
    <div>
      <button onClick={onToggle} className={headerCls}>
        <span className={`flex items-center ${iconGap}`}>
          {group.icon}
          {group.label}
        </span>
        <span className="flex items-center gap-1.5">
          {totalBadge > 0 && (
            <span className="bg-orange-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center leading-none">
              {totalBadge > 99 ? '99+' : totalBadge}
            </span>
          )}
          <svg className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </button>
      {open && (
        <div className={variant === 'desktop' ? 'ml-4 mt-0.5 space-y-0.5' : 'bg-zinc-950/50'}>
          {group.items.map((sub) => {
            const active = matchesPath(sub, pathname)
            const badge = sub.getBadge ? sub.getBadge(badges) : 0
            const subCls =
              variant === 'desktop'
                ? `flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active ? 'bg-orange-500/10 text-orange-400' : 'text-zinc-500 hover:text-white hover:bg-zinc-800/50'
                  }`
                : `flex items-center justify-between pl-12 pr-5 py-2.5 text-sm font-medium transition-colors ${
                    active ? 'bg-orange-500/10 text-orange-400' : 'text-zinc-500 hover:text-white hover:bg-zinc-800/50'
                  }`
            return (
              <Link key={sub.href} href={sub.href} className={subCls}>
                <span>{sub.label}</span>
                <span className="flex items-center gap-2">
                  {badge > 0 && (
                    <span className="bg-orange-500/80 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center leading-none">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                  {sub.trailing === 'adsToggle' && (
                    <button
                      onClick={onAdsToggle}
                      disabled={adsToggling}
                      className={`relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0 ${
                        adsEnabled ? 'bg-emerald-500' : 'bg-zinc-600'
                      }`}
                      title={adsEnabled ? 'Ads are live — click to pause all' : 'Ads are paused — click to resume'}
                    >
                      <span
                        className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${
                          adsEnabled ? 'left-[15px]' : 'left-[2px]'
                        }`}
                      />
                    </button>
                  )}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
