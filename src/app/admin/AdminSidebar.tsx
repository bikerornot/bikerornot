'use client'

import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
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

const navItems = [
  {
    href: '/admin',
    label: 'Dashboard',
    exact: true,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href: '/admin/reports',
    label: 'Reports',
    exact: false,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
      </svg>
    ),
  },
  {
    href: '/admin/users',
    label: 'Users',
    exact: false,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: '/admin/images',
    label: 'Images',
    exact: false,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21" />
      </svg>
    ),
  },
  {
    href: '/admin/messages',
    label: 'Messages',
    exact: false,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    href: '/admin/dmca',
    label: 'DMCA',
    exact: false,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    href: '/admin/flags',
    label: 'AI Flags',
    exact: false,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
    ),
  },
  {
    href: '/admin/watchlist',
    label: 'Watchlist',
    exact: false,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
  },
  {
    href: '/admin/analytics',
    label: 'Analytics',
    exact: false,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16l4-4 4 4 5-5" />
      </svg>
    ),
  },
  {
    href: '/admin/kpis',
    label: 'KPIs',
    exact: false,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
      </svg>
    ),
  },
  {
    href: '/admin/ads',
    label: 'Ads',
    exact: false,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
  },
  {
    href: '/admin/banners',
    label: 'Banners',
    exact: false,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
  },
  {
    href: '/admin/errors',
    label: 'Errors',
    exact: false,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
]

export default function AdminSidebar({ username, role, pendingReports, pendingDmca, pendingFlags, watchlistCount, initialActiveUsers, initialAdsEnabled }: Props) {
  const pathname = usePathname()
  const [activeUsers, setActiveUsers] = useState(initialActiveUsers)
  const [menuOpen, setMenuOpen] = useState(false)
  const [adsEnabled, setAdsEnabled] = useState(initialAdsEnabled)
  const [adsToggling, setAdsToggling] = useState(false)

  async function handleAdsToggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setAdsToggling(true)
    const newValue = await toggleAdsEnabled()
    setAdsEnabled(newValue)
    setAdsToggling(false)
  }

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

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

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 min-h-screen bg-zinc-900 border-r border-zinc-800 flex-col sticky top-0 h-screen">
        <div className="p-5 border-b border-zinc-800">
          <Link href="/feed" className="text-lg font-bold text-white tracking-tight">
            BikerOrNot
          </Link>
          <p className="text-orange-400 text-xs font-semibold mt-0.5 uppercase tracking-wider">
            Admin Panel
          </p>
          <Link
            href="/admin/online"
            className="flex items-center gap-1.5 mt-2 group w-fit"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
            <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors">
              <span className="text-emerald-400 font-semibold">{activeUsers}</span> online now
            </span>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
            const badge = item.href === '/admin/reports' && pendingReports > 0 ? pendingReports
              : item.href === '/admin/dmca' && pendingDmca > 0 ? pendingDmca
              : item.href === '/admin/flags' && pendingFlags > 0 ? pendingFlags
              : item.href === '/admin/watchlist' && watchlistCount > 0 ? watchlistCount
              : null

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-orange-500/15 text-orange-400'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  {item.icon}
                  {item.label}
                </span>
                {badge != null && (
                  <span className="bg-orange-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center leading-none">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
                {item.href === '/admin/ads' && (
                  <button
                    onClick={handleAdsToggle}
                    disabled={adsToggling}
                    className={`relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0 ${
                      adsEnabled ? 'bg-emerald-500' : 'bg-zinc-600'
                    }`}
                    title={adsEnabled ? 'Ads are live — click to pause all' : 'Ads are paused — click to resume'}
                  >
                    <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${
                      adsEnabled ? 'left-[15px]' : 'left-[2px]'
                    }`} />
                  </button>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border-t border-zinc-800">
          <p className="text-zinc-600 text-xs px-3 mb-1.5">
            @{username}
            <span className="ml-1.5 bg-zinc-800 text-zinc-500 text-xs px-1.5 py-0.5 rounded font-medium">
              {role}
            </span>
          </p>
          <Link
            href="/feed"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
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
            <Link href="/admin/online" className="flex items-center gap-1.5 mt-0.5">
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
            {menuOpen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
            {!menuOpen && (pendingReports + pendingDmca + pendingFlags) > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-orange-500" />
            )}
          </button>
        </div>

        {/* Dropdown menu */}
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
            <div className="relative z-40 bg-zinc-900 border-b border-zinc-800 shadow-xl">
              <nav className="py-2">
                {navItems.map((item) => {
                  const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
                  const badge = item.href === '/admin/reports' && pendingReports > 0 ? pendingReports
                    : item.href === '/admin/dmca' && pendingDmca > 0 ? pendingDmca
                    : item.href === '/admin/flags' && pendingFlags > 0 ? pendingFlags
                    : null
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center justify-between px-5 py-3 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-orange-500/10 text-orange-400'
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        {item.icon}
                        {item.label}
                      </span>
                      {badge != null && (
                        <span className="bg-orange-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center leading-none">
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                      {item.href === '/admin/ads' && (
                        <button
                          onClick={handleAdsToggle}
                          disabled={adsToggling}
                          className={`relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0 ${
                            adsEnabled ? 'bg-emerald-500' : 'bg-zinc-600'
                          }`}
                        >
                          <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${
                            adsEnabled ? 'left-[15px]' : 'left-[2px]'
                          }`} />
                        </button>
                      )}
                    </Link>
                  )
                })}
              </nav>
              <div className="border-t border-zinc-800 px-5 py-3">
                <p className="text-zinc-600 text-xs mb-2">
                  @{username}
                  <span className="ml-1.5 bg-zinc-800 text-zinc-500 text-xs px-1.5 py-0.5 rounded font-medium">
                    {role}
                  </span>
                </p>
                <Link
                  href="/feed"
                  className="flex items-center gap-2 text-sm text-zinc-500 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
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
