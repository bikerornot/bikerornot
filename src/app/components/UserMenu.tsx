'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

interface Props {
  username: string
  displayName: string
  avatarUrl: string | null
  firstInitial: string
  role?: string
}

export default function UserMenu({ username, displayName, avatarUrl, firstInitial, role }: Props) {
  const [open, setOpen] = useState(false)
  const [loggingOut, startLogout] = useTransition()
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleLogout() {
    startLogout(async () => {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
    })
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <div className="w-8 h-8 rounded-full bg-zinc-700 overflow-hidden">
          {avatarUrl ? (
            <Image src={avatarUrl} alt={displayName} width={32} height={32} className="object-cover w-full h-full" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm font-bold">
              {firstInitial}
            </div>
          )}
        </div>
        <span className="text-zinc-300 text-sm hidden sm:block">@{username}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-44 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-50 overflow-hidden">
          <Link
            href={`/profile/${username}`}
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            My Profile
          </Link>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            Settings
          </Link>
          {(role === 'admin' || role === 'moderator') && (
            <>
              <div className="border-t border-zinc-800" />
              <Link
                href="/admin/reports"
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 text-sm text-orange-400 hover:bg-zinc-800 transition-colors"
              >
                Mod Queue
              </Link>
            </>
          )}
          <div className="border-t border-zinc-800" />
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            {loggingOut ? 'Signing out…' : 'Sign Out'}
          </button>
        </div>
      )}
    </div>
  )
}
