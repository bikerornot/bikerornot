'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/classifieds', label: 'Browse' },
  { href: '/classifieds/saved', label: 'Saved' },
  { href: '/classifieds/my-listings', label: 'My Listings' },
]

export default function ClassifiedsNav() {
  const pathname = usePathname()

  return (
    <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 w-fit">
      {TABS.map(tab => {
        const active = tab.href === '/classifieds'
          ? pathname === '/classifieds'
          : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              active
                ? 'bg-orange-500 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
