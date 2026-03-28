'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function DesktopNav() {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <div className="hidden sm:flex items-center gap-2">
      {/* Find Riders — ghost pill CTA */}
      {!isActive('/people') && (
        <Link
          href="/people"
          className="text-sm font-medium text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 rounded-full px-3 py-1 transition-colors"
          title="Find Riders"
        >
          Find Riders
        </Link>
      )}

      {/* Groups */}
      <Link
        href="/groups"
        className={`p-1.5 rounded-lg transition-colors ${isActive('/groups') ? 'text-orange-400' : 'text-zinc-400 hover:text-orange-400'}`}
        title="Groups"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
      </Link>

      {/* Rides & Events */}
      <Link
        href="/events"
        className={`p-1.5 rounded-lg transition-colors ${isActive('/events') ? 'text-orange-400' : 'text-zinc-400 hover:text-orange-400'}`}
        title="Rides & Events"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
      </Link>

      {/* Bikes */}
      <Link
        href="/bikes"
        className={`p-1.5 rounded-lg transition-colors ${isActive('/bikes') ? 'text-orange-400' : 'text-zinc-400 hover:text-orange-400'}`}
        title="Find Bike Owners"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.44 9.03L15.41 5H11v2h3.59l2 2H5c-2.8 0-5 2.2-5 5s2.2 5 5 5c2.46 0 4.45-1.69 4.9-4h1.65l2.77-2.77c-.21.54-.32 1.14-.32 1.77 0 2.8 2.2 5 5 5s5-2.2 5-5c0-2.8-2.2-5-5-5-1.09 0-2.09.35-2.91.93L14.4 9.03h5.04zM5 17c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3zm14 0c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z" />
        </svg>
      </Link>
    </div>
  )
}
