'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Post, Profile } from '@/lib/supabase/types'
import PostCard from '@/app/components/PostCard'
import PostComposer from '@/app/components/PostComposer'

const PAGE_SIZE = 10

interface Props {
  currentUserId: string
  currentUserProfile: Profile
  userGroupIds?: string[]
}

export default function FeedClient({ currentUserId, currentUserProfile, userGroupIds = [] }: Props) {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [newPostCount, setNewPostCount] = useState(0)
  const cursorRef = useRef<string | null>(null)

  const fetchPosts = useCallback(
    async (cursor?: string): Promise<Post[]> => {
      const supabase = createClient()

      let base = supabase
        .from('posts')
        .select('*, author:profiles!author_id(*), images:post_images(*)')
        .is('deleted_at', null)
        .is('wall_owner_id', null)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      // Show non-group posts plus posts from groups the user is in.
      // Only apply group_id filter if user has group memberships (column may not
      // exist yet if migration hasn't run, so we skip the filter when the list is empty).
      if (userGroupIds.length > 0) {
        base = base.or(`group_id.is.null,group_id.in.(${userGroupIds.join(',')})`) as typeof base
      }

      const { data, error } = cursor ? await base.lt('created_at', cursor) : await base

      if (error) throw error
      if (!data || data.length === 0) return []

      const postIds = data.map((p) => p.id)

      const [{ data: likeCounts }, { data: commentCounts }, { data: myLikes }] =
        await Promise.all([
          supabase.from('post_likes').select('post_id').in('post_id', postIds),
          supabase
            .from('comments')
            .select('post_id')
            .in('post_id', postIds)
            .is('deleted_at', null),
          supabase
            .from('post_likes')
            .select('post_id')
            .in('post_id', postIds)
            .eq('user_id', currentUserId),
        ])

      const likeMap = (likeCounts ?? []).reduce<Record<string, number>>((acc, r) => {
        acc[r.post_id] = (acc[r.post_id] ?? 0) + 1
        return acc
      }, {})
      const commentMap = (commentCounts ?? []).reduce<Record<string, number>>((acc, r) => {
        acc[r.post_id] = (acc[r.post_id] ?? 0) + 1
        return acc
      }, {})
      const myLikeSet = new Set((myLikes ?? []).map((l) => l.post_id))

      return data.map((post) => ({
        ...post,
        like_count: likeMap[post.id] ?? 0,
        comment_count: commentMap[post.id] ?? 0,
        is_liked_by_me: myLikeSet.has(post.id),
      })) as Post[]
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUserId, userGroupIds.join(',')]
  )

  useEffect(() => {
    fetchPosts()
      .then((data) => {
        setPosts(data)
        cursorRef.current = data.length > 0 ? data[data.length - 1].created_at : null
        setHasMore(data.length === PAGE_SIZE)
      })
      .catch((err) => console.error('Feed fetch error:', err))
      .finally(() => setLoading(false))
  }, [fetchPosts])

  // Realtime: notify when others post
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('feed-new-posts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        (payload) => {
          if (payload.new.author_id !== currentUserId) {
            setNewPostCount((c) => c + 1)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUserId])

  async function refresh() {
    setNewPostCount(0)
    const data = await fetchPosts()
    setPosts(data)
    cursorRef.current = data.length > 0 ? data[data.length - 1].created_at : null
    setHasMore(data.length === PAGE_SIZE)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function loadMore() {
    if (!hasMore || loadingMore || !cursorRef.current) return
    setLoadingMore(true)
    const data = await fetchPosts(cursorRef.current)
    setPosts((prev) => [...prev, ...data])
    if (data.length > 0) cursorRef.current = data[data.length - 1].created_at
    setHasMore(data.length === PAGE_SIZE)
    setLoadingMore(false)
  }

  return (
    <div className="space-y-4">
      <PostComposer currentUserProfile={currentUserProfile} onPostCreated={refresh} />

      {newPostCount > 0 && (
        <button
          onClick={refresh}
          className="w-full bg-orange-500/10 border border-orange-500/30 text-orange-400 text-sm font-medium py-2.5 rounded-xl hover:bg-orange-500/20 transition-colors"
        >
          {newPostCount} new post{newPostCount !== 1 ? 's' : ''} — tap to refresh
        </button>
      )}

      {loading && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
          <p className="text-zinc-500 text-sm">Loading…</p>
        </div>
      )}

      {!loading && posts.length === 0 && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
          <p className="text-zinc-400 text-sm">No posts yet.</p>
          <p className="text-zinc-600 text-xs mt-1">Be the first to share something!</p>
        </div>
      )}

      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          currentUserId={currentUserId}
          currentUserProfile={currentUserProfile}
        />
      ))}

      {hasMore && !loading && (
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
  )
}
