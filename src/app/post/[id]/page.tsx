import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getImageUrl } from '@/lib/supabase/image'
import { Post } from '@/lib/supabase/types'
import { getBlockedIds } from '@/app/actions/blocks'
import Logo from '@/app/components/Logo'
import DesktopNav from '@/app/components/DesktopNav'
import UserMenu from '@/app/components/UserMenu'
import NotificationBell from '@/app/components/NotificationBell'
import MessagesLink from '@/app/components/MessagesLink'
import FindRidersLink from '@/app/components/FindRidersLink'
import BottomNav from '@/app/components/BottomNav'
import PostCardWrapper from './PostCardWrapper'

export const metadata = { title: 'Post — BikerOrNot' }

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: postId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile?.onboarding_complete) redirect('/onboarding')

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch the post with author and images
  const { data: post } = await admin
    .from('posts')
    .select('*, author:profiles!author_id(*), images:post_images(*)')
    .eq('id', postId)
    .is('deleted_at', null)
    .single()

  if (!post || post.author?.status !== 'active') notFound()

  // Fetch like count, comment count, user's like, and shared post
  const [{ data: likeCounts }, { data: commentCounts }, { data: myLike }, { data: sharedPostData }, blockedIds] =
    await Promise.all([
      admin.from('post_likes').select('post_id').eq('post_id', postId),
      admin
        .from('comments')
        .select('post_id, author:profiles!author_id(status)')
        .eq('post_id', postId)
        .is('deleted_at', null),
      admin
        .from('post_likes')
        .select('post_id')
        .eq('post_id', postId)
        .eq('user_id', user.id)
        .maybeSingle(),
      post.shared_post_id
        ? admin
            .from('posts')
            .select('*, author:profiles!author_id(*), images:post_images(*)')
            .eq('id', post.shared_post_id)
            .single()
        : Promise.resolve({ data: null }),
      getBlockedIds(user.id, admin),
    ])

  // Check if viewer is blocked by or has blocked the post author
  if (blockedIds.has(post.author_id)) notFound()

  const activeCommentCount = (commentCounts ?? []).filter(
    (c: any) => c.author?.status === 'active'
  ).length

  const enrichedPost: Post = {
    ...post,
    like_count: likeCounts?.length ?? 0,
    comment_count: activeCommentCount,
    liked_by_me: !!myLike,
    shared_post: sharedPostData ?? undefined,
  }

  const avatarUrl = profile.profile_photo_url
    ? getImageUrl('avatars', profile.profile_photo_url, undefined, profile.updated_at)
    : null

  return (
    <div className="min-h-screen bg-zinc-950 pb-20 sm:pb-0">
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-4">
            <DesktopNav />
            <FindRidersLink />
            <MessagesLink userId={user.id} />
            <NotificationBell userId={user.id} username={profile.username!} />
            <UserMenu
              username={profile.username!}
              displayName={profile.username ?? 'Unknown'}
              avatarUrl={avatarUrl}
              firstInitial={(profile.first_name?.[0] ?? '?').toUpperCase()}
              role={profile.role}
            />
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto sm:px-4 py-6">
        <PostCardWrapper
          post={enrichedPost}
          currentUserId={user.id}
          currentUserProfile={profile}
          blockedUserIds={Array.from(blockedIds)}
        />
      </div>
      <BottomNav />
    </div>
  )
}
