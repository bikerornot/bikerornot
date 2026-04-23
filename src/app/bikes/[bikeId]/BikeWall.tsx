'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Post, Profile } from '@/lib/supabase/types'
import PostCard from '@/app/components/PostCard'
import PostComposer from '@/app/components/PostComposer'

const PAGE_SIZE = 10

interface Props {
  bikeId: string
  isOwnGarage: boolean
  isFriend: boolean
  garageOwnerId: string
  currentUserId?: string
  currentUserProfile?: Profile | null
}

export default function BikeWall({
  bikeId,
  isOwnGarage,
  isFriend,
  garageOwnerId,
  currentUserId,
  currentUserProfile,
}: Props) {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const cursorRef = useRef<string | null>(null)

  const fetchPosts = useCallback(
    async (cursor?: string): Promise<Post[]> => {
      const supabase = createClient()

      const base = supabase
        .from('posts')
        .select('*, author:profiles!author_id(*), images:post_images(*)')
        .eq('bike_id', bikeId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      const { data, error } = cursor
        ? await base.lt('created_at', cursor)
        : await base

      if (error) throw error
      if (!data || data.length === 0) return []

      const filtered = data.filter((p) => p.author?.status === 'active')

      const postIds = filtered.map((p) => p.id)
      const sharedPostIds = filtered.map((p) => p.shared_post_id).filter(Boolean) as string[]

      const [{ data: likeCounts }, { data: commentCounts }, { data: myLikes }, { data: sharedPostsData }] =
        await Promise.all([
          supabase.from('post_likes').select('post_id, user:profiles!user_id(status)').in('post_id', postIds),
          supabase
            .from('comments')
            .select('post_id, author:profiles!author_id(status)')
            .in('post_id', postIds)
            .is('deleted_at', null),
          currentUserId
            ? supabase
                .from('post_likes')
                .select('post_id')
                .in('post_id', postIds)
                .eq('user_id', currentUserId)
            : Promise.resolve({ data: [] }),
          sharedPostIds.length > 0
            ? supabase
                .from('posts')
                .select('*, author:profiles!author_id(*), images:post_images(*), event:events!event_id(id, type, title, slug, starts_at, city, state, going_count, cover_photo_url, flyer_url, status)')
                .in('id', sharedPostIds)
            : Promise.resolve({ data: [] }),
        ])

      const likeMap = (likeCounts ?? []).reduce<Record<string, number>>((acc, r: any) => {
        if (['banned', 'suspended'].includes(r.user?.status)) return acc
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
        sharedPostMap[p.id] = p as Post
      }

      return filtered.map((post) => ({
        ...post,
        like_count: likeMap[post.id] ?? 0,
        comment_count: commentMap[post.id] ?? 0,
        is_liked_by_me: myLikeSet.has(post.id),
        shared_post: post.shared_post_id ? (sharedPostMap[post.shared_post_id] ?? null) : null,
      })) as Post[]
    },
    [bikeId, currentUserId]
  )

  useEffect(() => {
    setLoading(true)
    fetchPosts()
      .then((data) => {
        setPosts(data)
        cursorRef.current = data.length > 0 ? data[data.length - 1].created_at : null
        setHasMore(data.length === PAGE_SIZE)
      })
      .catch((err) => console.error('Bike wall fetch error:', err))
      .finally(() => setLoading(false))
  }, [fetchPosts])

  async function loadMore() {
    if (!hasMore || loadingMore || !cursorRef.current) return
    setLoadingMore(true)
    const data = await fetchPosts(cursorRef.current)
    setPosts((prev) => [...prev, ...data])
    if (data.length > 0) cursorRef.current = data[data.length - 1].created_at
    setHasMore(data.length === PAGE_SIZE)
    setLoadingMore(false)
  }

  function handlePostCreated() {
    fetchPosts().then((data) => {
      setPosts(data)
      cursorRef.current = data.length > 0 ? data[data.length - 1].created_at : null
      setHasMore(data.length === PAGE_SIZE)
    })
  }

  return (
    <div className="space-y-4">
      {(isOwnGarage || isFriend) && currentUserId && currentUserProfile && (
        <PostComposer
          currentUserProfile={currentUserProfile}
          bikeId={bikeId}
          onPostCreated={handlePostCreated}
        />
      )}

      {loading && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
          <p className="text-zinc-500 text-sm">Loading posts...</p>
        </div>
      )}

      {!loading && posts.length === 0 && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
          <p className="text-zinc-400 text-sm">No posts about this bike yet.</p>
          {(isOwnGarage || isFriend) && currentUserId && (
            <p className="text-zinc-600 text-sm mt-1">
              {isOwnGarage ? 'Share something about your ride above!' : 'Be the first to post on this bike wall!'}
            </p>
          )}
        </div>
      )}

      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          currentUserId={currentUserId}
          currentUserProfile={currentUserProfile}
          wallOwnerId={garageOwnerId}
        />
      ))}

      {hasMore && !loading && (
        <div className="text-center py-2">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="text-orange-400 hover:text-orange-300 disabled:opacity-40 text-sm font-medium transition-colors"
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
