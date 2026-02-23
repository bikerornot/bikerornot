'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Comment } from '@/lib/supabase/types'
import { getImageUrl } from '@/lib/supabase/image'
import { likeComment, unlikeComment, deleteComment } from '@/app/actions/comments'

interface Props {
  comment: Comment
  currentUserId?: string
}

function formatTimeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function CommentItem({ comment, currentUserId }: Props) {
  const [liked, setLiked] = useState(comment.is_liked_by_me ?? false)
  const [likeCount, setLikeCount] = useState(comment.like_count ?? 0)
  const [deleted, setDeleted] = useState(false)

  if (deleted) return null

  const author = comment.author
  const avatarUrl = author?.profile_photo_url
    ? getImageUrl('avatars', author.profile_photo_url)
    : null
  const displayName =
    author?.display_name ??
    `${author?.first_name ?? ''} ${author?.last_name ?? ''}`.trim()

  async function handleLike() {
    if (!currentUserId) return
    if (liked) {
      setLiked(false)
      setLikeCount((c) => c - 1)
      await unlikeComment(comment.id)
    } else {
      setLiked(true)
      setLikeCount((c) => c + 1)
      await likeComment(comment.id)
    }
  }

  async function handleDelete() {
    setDeleted(true)
    await deleteComment(comment.id)
  }

  return (
    <div className="flex gap-3 py-3 border-t border-zinc-800 first:border-t-0">
      <Link href={`/profile/${author?.username}`} className="flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-zinc-700 overflow-hidden">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={displayName}
              width={32}
              height={32}
              className="object-cover w-full h-full"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm font-bold">
              {(author?.first_name?.[0] ?? '?').toUpperCase()}
            </div>
          )}
        </div>
      </Link>

      <div className="flex-1 min-w-0">
        <div className="bg-zinc-800 rounded-xl px-3 py-2">
          <Link
            href={`/profile/${author?.username}`}
            className="font-semibold text-white text-sm hover:underline"
          >
            {displayName}
          </Link>
          <p className="text-zinc-200 text-sm mt-0.5 whitespace-pre-wrap">{comment.content}</p>
        </div>
        <div className="flex items-center gap-4 mt-1 pl-1">
          <span className="text-zinc-500 text-xs">{formatTimeAgo(comment.created_at)}</span>
          {currentUserId && (
            <button
              onClick={handleLike}
              className={`text-xs font-medium transition-colors ${
                liked ? 'text-orange-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {liked ? '♥' : '♡'}{likeCount > 0 ? ` ${likeCount}` : ''}
            </button>
          )}
          {currentUserId === comment.author_id && (
            <button
              onClick={handleDelete}
              className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
