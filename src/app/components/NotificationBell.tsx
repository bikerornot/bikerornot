'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { getImageUrl } from '@/lib/supabase/image'
import { getNotifications, markAllRead } from '@/app/actions/notifications'
import type { Notification } from '@/lib/supabase/types'

function formatTimeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function notificationMessage(n: Notification): string {
  const actor = n.actor?.username ?? 'Someone'
  switch (n.type) {
    case 'friend_request':  return `@${actor} sent you a friend request`
    case 'friend_accepted': return `@${actor} accepted your friend request`
    case 'post_like':       return `@${actor} liked your post`
    case 'post_comment':    return `@${actor} commented on your post`
    case 'comment_reply':   return `@${actor} replied to your comment`
    case 'comment_like':    return `@${actor} liked your comment`
    default:                return `Notification from @${actor}`
  }
}

function notificationHref(n: Notification): string {
  const actorUsername = n.actor?.username
  if (actorUsername) return `/profile/${actorUsername}`
  return '/feed'
}

export default function NotificationBell({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter((n) => !n.read_at).length

  useEffect(() => {
    getNotifications().then(setNotifications)

    const supabase = createClient()
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from('notifications')
            .select('*, actor:profiles!actor_id(*)')
            .eq('id', payload.new.id)
            .single()
          if (data) {
            setNotifications((prev) =>
              prev.some((n) => n.id === data.id) ? prev : [data as Notification, ...prev]
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleMarkAllRead() {
    await markAllRead()
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-1.5 text-zinc-400 hover:text-white transition-colors"
        aria-label="Notifications"
      >
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-orange-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <h3 className="font-semibold text-white text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-zinc-500 hover:text-orange-400 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-zinc-800">
            {notifications.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-8">No notifications yet.</p>
            ) : (
              notifications.map((n) => {
                const avatarUrl = n.actor?.profile_photo_url
                  ? getImageUrl('avatars', n.actor.profile_photo_url)
                  : null
                const initials = (n.actor?.username?.[0] ?? '?').toUpperCase()

                return (
                  <Link
                    key={n.id}
                    href={notificationHref(n)}
                    onClick={() => setOpen(false)}
                    className={`flex gap-3 px-4 py-3 hover:bg-zinc-800 transition-colors ${
                      !n.read_at ? 'bg-zinc-800/40' : ''
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
                      {avatarUrl ? (
                        <Image
                          src={avatarUrl}
                          alt={initials}
                          width={36}
                          height={36}
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-300 text-sm font-bold">
                          {initials}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-zinc-200 text-sm leading-snug">
                        {notificationMessage(n)}
                      </p>
                      <p className="text-zinc-500 text-xs mt-0.5">{formatTimeAgo(n.created_at)}</p>
                    </div>
                    {!n.read_at && (
                      <div className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0 mt-2" />
                    )}
                  </Link>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
