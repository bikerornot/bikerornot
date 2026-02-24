'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Group, GroupMember, Post, Profile } from '@/lib/supabase/types'
import { getGroupPosts, approveRequest, denyRequest, removeMember } from '@/app/actions/groups'
import { getImageUrl } from '@/lib/supabase/image'
import PostCard from '@/app/components/PostCard'
import PostComposer from '@/app/components/PostComposer'

const PAGE_SIZE = 10

type Tab = 'posts' | 'members' | 'requests'

interface Props {
  group: Group
  currentUserId: string | null
  currentUserProfile: Profile | null
  initialPosts: Post[]
  initialMembers: GroupMember[]
  initialRequests: GroupMember[]
  isMember: boolean
  isAdmin: boolean
}

export default function GroupTabs({
  group,
  currentUserId,
  currentUserProfile,
  initialPosts,
  initialMembers,
  initialRequests,
  isMember,
  isAdmin,
}: Props) {
  const [tab, setTab] = useState<Tab>('posts')
  const [posts, setPosts] = useState<Post[]>(initialPosts)
  const [members, setMembers] = useState<GroupMember[]>(initialMembers)
  const [requests, setRequests] = useState<GroupMember[]>(initialRequests)
  const [hasMore, setHasMore] = useState(initialPosts.length === PAGE_SIZE)
  const [loadingMore, setLoadingMore] = useState(false)
  const [newPostCount, setNewPostCount] = useState(0)
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set())
  const cursorRef = useRef<string | null>(
    initialPosts.length > 0 ? initialPosts[initialPosts.length - 1].created_at : null
  )

  const showRequests = isAdmin && group.privacy === 'private'

  // Realtime for new group posts
  useEffect(() => {
    if (!isMember) return
    const supabase = createClient()
    const channel = supabase
      .channel(`group-posts-${group.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'posts',
          filter: `group_id=eq.${group.id}`,
        },
        (payload) => {
          if (payload.new.author_id !== currentUserId) {
            setNewPostCount((c) => c + 1)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [group.id, currentUserId, isMember])

  async function refresh() {
    setNewPostCount(0)
    const data = await getGroupPosts(group.id)
    setPosts(data)
    cursorRef.current = data.length > 0 ? data[data.length - 1].created_at : null
    setHasMore(data.length === PAGE_SIZE)
  }

  async function loadMore() {
    if (!hasMore || loadingMore || !cursorRef.current) return
    setLoadingMore(true)
    const data = await getGroupPosts(group.id, cursorRef.current)
    setPosts((prev) => [...prev, ...data])
    if (data.length > 0) cursorRef.current = data[data.length - 1].created_at
    setHasMore(data.length === PAGE_SIZE)
    setLoadingMore(false)
  }

  async function handleRemove(userId: string) {
    if (pendingActions.has(userId)) return
    setPendingActions((p) => new Set(p).add(userId))
    try {
      await removeMember(group.id, userId)
      setMembers((prev) => prev.filter((m) => m.user_id !== userId))
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to remove member')
    } finally {
      setPendingActions((p) => { const n = new Set(p); n.delete(userId); return n })
    }
  }

  async function handleApprove(userId: string) {
    if (pendingActions.has(userId)) return
    setPendingActions((p) => new Set(p).add(userId))
    try {
      await approveRequest(group.id, userId)
      setRequests((prev) => prev.filter((r) => r.user_id !== userId))
    } catch (err) {
      console.error(err)
    } finally {
      setPendingActions((p) => { const n = new Set(p); n.delete(userId); return n })
    }
  }

  async function handleDeny(userId: string) {
    if (pendingActions.has(userId)) return
    setPendingActions((p) => new Set(p).add(userId))
    try {
      await denyRequest(group.id, userId)
      setRequests((prev) => prev.filter((r) => r.user_id !== userId))
    } catch (err) {
      console.error(err)
    } finally {
      setPendingActions((p) => { const n = new Set(p); n.delete(userId); return n })
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'posts', label: 'Posts' },
    { key: 'members', label: `Members (${members.length})` },
    ...(showRequests ? [{ key: 'requests' as Tab, label: `Requests (${requests.length})` }] : []),
  ]

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-zinc-800 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Posts tab */}
      {tab === 'posts' && (
        <div className="space-y-4">
          {isMember && currentUserProfile && (
            <PostComposer
              currentUserProfile={currentUserProfile}
              groupId={group.id}
              onPostCreated={refresh}
            />
          )}

          {newPostCount > 0 && (
            <button
              onClick={refresh}
              className="w-full bg-orange-500/10 border border-orange-500/30 text-orange-400 text-sm font-medium py-2.5 rounded-xl hover:bg-orange-500/20 transition-colors"
            >
              {newPostCount} new post{newPostCount !== 1 ? 's' : ''} — tap to refresh
            </button>
          )}

          {!isMember && group.privacy === 'private' && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
              <div className="text-4xl mb-3">🔒</div>
              <p className="text-zinc-300 font-medium mb-1">This is a private group</p>
              <p className="text-zinc-500 text-sm">Request to join to see posts.</p>
            </div>
          )}

          {(isMember || group.privacy === 'public') && posts.length === 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
              <p className="text-zinc-400 text-sm">No posts yet.</p>
              {isMember && <p className="text-zinc-600 text-xs mt-1">Be the first to share something!</p>}
            </div>
          )}

          {(isMember || group.privacy === 'public') && posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={currentUserId ?? ''}
              currentUserProfile={currentUserProfile}
            />
          ))}

          {(isMember || group.privacy === 'public') && hasMore && (
            <div className="text-center py-2">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="text-orange-400 hover:text-orange-300 disabled:opacity-40 text-sm font-medium transition-colors"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Members tab */}
      {tab === 'members' && (
        <div className="space-y-2">
          {members.length === 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
              <p className="text-zinc-500 text-sm">No members yet.</p>
            </div>
          )}
          {members.map((m) => {
            const profile = m.profile as Profile | undefined
            if (!profile) return null
            const avatarUrl = profile.profile_photo_url
              ? getImageUrl('avatars', profile.profile_photo_url)
              : null

            return (
              <Link
                key={m.id}
                href={`/profile/${profile.username}`}
                className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 hover:border-zinc-700 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
                  {avatarUrl ? (
                    <Image src={avatarUrl} alt={profile.username ?? ''} width={40} height={40} className="object-cover w-full h-full" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold text-zinc-400">
                      {(profile.first_name?.[0] ?? '?').toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm truncate">@{profile.username}</p>
                  {profile.city || profile.state ? (
                    <p className="text-zinc-500 text-xs">{[profile.city, profile.state].filter(Boolean).join(', ')}</p>
                  ) : null}
                </div>
                {m.role === 'admin' && (
                  <span className="text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-full">
                    Admin
                  </span>
                )}
                {isAdmin && m.role !== 'admin' && m.user_id !== currentUserId && (
                  <button
                    onClick={(e) => { e.preventDefault(); handleRemove(m.user_id) }}
                    disabled={pendingActions.has(m.user_id)}
                    className="text-xs bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 text-zinc-500 border border-zinc-700 px-2.5 py-1 rounded-full transition-colors disabled:opacity-40"
                  >
                    {pendingActions.has(m.user_id) ? '…' : 'Remove'}
                  </button>
                )}
              </Link>
            )
          })}
        </div>
      )}

      {/* Requests tab (admin only) */}
      {tab === 'requests' && showRequests && (
        <div className="space-y-2">
          {requests.length === 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
              <p className="text-zinc-500 text-sm">No pending requests.</p>
            </div>
          )}
          {requests.map((r) => {
            const profile = r.profile as Profile | undefined
            if (!profile) return null
            const avatarUrl = profile.profile_photo_url
              ? getImageUrl('avatars', profile.profile_photo_url)
              : null
            const isLoading = pendingActions.has(r.user_id)

            return (
              <div
                key={r.id}
                className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3"
              >
                <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
                  {avatarUrl ? (
                    <Image src={avatarUrl} alt={profile.username ?? ''} width={40} height={40} className="object-cover w-full h-full" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold text-zinc-400">
                      {(profile.first_name?.[0] ?? '?').toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <Link href={`/profile/${profile.username}`} className="text-white font-medium text-sm hover:text-orange-400 transition-colors">
                    @{profile.username}
                  </Link>
                  {profile.city || profile.state ? (
                    <p className="text-zinc-500 text-xs">{[profile.city, profile.state].filter(Boolean).join(', ')}</p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(r.user_id)}
                    disabled={isLoading}
                    className="text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-full font-medium transition-colors disabled:opacity-40"
                  >
                    {isLoading ? '…' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleDeny(r.user_id)}
                    disabled={isLoading}
                    className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border border-zinc-700 px-3 py-1.5 rounded-full font-medium transition-colors disabled:opacity-40"
                  >
                    {isLoading ? '…' : 'Deny'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
