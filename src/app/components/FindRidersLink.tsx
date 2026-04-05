'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function FindRidersLink() {
  const pathname = usePathname()
  const isActive = pathname.startsWith('/people')

  return (
    <Link
      href="/people"
      className={`sm:hidden p-1 rounded-lg transition-colors ${
        isActive ? 'text-orange-400' : 'text-zinc-400 hover:text-orange-400'
      }`}
      aria-label="Find Riders"
    >
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
    </Link>
  )
}
