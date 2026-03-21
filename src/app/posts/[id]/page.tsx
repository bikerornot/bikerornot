import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getImageUrl } from '@/lib/supabase/image'
import Logo from '@/app/components/Logo'
import PostCard from '@/app/components/PostCard'
import UserMenu from '@/app/components/UserMenu'
import NotificationBell from '@/app/components/NotificationBell'
import LastSeenTracker from '@/app/components/LastSeenTracker'
import MessagesLink from '@/app/components/MessagesLink'
import BottomNav from '@/app/components/BottomNav'
import type { Post } from '@/lib/supabase/types'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('posts')
    .select('author:profiles!author_id(username)')
    .eq('id', id)
    .single()
  const username = (data?.author as { username?: string } | null)?.username ?? 'Unknown'
  return { title: `@${username}'s post — BikerOrNot` }
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: currentUserProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!currentUserProfile?.onboarding_complete) redirect('/onboarding')

  const { data: post } = await supabase
    .from('posts')
    .select('*, author:profiles!author_id(*), images:post_images(*), group:groups!group_id(name, slug)')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!post) notFound()

  const [
    { data: likeCounts },
    { data: commentCounts },
    { data: myLikes },
    sharedResult,
  ] = await Promise.all([
    supabase.from('post_likes').select('post_id').eq('post_id', id),
    supabase.from('comments').select('post_id, author:profiles!author_id(status)').eq('post_id', id).is('deleted_at', null),
    supabase.from('post_likes').select('post_id').eq('post_id', id).eq('user_id', user.id),
    post.shared_post_id
      ? supabase
          .from('posts')
          .select('*, author:profiles!author_id(*), images:post_images(*)')
          .eq('id', post.shared_post_id)
          .single()
      : Promise.resolve({ data: null }),
  ])

  const enrichedPost: Post = {
    ...post,
    like_count: likeCounts?.length ?? 0,
    comment_count: (commentCounts ?? []).filter((c: any) => !['banned', 'suspended'].includes(c.author?.status)).length,
    is_liked_by_me: (myLikes?.length ?? 0) > 0,
    shared_post: (sharedResult.data as Post | null) ?? null,
  }

  const authorUsername = (post.author as { username?: string } | null)?.username ?? 'Unknown'

  const avatarUrl = currentUserProfile.profile_photo_url
    ? getImageUrl('avatars', currentUserProfile.profile_photo_url, undefined, currentUserProfile.updated_at)
    : null

  return (
    <div className="min-h-screen bg-zinc-950 pb-20 sm:pb-0">
      <LastSeenTracker />
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-4">
            <Link href="/people" className="hidden sm:block text-sm text-zinc-400 hover:text-orange-400 transition-colors" title="Find Riders">
              Find Riders
            </Link>
            <Link href="/groups" className="hidden sm:block text-sm text-zinc-400 hover:text-orange-400 transition-colors" title="Groups">
              Groups
            </Link>
            <Link href="/bikes" className="hidden sm:block text-sm text-zinc-400 hover:text-orange-400 transition-colors" title="Find Bike Owners">
              Bikes
            </Link>
            <MessagesLink userId={user.id} />
            <NotificationBell userId={user.id} username={currentUserProfile.username!} />
            <UserMenu
              username={currentUserProfile.username!}
              displayName={currentUserProfile.username ?? 'Unknown'}
              avatarUrl={avatarUrl}
              firstInitial={(currentUserProfile.first_name?.[0] ?? '?').toUpperCase()}
              role={currentUserProfile.role}
            />
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4">
        <Link
          href={`/profile/${authorUsername}`}
          className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 text-sm mb-4 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          @{authorUsername}
        </Link>

        <PostCard
          post={enrichedPost}
          currentUserId={user.id}
          currentUserProfile={currentUserProfile}
          initialShowComments
        />
      </div>
      <BottomNav />
    </div>
  )
}
