'use client'

import { Post, Profile } from '@/lib/supabase/types'
import PostCard from '@/app/components/PostCard'

interface Props {
  post: Post
  currentUserId: string
  currentUserProfile: Profile
  blockedUserIds: string[]
}

export default function PostCardWrapper({ post, currentUserId, currentUserProfile, blockedUserIds }: Props) {
  return (
    <PostCard
      post={post}
      currentUserId={currentUserId}
      currentUserProfile={currentUserProfile}
      initialShowComments={true}
      blockedUserIds={blockedUserIds}
    />
  )
}
