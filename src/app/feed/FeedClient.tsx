'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Post, Profile } from '@/lib/supabase/types'
import PostCard from '@/app/components/PostCard'
import PostComposer from '@/app/components/PostComposer'
import AdCard from '@/app/components/AdCard'
import BikeMatchCard from '@/app/components/BikeMatchCard'
import { getNextAd, type AdData } from '@/app/actions/ads'
import { getFeedPage } from '@/app/actions/feed'

interface Props {
  currentUserId: string
  currentUserProfile: Profile
  blockedUserIds?: string[]
}

export default function FeedClient({ currentUserId, currentUserProfile, blockedUserIds = [] }: Props) {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [newPostCount, setNewPostCount] = useState(0)
  const [ad, setAd] = useState<AdData | null>(null)
  const pageRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Initial load
  useEffect(() => {
    getFeedPage(0)
      .then(({ posts: data, hasMore: more }) => {
        setPosts(data)
        setHasMore(more)
        pageRef.current = 0
      })
      .catch((err) => console.error('Feed fetch error:', err))
      .finally(() => setLoading(false))
  }, [])

  // Fetch ad exactly once
  const adFetchedRef = useRef(false)
  useEffect(() => {
    if (adFetchedRef.current) return
    adFetchedRef.current = true
    getNextAd().then(setAd).catch(() => {})
  }, [])

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
  }, [currentUserId, blockedUserIds])

  async function refresh() {
    setNewPostCount(0)
    const { posts: data, hasMore: more } = await getFeedPage(0)
    setPosts(data)
    setHasMore(more)
    pageRef.current = 0
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return
    setLoadingMore(true)
    const nextPage = pageRef.current + 1
    const { posts: newPosts, hasMore: more } = await getFeedPage(nextPage)
    setPosts((prev) => {
      const existingIds = new Set(prev.map((p) => p.id))
      const unique = newPosts.filter((p) => !existingIds.has(p.id))
      return [...prev, ...unique]
    })
    pageRef.current = nextPage
    setHasMore(more)
    setLoadingMore(false)
  }, [hasMore, loadingMore])

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
