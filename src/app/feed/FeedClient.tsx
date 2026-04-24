'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeChannel } from '@/lib/useRealtimeChannel'
import { Post, Profile, UserBike } from '@/lib/supabase/types'
import PostCard from '@/app/components/PostCard'
import PostComposer from '@/app/components/PostComposer'
import AdCard from '@/app/components/AdCard'
import BikeMatchCard from '@/app/components/BikeMatchCard'
import SuggestedGroupsCard from '@/app/components/SuggestedGroupsCard'
import GuessTheHarleyCard from '@/app/components/GuessTheHarleyCard'
import RidersWidget from '@/app/components/RidersWidget'
import { getNextAd, type AdData } from '@/app/actions/ads'
import type { RiderSuggestion } from '@/app/actions/suggestions'
import {
  readFeedSnapshot,
  writeFeedSnapshot,
  clearFeedSnapshot,
  updateLastVisiblePostId,
  flushFeedSnapshot,
  feedDebug,
} from '@/lib/stores/feedStore'

const PAGE_SIZE = 10

interface Props {
  currentUserId: string
  currentUserProfile: Profile
  userGroupIds?: string[]
  blockedUserIds?: string[]
  initialRiders?: RiderSuggestion[]
  friendCount?: number
  userBikes?: UserBike[]
}

