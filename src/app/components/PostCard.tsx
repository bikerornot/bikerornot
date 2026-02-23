'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Post, Profile } from '@/lib/supabase/types'
import { getImageUrl } from '@/lib/supabase/image'
import { likePost, unlikePost, deletePost } from '@/app/actions/posts'
import PostImages from './PostImages'
import CommentSection from './CommentSection'

interface Props {
  post: Post
  currentUserId?: string
  currentUserProfile?: Profile | null
}

function formatTimeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function PostCard({ post, currentUserId, currentUserProfile }: Props) {
  const [liked, setLiked] = useState(post.is_liked_by_me ?? false)
  const [likeCount, setLikeCount] = useState(post.like_count ?? 0)
  const [commentCount, setCommentCount] = useState(post.comment_count ?? 0)
  const [showComments, setShowComments] = useState(false)
  const [deleted, setDeleted] = useState(false)

  if (deleted) return null

  const author = post.author
  const avatarUrl = author?.profile_photo_url
    ? getImageUrl('avatars', author.profile_photo_url)
    : null
  const displayName = author?.username ?? 'Unknown'

  async function handleLike() {
    if (!currentUserId) return
    if (liked) {
      setLiked(false)
      setLikeCount((c) => c - 1)
      await unlikePost(post.id)
    } else {
      setLiked(true)
      setLikeCount((c) => c + 1)
      await likePost(post.id)
    }
  }

  async function handleDelete() {
    setDeleted(true)
    await deletePost(post.id)
  }

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        <Link href={`/profile/${author?.username}`} className="flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={displayName}
                width={40}
                height={40}
                className="object-cover w-full h-full"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold">
                {(author?.first_name?.[0] ?? '?').toUpperCase()}
              </div>
            )}
          </div>
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/profile/${author?.username}`}
              className="font-semibold text-white hover:underline text-sm"
            >
              {displayName}
            </Link>
            <span className="text-zinc-600 text-xs">·</span>
            <span className="text-zinc-500 text-xs">{formatTimeAgo(post.created_at)}</span>
          </div>
          {author?.username && (
            <p className="text-zinc-500 text-xs">@{author.username}</p>
          )}
        </div>

        {currentUserId === post.author_id && (
          <button
            onClick={handleDelete}
            className="text-zinc-600 hover:text-red-400 transition-colors text-xs flex-shrink-0 p-1"
            title="Delete post"
          >
            ✕
          </button>
        )}
      </div>

      {/* Content */}
      <div className="px-4 pb-3">
        {post.content && (
          <p className="text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">
            {post.content}
          </p>
        )}
        {post.images && post.images.length > 0 && (
          <PostImages images={post.images} />
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-t border-zinc-800">
        <button
          onClick={handleLike}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            liked
              ? 'text-orange-400 bg-orange-500/10'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
          }`}
        >
          {liked ? '♥' : '♡'}
          {likeCount > 0 && <span>{likeCount}</span>}
        </button>

        <button
          onClick={() => {
            setShowComments(!showComments)
            setCommentCount((c) => c) // keep count
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          💬
          {commentCount > 0 && <span>{commentCount}</span>}
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <div className="px-4 pb-4 border-t border-zinc-800 pt-3">
          <CommentSection
            postId={post.id}
            currentUserId={currentUserId}
            currentUserProfile={currentUserProfile}
          />
        </div>
      )}
    </div>
  )
}
