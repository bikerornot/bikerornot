'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { getImageUrl } from '@/lib/supabase/image'
import Link from 'next/link'
import { getNotifications, markRead, markAllRead } from '@/app/actions/notifications'
import { acceptFriendRequest, declineFriendRequest } from '@/app/actions/friends'
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
    case 'group_invite':    return `@${actor} invited you to join ${n.group?.name ?? 'a group'}`
    case 'wall_post':       return `@${actor} posted on your wall`
    default:                return `Notification from @${actor}`
  }
}

function notificationHref(n: Notification, currentUsername: string): string {
  const actorUsername = n.actor?.username
  switch (n.type) {
    case 'friend_request':
    case 'friend_accepted':
      return actorUsername ? `/profile/${actorUsername}` : '/feed'
    case 'post_like':
    case 'post_comment':
    case 'comment_reply':
    case 'comment_like':
      return `/profile/${currentUsername}`
    case 'group_invite':
      return n.group?.slug ? `/groups/${n.group.slug}` : '/groups'
    case 'wall_post':
      return `/profile/${currentUsername}`
    default:
      return '/feed'
  }
}

interface Props {
  userId: string
  username: string
}

export default function NotificationBell({ userId, username }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [actingOn, setActingOn] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const unreadCount = notifications.filter((n) => !n.read_at).length

  // Pending friend requests = unread friend_request notifications
  const pendingRequests = notifications.filter(
    (n) => n.type === 'friend_request' && !n.read_at
  )
  // Everything else (including read friend_requests)
  const otherNotifications = notifications.filter(
    (n) => !(n.type === 'friend_request' && !n.read_at)
  )

  useEffect(() => {
    getNotifications().then(setNotifications)

    const supabase = createClient()
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        async (payload) => {
          const { data } = await supabase
            .from('notifications')
            .select('*, actor:profiles!actor_id(*), group:groups!group_id(id, name, slug)')
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

    return () => { supabase.removeChannel(channel) }
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

  function markReadOptimistically(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    )
  }

  async function handleAccept(n: Notification) {
    setActingOn(n.id)
    markReadOptimistically(n.id)
    try {
      await acceptFriendRequest(n.actor_id)
      markRead(n.id)
    } finally {
      setActingOn(null)
    }
  }

  async function handleDecline(n: Notification) {
    setActingOn(n.id)
    markReadOptimistically(n.id)
    try {
      await declineFriendRequest(n.actor_id)
      markRead(n.id)
    } finally {
      setActingOn(null)
    }
  }

  async function handleNotificationClick(n: Notification) {
    setOpen(false)
    if (!n.read_at) {
      markReadOptimistically(n.id)
      markRead(n.id)
    }
    router.push(notificationHref(n, username))
  }

  async function handleMarkAllRead() {
    await markAllRead()
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))
    )
  }

  function Avatar({ n }: { n: Notification }) {
    const avatarUrl = n.actor?.profile_photo_url
      ? getImageUrl('avatars', n.actor.profile_photo_url)
      : null
    const initials = (n.actor?.username?.[0] ?? '?').toUpperCase()
    return (
      <div className="w-9 h-9 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
        {avatarUrl ? (
          <Image src={avatarUrl} alt={initials} width={36} height={36} className="object-cover w-full h-full" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-300 text-sm font-bold">
            {initials}
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-1.5 text-zinc-400 hover:text-white transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          {/* Header */}
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

          <div className="max-h-[28rem] overflow-y-auto">
            {/* ── Friend requests section ── */}
            {pendingRequests.length > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-orange-400 uppercase tracking-wider">
                  Friend Requests
                </p>
                {pendingRequests.map((n) => (
                  <div key={n.id} className="px-4 py-3 bg-zinc-800/50 border-b border-zinc-800">
                    <Link
                      href={n.actor?.username ? `/profile/${n.actor.username}` : '/feed'}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                    >
                      <Avatar n={n} />
                      <div className="flex-1 min-w-0">
                        <p className="text-zinc-200 text-sm leading-snug">
                          <span className="font-semibold text-white">@{n.actor?.username}</span>
                          {' '}wants to be your friend
                        </p>
                        <p className="text-zinc-500 text-xs mt-0.5">{formatTimeAgo(n.created_at)} · View profile</p>
                      </div>
                    </Link>
                    <div className="flex gap-2 mt-2.5">
                      <button
                        onClick={() => handleAccept(n)}
                        disabled={actingOn === n.id}
                        className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-xs font-semibold py-1.5 rounded-lg transition-colors"
                      >
                        {actingOn === n.id ? '…' : 'Accept'}
                      </button>
                      <button
                        onClick={() => handleDecline(n)}
                        disabled={actingOn === n.id}
                        className="flex-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-200 text-xs font-semibold py-1.5 rounded-lg transition-colors"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Other notifications section ── */}
            {otherNotifications.length > 0 && (
              <div>
                {pendingRequests.length > 0 && (
                  <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                    Recent
                  </p>
                )}
                <div className="divide-y divide-zinc-800">
                  {otherNotifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={`w-full flex gap-3 px-4 py-3 hover:bg-zinc-800 transition-colors text-left ${
                        !n.read_at ? 'bg-zinc-800/40' : ''
                      }`}
                    >
                      <Avatar n={n} />
                      <div className="flex-1 min-w-0">
                        <p className="text-zinc-200 text-sm leading-snug">
                          {notificationMessage(n)}
                        </p>
                        <p className="text-zinc-500 text-xs mt-0.5">{formatTimeAgo(n.created_at)}</p>
                      </div>
                      {!n.read_at && (
                        <div className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0 mt-2" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {notifications.length === 0 && (
              <p className="text-zinc-500 text-sm text-center py-8">No notifications yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
