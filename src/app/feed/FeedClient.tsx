'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Post, Profile } from '@/lib/supabase/types'
import PostCard from '@/app/components/PostCard'
import PostComposer from '@/app/components/PostComposer'
import AdCard from '@/app/components/AdCard'
import BikeMatchCard from '@/app/components/BikeMatchCard'
import { getNextAd, type AdData } from '@/app/actions/ads'

const PAGE_SIZE = 10

interface Props {
  currentUserId: string
  currentUserProfile: Profile
  userGroupIds?: string[]
  blockedUserIds?: string[]
}

export default function FeedClient({ currentUserId, currentUserProfile, userGroupIds = [], blockedUserIds = [] }: Props) {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [newPostCount, setNewPostCount] = useState(0)
  const [ad, setAd] = useState<AdData | null>(null)
  const cursorRef = useRef<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const fetchPosts = useCallback(
    async (cursor?: string): Promise<Post[]> => {
      const supabase = createClient()

      let base = supabase
        .from('posts')
        .select('*, author:profiles!author_id(*), images:post_images(*), group:groups!group_id(name, slug), event:events!event_id(id, type, title, slug, starts_at, city, state, going_count, cover_photo_url, status)')
        .is('deleted_at', null)
        .is('wall_owner_id', null)
        .is('bike_id', null)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      // Always filter: show non-group posts plus posts from groups the user belongs to.
      // When the user is in no groups, only non-group posts are shown (group_id must be null).
      if (userGroupIds.length > 0) {
        base = base.or(`group_id.is.null,group_id.in.(${userGroupIds.join(',')})`) as typeof base
      } else {
        base = base.is('group_id', null) as typeof base
      }

      const { data, error } = cursor ? await base.lt('created_at', cursor) : await base

      if (error) throw error
      if (!data || data.length === 0) return []

      // Only keep posts where the author is confirmed active (not banned/suspended/missing)
      // and not from a blocked user
      const blockedSet = new Set(blockedUserIds)
      const filtered = data.filter((p) => p.author?.status === 'active' && !blockedSet.has(p.author_id))

      const postIds = filtered.map((p) => p.id)
      const sharedPostIds = filtered.map((p) => p.shared_post_id).filter(Boolean) as string[]

      const [{ data: likeCounts }, { data: commentCounts }, { data: myLikes }, { data: sharedPostsData }] =
        await Promise.all([
          supabase.from('post_likes').select('post_id').in('post_id', postIds),
          supabase
            .from('comments')
            .select('post_id, author:profiles!author_id(status)')
            .in('post_id', postIds)
            .is('deleted_at', null),
          supabase
            .from('post_likes')
            .select('post_id')
            .in('post_id', postIds)
            .eq('user_id', currentUserId),
          sharedPostIds.length > 0
            ? supabase
                .from('posts')
                .select('*, author:profiles!author_id(*), images:post_images(*)')
                .in('id', sharedPostIds)
            : Promise.resolve({ data: [] }),
        ])

      const likeMap = (likeCounts ?? []).reduce<Record<string, number>>((acc, r) => {
        acc[r.post_id] = (acc[r.post_id] ?? 0) + 1
        return acc
      }, {})
      const commentMap = (commentCounts ?? []).reduce<Record<string, number>>((acc, r: any) => {
        if (['banned', 'suspended'].includes(r.author?.status)) return acc
        acc[r.post_id] = (acc[r.post_id] ?? 0) + 1
        return acc
      }, {})
      const myLikeSet = new Set((myLikes ?? []).map((l) => l.post_id))
      const sharedPostMap: Record<string, Post> = {}
      for (const p of sharedPostsData ?? []) {
        if (p?.id) sharedPostMap[p.id] = p as Post
      }

      return filtered.map((post) => ({
        ...post,
        like_count: likeMap[post.id] ?? 0,
        comment_count: commentMap[post.id] ?? 0,
        is_liked_by_me: myLikeSet.has(post.id),
        shared_post: post.shared_post_id ? (sharedPostMap[post.shared_post_id] ?? null) : null,
      })) as Post[]
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUserId, userGroupIds.join(','), blockedUserIds.join(',')]
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

  // Fetch ad exactly once — ref guard prevents StrictMode double-fire
  const adFetchedRef = useRef(false)
  useEffect(() => {
    if (adFetchedRef.current) return
    adFetchedRef.current = true
    getNextAd().then(setAd).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: notify when others post
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('feed-new-posts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        (payload) => {
          const newPost = payload.new as Record<string, unknown> | null
          if (!newPost?.author_id) return
          if (newPost.author_id !== currentUserId && !blockedUserIds.includes(newPost.author_id as string)) {
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

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !cursorRef.current) return
    setLoadingMore(true)
    const data = await fetchPosts(cursorRef.current)
    setPosts((prev) => [...prev, ...data])
    if (data.length > 0) cursorRef.current = data[data.length - 1].created_at
    setHasMore(data.length === PAGE_SIZE)
    setLoadingMore(false)
  }, [hasMore, loadingMore, fetchPosts])

  // Infinite scroll — fire loadMore when sentinel enters the viewport
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore() },
      { rootMargin: '300px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  return (
    <div className="space-y-2 sm:space-y-4">
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
        <div className="bg-zinc-900 sm:rounded-xl sm:border sm:border-zinc-800 p-8 text-center">
          <p className="text-zinc-500 text-sm">Loading…</p>
        </div>
      )}

      {!loading && posts.length === 0 && (
        <div className="bg-zinc-900 sm:rounded-xl sm:border sm:border-zinc-800 p-8 text-center">
          <p className="text-zinc-400 text-sm">No posts yet.</p>
          <p className="text-zinc-600 text-xs mt-1">Be the first to share something!</p>
        </div>
      )}

      {posts.map((post, idx) => (
        <div key={post.id}>
          <PostCard
            post={post}
            currentUserId={currentUserId}
            currentUserProfile={currentUserProfile}
            blockedUserIds={blockedUserIds}
          />
          {idx === 0 && ad && (
            <div className="mt-2 sm:mt-4">
              <AdCard ad={ad} onDismiss={() => setAd(null)} />
            </div>
          )}
          {idx === Math.min(4, posts.length - 1) && (
            <div className="mt-2 sm:mt-4">
              <BikeMatchCard currentUserId={currentUserId} />
            </div>
          )}
        </div>
      ))}

      {/* Sentinel — IntersectionObserver watches this to trigger next page */}
      <div ref={sentinelRef} />

      {loadingMore && (
        <div className="py-6 text-center">
          <p className="text-zinc-500 text-sm">Loading…</p>
        </div>
      )}

      {!hasMore && !loading && posts.length > 0 && (
        <div className="py-6 text-center">
          <p className="text-zinc-600 text-xs">You're all caught up</p>
        </div>
      )}
    </div>
  )
}
