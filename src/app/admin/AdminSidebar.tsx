'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

interface Props {
  username: string
  role: string
  pendingReports: number
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
    soon: true,
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
    soon: true,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21" />
      </svg>
    ),
  },
]

export default function AdminSidebar({ username, role, pendingReports }: Props) {
  const pathname = usePathname()

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
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
            const badge = item.href === '/admin/reports' && pendingReports > 0 ? pendingReports : null

            return (
              <Link
                key={item.href}
                href={item.soon ? '#' : item.href}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  item.soon
                    ? 'text-zinc-600 cursor-not-allowed'
                    : isActive
                    ? 'bg-orange-500/15 text-orange-400'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  {item.icon}
                  {item.label}
                  {item.soon && (
                    <span className="text-zinc-700 text-xs font-normal">soon</span>
                  )}
                </span>
                {badge != null && (
                  <span className="bg-orange-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center leading-none">
                    {badge > 99 ? '99+' : badge}
                  </span>
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
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800 sticky top-0 z-40">
        <div>
          <Link href="/feed" className="text-base font-bold text-white">BikerOrNot</Link>
          <span className="ml-2 text-orange-400 text-xs font-semibold">Admin</span>
        </div>
        <div className="flex items-center gap-1">
          {navItems.filter((i) => !i.soon).map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
            const badge = item.href === '/admin/reports' && pendingReports > 0 ? pendingReports : null
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative p-2 rounded-lg transition-colors ${
                  isActive ? 'text-orange-400 bg-orange-500/10' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                {item.icon}
                {badge != null && (
                  <span className="absolute -top-0.5 -right-0.5 bg-orange-500 text-white text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </Link>
            )
          })}
          <Link
            href="/feed"
            className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors ml-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
        </div>
      </div>
    </>
  )
}
