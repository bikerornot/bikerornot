'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import type { OnlineUser } from '@/app/actions/admin'
import { getImageUrl } from '@/lib/supabase/image'
import VerifiedBadge from '@/app/components/VerifiedBadge'

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  return `${Math.floor(seconds / 60)}m ago`
}

function calcAge(dob: string): number {
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

function formatJoined(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface Props {
  initialUsers: OnlineUser[]
}

export default function OnlineClient({ initialUsers }: Props) {
  const router = useRouter()
  const [users, setUsers] = useState(initialUsers)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh()
      setLastRefresh(new Date())
    }, 30_000)
    return () => clearInterval(interval)
  }, [router])

  // Sync when server re-renders with fresh data
  useEffect(() => {
    setUsers(initialUsers)
  }, [initialUsers])

  if (users.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
        <p className="text-zinc-500 text-sm">No users online right now</p>
        <p className="text-zinc-600 text-xs mt-1">
          Last checked {lastRefresh.toLocaleTimeString()}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">User</th>
                <th className="text-left px-4 py-3 font-medium">Age</th>
                <th className="text-left px-4 py-3 font-medium">Gender</th>
                <th className="text-left px-4 py-3 font-medium">Location</th>
                <th className="text-left px-4 py-3 font-medium">Joined</th>
                <th className="text-left px-4 py-3 font-medium">Last seen</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const avatarUrl = u.profile_photo_url
                  ? getImageUrl('avatars', u.profile_photo_url)
                  : null
                return (
                  <tr
                    key={u.id}
                    className={`border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors cursor-pointer ${
                      i === users.length - 1 ? 'border-b-0' : ''
                    }`}
                    onClick={() => router.push(`/admin/users/${u.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="relative flex-shrink-0">
                          <div className="w-8 h-8 rounded-full bg-zinc-700 overflow-hidden">
                            {avatarUrl ? (
                              <Image src={avatarUrl} alt="" width={32} height={32} className="object-cover w-full h-full" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs font-bold">
                                {u.first_name?.[0]?.toUpperCase() ?? '?'}
                              </div>
                            )}
                          </div>
                          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-zinc-900" />
                        </div>
                        <div>
                          <p className="text-zinc-200 font-medium flex items-center gap-1">
                            {u.first_name} {u.last_name}
                            {u.phone_verified_at && <VerifiedBadge className="w-3.5 h-3.5" />}
                          </p>
                          <p className="text-zinc-500 text-xs">@{u.username ?? 'no username'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      {u.date_of_birth ? calcAge(u.date_of_birth) : '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs capitalize">
                      {u.gender ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      {u.city && u.state ? `${u.city}, ${u.state}` : u.state ?? u.city ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">
                      {formatJoined(u.created_at)}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">
                      {timeAgo(u.last_seen_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/users/${u.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-zinc-500 hover:text-orange-400 transition-colors text-xs font-medium"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-zinc-600 text-xs text-right">
        Last updated {lastRefresh.toLocaleTimeString()}
      </p>
    </div>
  )
}
