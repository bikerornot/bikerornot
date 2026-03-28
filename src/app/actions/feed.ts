'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { Post } from '@/lib/supabase/types'

const PAGE_SIZE = 10

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function getFeedPage(page: number): Promise<{ posts: Post[]; hasMore: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { posts: [], hasMore: false }

  const admin = getServiceClient()

  // Fetch friend IDs, group IDs, and blocked IDs in parallel
  const [{ data: friendships }, { data: groupMemberships }, { data: blocks }] = await Promise.all([
    admin
      .from('friendships')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    admin
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id)
      .eq('status', 'active'),
    admin
      .from('blocks')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`),
  ])

  const friendIds = (friendships ?? []).map((f) =>
    f.requester_id === user.id ? f.addressee_id : f.requester_id
  )
  const groupIds = (groupMemberships ?? []).map((m) => m.group_id)
  const blockedIds = (blocks ?? []).map((b) =>
    b.blocker_id === user.id ? b.blocked_id : b.blocker_id
  )

  // Call the RPC for scored + paginated post IDs
  const { data: scored, error: rpcError } = await admin.rpc('get_feed_post_ids', {
    p_user_id: user.id,
    p_friend_ids: friendIds,
    p_group_ids: groupIds,
    p_blocked_ids: blockedIds,
    p_page_size: PAGE_SIZE + 1,
    p_offset: page * PAGE_SIZE,
  })

  if (rpcError || !scored?.length) return { posts: [], hasMore: false }

  const hasMore = scored.length > PAGE_SIZE
  const pageItems = scored.slice(0, PAGE_SIZE)
  const pagePostIds = pageItems.map((s: any) => s.post_id as string)

  // Build like/comment count maps from the RPC result (avoids extra queries)
  const likeMap: Record<string, number> = {}
  const commentMap: Record<string, number> = {}
  for (const s of pageItems) {
    likeMap[s.post_id] = Number(s.like_count)
    commentMap[s.post_id] = Number(s.comment_count)
  }

  // Fetch full post data + user's own likes + shared posts
  const { data: postsData } = await admin
    .from('posts')
    .select(
      '*, author:profiles!author_id(*), images:post_images(*), group:groups!group_id(name, slug), event:events!event_id(id, type, title, slug, starts_at, city, state, going_count, cover_photo_url, status)'
    )
    .in('id', pagePostIds)

  if (!postsData?.length) return { posts: [], hasMore: false }

  const sharedPostIds = postsData
    .map((p) => p.shared_post_id)
    .filter(Boolean) as string[]

  const [{ data: myLikes }, { data: sharedPostsData }] = await Promise.all([
    admin
      .from('post_likes')
      .select('post_id')
      .in('post_id', pagePostIds)
      .eq('user_id', user.id),
    sharedPostIds.length > 0
      ? admin
          .from('posts')
          .select('*, author:profiles!author_id(*), images:post_images(*)')
          .in('id', sharedPostIds)
      : Promise.resolve({ data: [] }),
  ])

  const myLikeSet = new Set((myLikes ?? []).map((l) => l.post_id))
  const sharedPostMap: Record<string, Post> = {}
  for (const p of sharedPostsData ?? []) {
    if (p?.id) sharedPostMap[p.id] = p as Post
  }

  // Maintain the RPC's score order
  const scoreOrder = new Map<string, number>(pagePostIds.map((id: string, idx: number) => [id, idx]))

  const enrichedPosts = postsData
    .sort((a, b) => (scoreOrder.get(a.id) ?? 0) - (scoreOrder.get(b.id) ?? 0))
    .map((post) => ({
      ...post,
      like_count: likeMap[post.id] ?? 0,
      comment_count: commentMap[post.id] ?? 0,
      is_liked_by_me: myLikeSet.has(post.id),
      shared_post: post.shared_post_id
        ? sharedPostMap[post.shared_post_id] ?? null
        : null,
    })) as Post[]

  return { posts: enrichedPosts, hasMore }
}