export default function FeedClient({ currentUserId, currentUserProfile, userGroupIds = [], blockedUserIds = [], initialRiders = [], friendCount = 0, userBikes = [] }: Props) {
  // Hydrate from the snapshot if one is fresh. This is what lets feed → profile
  // → back restore the user's scroll position and loaded pages instead of
  // dumping them at the top with an empty feed.
  const initialSnapshot = typeof window === 'undefined' ? null : readFeedSnapshot()
  const didHydrateRef = useRef(!!initialSnapshot)

  const [posts, setPosts] = useState<Post[]>(initialSnapshot?.posts ?? [])
  const [loading, setLoading] = useState(!initialSnapshot)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(initialSnapshot?.hasMore ?? true)
  const [newPostCount, setNewPostCount] = useState(0)
  const [ad, setAd] = useState<AdData | null>(null)
  const cursorRef = useRef<string | null>(initialSnapshot?.cursor ?? null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const lastVisiblePostIdRef = useRef<string | null>(initialSnapshot?.lastVisiblePostId ?? null)
  const visibleSetRef = useRef<Set<string>>(new Set())
  // True while we're actively pinning scroll to the restored anchor. During
  // this window the scroll tracker must NOT write new anchors to storage —
  // the layout is still shifting as images load above, and the top-of-viewport
  // post would be a stale read. Cleared by user intent or timeout.
  const restoringRef = useRef<boolean>(false)

  const fetchPosts = useCallback(
    async (cursor?: string): Promise<{ posts: Post[]; rawCursor: string | null; rawFull: boolean }> => {
      const supabase = createClient()

      let base = supabase
        .from('posts')
        .select('*, author:profiles!author_id(*), images:post_images(*), group:groups!group_id(name, slug), event:events!event_id(id, type, title, slug, starts_at, city, state, going_count, cover_photo_url, flyer_url, status), bike:user_bikes!bike_id(id, year, make, model, photo_url)')
        .is('deleted_at', null)
        .is('wall_owner_id', null)
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
      if (!data || data.length === 0) return { posts: [], rawCursor: null, rawFull: false }

      // Track pagination markers against the RAW result, not the filtered one — otherwise
      // a single banned/blocked author in a page silently ends the feed and strands every
      // post behind them. `rawFull` tells the outer flow there might be more, and
      // `rawCursor` advances past everything we pulled (including filtered-out rows).
      const rawCursor = data[data.length - 1].created_at
      const rawFull = data.length === PAGE_SIZE

      // Only keep posts where the author is confirmed active (not banned/suspended/missing)
      // and not from a blocked user
      const blockedSet = new Set(blockedUserIds)
      const filtered = data.filter((p) => p.author?.status === 'active' && !blockedSet.has(p.author_id))

      const postIds = filtered.map((p) => p.id)
      const sharedPostIds = filtered.map((p) => p.shared_post_id).filter(Boolean) as string[]

      const [{ data: likeCounts }, { data: commentCounts }, { data: myLikes }, { data: sharedPostsData }] =
        await Promise.all([
          supabase.from('post_likes').select('post_id, user:profiles!user_id(status)').in('post_id', postIds),
          supabase
            .from('comments')
            .select('post_id, author_id, hidden_at, author:profiles!author_id(status)')
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
                .select('*, author:profiles!author_id(*), images:post_images(*), event:events!event_id(id, type, title, slug, starts_at, city, state, going_count, cover_photo_url, flyer_url, status), bike:user_bikes!bike_id(id, year, make, model, photo_url)')
                .in('id', sharedPostIds)
            : Promise.resolve({ data: [] }),
        ])

      const likeMap = (likeCounts ?? []).reduce<Record<string, number>>((acc, r: any) => {
        if (['banned', 'suspended'].includes(r.user?.status)) return acc
        acc[r.post_id] = (acc[r.post_id] ?? 0) + 1
        return acc
      }, {})
      const postAuthorMap = new Map<string, string>(filtered.map((p) => [p.id, p.author_id]))
      const commentMap = (commentCounts ?? []).reduce<Record<string, number>>((acc, r: any) => {
        if (['banned', 'suspended'].includes(r.author?.status)) return acc
        if (blockedSet.has(r.author_id)) return acc
        // Hidden comments are only visible to the post author and the comment author —
        // skip from the count for everyone else so the badge matches what renders.
        if (r.hidden_at && currentUserId !== postAuthorMap.get(r.post_id) && currentUserId !== r.author_id) return acc
        acc[r.post_id] = (acc[r.post_id] ?? 0) + 1
        return acc
      }, {})
      const myLikeSet = new Set((myLikes ?? []).map((l) => l.post_id))
      const sharedPostMap: Record<string, Post> = {}
      for (const p of sharedPostsData ?? []) {
        if (p?.id) sharedPostMap[p.id] = p as Post
      }

      // Manual place lookup — PostgREST's embed wasn't resolving the
      // posts.place_id → places FK reliably, so fetch separately and
      // attach by id. One extra query per page; negligible.
      const placeIds = Array.from(
        new Set(filtered.map((p: any) => p.place_id).filter((v: unknown): v is string => !!v))
      )
      const placesMap: Record<string, any> = {}
      if (placeIds.length > 0) {
        const { data: placeRows } = await supabase.from('places').select('*').in('id', placeIds)
        for (const p of placeRows ?? []) placesMap[(p as any).id] = p
      }

      const posts = filtered.map((post) => ({
        ...post,
        like_count: likeMap[post.id] ?? 0,
        comment_count: commentMap[post.id] ?? 0,
        is_liked_by_me: myLikeSet.has(post.id),
        shared_post: post.shared_post_id ? (sharedPostMap[post.shared_post_id] ?? null) : null,
        place: (post as any).place_id ? (placesMap[(post as any).place_id] ?? null) : null,
      })) as Post[]

      return { posts, rawCursor, rawFull }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUserId, userGroupIds.join(','), blockedUserIds.join(',')]
  )

  // Initial fetch — only when we didn't hydrate from a snapshot.
  useEffect(() => {
    if (didHydrateRef.current) return
    fetchPosts()
      .then(({ posts, rawCursor, rawFull }) => {
        setPosts(posts)
        cursorRef.current = rawCursor
        setHasMore(rawFull)
      })
      .catch((err) => console.error('Feed fetch error:', err))
      .finally(() => setLoading(false))
  }, [fetchPosts])

  // Snapshot revalidation: when we hydrate from sessionStorage we're trusting
  // filter state frozen at write time. If an author got banned/suspended or
  // a post got deleted in the meantime, those rows survive the rehydration
  // and reappear on back-navigation. Re-check author status + post deleted_at
  // for hydrated posts and drop any that no longer qualify.
  useEffect(() => {
    if (!didHydrateRef.current) return
    if (posts.length === 0) return
    let cancelled = false
    const supabase = createClient()
    const postIds = posts.map((p) => p.id)
    const authorIds = Array.from(new Set(posts.map((p) => p.author_id)))
    Promise.all([
      supabase.from('profiles').select('id, status').in('id', authorIds),
      supabase.from('posts').select('id, deleted_at, place_id').in('id', postIds),
    ])
      .then(async ([{ data: authorRows }, { data: postRows }]) => {
        if (cancelled) return
        const activeAuthors = new Set(
          (authorRows ?? []).filter((r) => r.status === 'active').map((r) => r.id)
        )
        const livePosts = new Set(
          (postRows ?? []).filter((r) => r.deleted_at === null).map((r) => r.id)
        )
        const postPlaceIdMap = new Map<string, string | null>(
          (postRows ?? []).map((r: any) => [r.id, r.place_id ?? null])
        )
        // Hydrate places for posts whose snapshot pre-dates the check-in feature.
        const neededPlaceIds = Array.from(
          new Set(
            posts
              .filter((p) => !p.place)
              .map((p) => postPlaceIdMap.get(p.id))
              .filter((v): v is string => !!v)
          )
        )
        const placesMap: Record<string, any> = {}
        if (neededPlaceIds.length > 0) {
          const { data: placeRows } = await supabase.from('places').select('*').in('id', neededPlaceIds)
          for (const p of placeRows ?? []) placesMap[(p as any).id] = p
        }
        if (cancelled) return
        setPosts((prev) =>
          prev
            .filter((p) => activeAuthors.has(p.author_id) && livePosts.has(p.id))
            .map((p) => {
              const placeId = postPlaceIdMap.get(p.id)
              if (!placeId) return p
              if (p.place) return p
              const place = placesMap[placeId]
              return place ? ({ ...p, place_id: placeId, place } as Post) : p
            })
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Scroll restoration — deliberately simple. We scroll to the anchor once
  // in useLayoutEffect (pre-paint) and that's it. The earlier settle-loop
  // / ResizeObserver / multi-phase approach was racing layout shifts from
  // image loads and caused worse bugs than it solved (including blocking
  // comment expansion). The real fix for shift-induced drift is making
  // images reserve space at render time — separate work in progress.
  useLayoutEffect(() => {
    if (!didHydrateRef.current) return
    const id = lastVisiblePostIdRef.current
    if (!id) return
    feedDebug('restore: scroll to anchor', { anchor: id })
    const el = document.getElementById(`post-${id}`)
    if (el) el.scrollIntoView({ block: 'start' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-try restoration when the page is restored from the back-forward cache
  // (common on iOS Safari). The page's DOM is already there, but our store
  // state may or may not be — we just re-read and re-scroll.
  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (!e.persisted) return
      const snap = readFeedSnapshot()
      const id = snap?.lastVisiblePostId ?? lastVisiblePostIdRef.current
      if (!id) return
      requestAnimationFrame(() => {
        const el = document.getElementById(`post-${id}`)
        if (el) el.scrollIntoView({ block: 'start' })
      })
    }
    // pagehide fires when the user navigates away — flush the latest anchor to
    // sessionStorage so bfcache-miss reloads can still rehydrate.
    function onPageHide() {
      flushFeedSnapshot()
    }
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [])

  // Persist snapshot whenever loaded posts / pagination state changes so the
  // next mount can rehydrate. lastVisiblePostIdRef is captured live via the
  // IntersectionObserver below.
  useEffect(() => {
    if (loading) return
    if (posts.length === 0) return
    writeFeedSnapshot({
      posts,
      cursor: cursorRef.current,
      hasMore,
      lastVisiblePostId: lastVisiblePostIdRef.current,
    })
  }, [posts, hasMore, loading])

  // Track which post is currently at the top of the viewport. rAF-throttled
  // scroll listener only — no pointerdown interception. The document-level
  // capture pointerdown listener was interfering with comment expansion on
  // mobile Safari. Anchor freshness loses a tiny edge case (fast click right
  // after a scroll) but is way better than breaking interactions.
  useEffect(() => {
    if (loading || posts.length === 0) return
    const THRESHOLD = 80 // just below the sticky header
    let frame = 0

    function recompute() {
      frame = 0
      for (const p of posts) {
        const el = document.getElementById(`post-${p.id}`)
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (rect.bottom > THRESHOLD) {
          lastVisiblePostIdRef.current = p.id
          updateLastVisiblePostId(p.id)
          return
        }
      }
    }

    function onScroll() {
      if (frame) return
      frame = requestAnimationFrame(recompute)
    }

    recompute() // seed once
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [posts, loading])

  // Fetch ad exactly once — ref guard prevents StrictMode double-fire
  const adFetchedRef = useRef(false)
  useEffect(() => {
    if (adFetchedRef.current) return
    adFetchedRef.current = true
    getNextAd().then(setAd).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: notify when others post
  useRealtimeChannel(
    'feed-new-posts',
    (channel) =>
      channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        (payload) => {
          const newPost = payload.new as Record<string, unknown> | null
          if (!newPost?.author_id) return
          if (newPost.author_id !== currentUserId && !blockedUserIds.includes(newPost.author_id as string)) {
            setNewPostCount((c) => c + 1)
          }
        }
      ),
    [currentUserId, blockedUserIds]
  )

  async function refresh() {
    setNewPostCount(0)
    // User explicitly asked for a fresh feed — throw away the snapshot so we
    // don't restore an old anchor on the next navigation.
    clearFeedSnapshot()
    lastVisiblePostIdRef.current = null
    visibleSetRef.current.clear()
    const { posts, rawCursor, rawFull } = await fetchPosts()
    setPosts(posts)
    cursorRef.current = rawCursor
    setHasMore(rawFull)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // When a user likes/unlikes or adds a comment on a PostCard, reflect that in
  // the posts array so the sessionStorage snapshot stays current. Without this
  // the snapshot keeps pre-click state and the indicator "resets" on refresh.
  //
  // Each handler MUST return `prev` when nothing actually changed. `.map()`
  // always produces a new array even if no element is rewritten, so a
  // no-op setPosts still triggers a re-render. PostCard re-creates its
  // `updateCommentCount` closure on every render, which flips CommentSection's
  // useEffect identity dep, which re-fires the effect, which calls
  // updateCommentCount again — an infinite render loop that starves the
  // concurrent transition Next.js Link clicks rely on, producing a bug where
  // clicks queue and only commit once comments collapse.
  const handleLikeChange = useCallback((postId: string, liked: boolean, likeCount: number) => {
    setPosts((prev) => {
      const target = prev.find((p) => p.id === postId)
      if (!target) return prev
      if (target.is_liked_by_me === liked && target.like_count === likeCount) return prev
      return prev.map((p) => (p.id === postId ? { ...p, is_liked_by_me: liked, like_count: likeCount } : p))
    })
  }, [])

  const handleCommentCountChange = useCallback((postId: string, count: number) => {
    setPosts((prev) => {
      const target = prev.find((p) => p.id === postId)
      if (!target || target.comment_count === count) return prev
      return prev.map((p) => (p.id === postId ? { ...p, comment_count: count } : p))
    })
  }, [])

  // Drop the post from the array so the persisted snapshot doesn't resurrect
  // it on the next navigation. PostCard hides itself locally too, but that
  // only covers the current mount.
  const handleDelete = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId))
  }, [])

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !cursorRef.current) return
    setLoadingMore(true)
    const { posts, rawCursor, rawFull } = await fetchPosts(cursorRef.current)
    setPosts((prev) => [...prev, ...posts])
    if (rawCursor) cursorRef.current = rawCursor
    setHasMore(rawFull)
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
    <div className="space-y-3 sm:space-y-4">
      <PostComposer currentUserProfile={currentUserProfile} bikes={userBikes} onPostCreated={refresh} />

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
          <p className="text-zinc-600 text-sm mt-1">Be the first to share something!</p>
        </div>
      )}

      {posts.map((post, idx) => (
        <div key={post.id} id={`post-${post.id}`} data-post-id={post.id} className="scroll-mt-16">
          <PostCard
            post={post}
            currentUserId={currentUserId}
            currentUserProfile={currentUserProfile}
            blockedUserIds={blockedUserIds}
            userGroupIds={userGroupIds}
            onLikeChange={handleLikeChange}
            onCommentCountChange={handleCommentCountChange}
            onDelete={handleDelete}
          />
          {idx === 0 && initialRiders.length > 0 && (
            <div className="mt-2 sm:mt-4">
              <RidersWidget initialRiders={initialRiders} friendCount={friendCount} />
            </div>
          )}
          {idx === Math.min(1, posts.length - 1) && ad && (
            <div className="mt-2 sm:mt-4">
              <AdCard ad={ad} onDismiss={() => setAd(null)} />
            </div>
          )}
          {idx === Math.min(4, posts.length - 1) && (
            <div className="mt-2 sm:mt-4">
              <BikeMatchCard currentUserId={currentUserId} />
            </div>
          )}
          {idx === Math.min(5, posts.length - 1) && (
            <div className="mt-2 sm:mt-4">
              <SuggestedGroupsCard currentUserId={currentUserId} />
            </div>
          )}
          {idx === Math.min(7, posts.length - 1) && (
            <div className="mt-2 sm:mt-4">
              <GuessTheHarleyCard currentUserId={currentUserId} />
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
          <p className="text-zinc-600 text-sm">You're all caught up</p>
        </div>
      )}
    </div>
  )
}
