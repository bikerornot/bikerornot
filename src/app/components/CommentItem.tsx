'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Comment, Profile } from '@/lib/supabase/types'
import { getImageUrl } from '@/lib/supabase/image'
import { likeComment, unlikeComment, deleteComment, createComment } from '@/app/actions/comments'
import ContentMenu from './ContentMenu'

interface Props {
  comment: Comment
  currentUserId?: string
  replies?: Comment[]
  postId?: string
  currentUserProfile?: Profile | null
  onReplyAdded?: (reply: Comment) => void
}

function formatTimeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ReplyItem({
  reply,
  currentUserId,
}: {
  reply: Comment
  currentUserId?: string
}) {
  const [liked, setLiked] = useState(reply.is_liked_by_me ?? false)
  const [likeCount, setLikeCount] = useState(reply.like_count ?? 0)
  const [deleted, setDeleted] = useState(false)

  if (deleted) return null

  const author = reply.author
  const avatarUrl = author?.profile_photo_url
    ? getImageUrl('avatars', author.profile_photo_url)
    : null
  const displayName = author?.username ?? 'Unknown'

  async function handleLike() {
    if (!currentUserId) return
    if (liked) {
      setLiked(false)
      setLikeCount((c) => c - 1)
      await unlikeComment(reply.id)
    } else {
      setLiked(true)
      setLikeCount((c) => c + 1)
      await likeComment(reply.id)
    }
  }

  async function handleDelete() {
    setDeleted(true)
    await deleteComment(reply.id)
  }

  return (
    <div className="flex gap-2">
      <Link href={`/profile/${author?.username}`} className="flex-shrink-0">
        <div className="w-6 h-6 rounded-full bg-zinc-700 overflow-hidden">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={displayName}
              width={24}
              height={24}
              className="object-cover w-full h-full"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs font-bold">
              {(author?.first_name?.[0] ?? '?').toUpperCase()}
            </div>
          )}
        </div>
      </Link>
      <div className="flex-1 min-w-0">
        <div className="bg-zinc-800 rounded-xl px-3 py-1.5">
          <Link
            href={`/profile/${author?.username}`}
            className="font-semibold text-white text-xs hover:underline"
          >
            {displayName}
          </Link>
          <p className="text-zinc-200 text-xs mt-0.5 whitespace-pre-wrap">{reply.content}</p>
        </div>
        <div className="flex items-center gap-3 mt-0.5 pl-1">
          <span className="text-zinc-500 text-xs">{formatTimeAgo(reply.created_at)}</span>
          {currentUserId && (
            <button
              onClick={handleLike}
              className={`text-xs font-medium transition-colors ${
                liked ? 'text-orange-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {liked ? '♥' : '♡'}
              {likeCount > 0 ? ` ${likeCount}` : ''}
            </button>
          )}
          {currentUserId === reply.author_id ? (
            <button
              onClick={handleDelete}
              className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
            >
              Delete
            </button>
          ) : currentUserId ? (
            <ContentMenu
              reportType="comment"
              reportTargetId={reply.id}
              blockUserId={reply.author_id}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function CommentItem({
  comment,
  currentUserId,
  replies,
  postId,
  currentUserProfile,
  onReplyAdded,
}: Props) {
  const [liked, setLiked] = useState(comment.is_liked_by_me ?? false)
  const [likeCount, setLikeCount] = useState(comment.like_count ?? 0)
  const [deleted, setDeleted] = useState(false)
  const [showReplyInput, setShowReplyInput] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [submittingReply, setSubmittingReply] = useState(false)

  if (deleted) return null

  const author = comment.author
  const avatarUrl = author?.profile_photo_url
    ? getImageUrl('avatars', author.profile_photo_url)
    : null
  const displayName = author?.username ?? 'Unknown'

  const currentUserAvatarUrl = currentUserProfile?.profile_photo_url
    ? getImageUrl('avatars', currentUserProfile.profile_photo_url)
    : null

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

  async function handleReplySubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = replyText.trim()
    if (!trimmed || !postId || !currentUserId) return
    setSubmittingReply(true)
    try {
      const newReply = await createComment(postId, trimmed, comment.id)
      onReplyAdded?.(newReply as Comment)
      setReplyText('')
      setShowReplyInput(false)
    } finally {
      setSubmittingReply(false)
    }
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
              {liked ? '♥' : '♡'}
              {likeCount > 0 ? ` ${likeCount}` : ''}
            </button>
          )}
          {currentUserId && postId && (
            <button
              onClick={() => setShowReplyInput((v) => !v)}
              className={`text-xs font-medium transition-colors ${
                showReplyInput ? 'text-orange-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Reply
            </button>
          )}
          {currentUserId === comment.author_id ? (
            <button
              onClick={handleDelete}
              className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
            >
              Delete
            </button>
          ) : currentUserId ? (
            <ContentMenu
              reportType="comment"
              reportTargetId={comment.id}
              blockUserId={comment.author_id}
            />
          ) : null}
        </div>

        {/* Inline reply composer */}
        {showReplyInput && (
          <form onSubmit={handleReplySubmit} className="flex gap-2 mt-2 items-center">
            <div className="w-6 h-6 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
              {currentUserAvatarUrl ? (
                <Image
                  src={currentUserAvatarUrl}
                  alt="You"
                  width={24}
                  height={24}
                  className="object-cover w-full h-full"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs font-bold">
                  {(currentUserProfile?.first_name?.[0] ?? '?').toUpperCase()}
                </div>
              )}
            </div>
            <input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={`Reply to @${displayName}…`}
              autoFocus
              disabled={submittingReply}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={!replyText.trim() || submittingReply}
              className="text-orange-400 hover:text-orange-300 disabled:opacity-40 text-xs font-semibold transition-colors"
            >
              {submittingReply ? '…' : 'Post'}
            </button>
          </form>
        )}

        {/* Threaded replies */}
        {replies && replies.length > 0 && (
          <div className="mt-2 pl-3 border-l-2 border-zinc-800 space-y-2">
            {replies.map((reply) => (
              <ReplyItem key={reply.id} reply={reply} currentUserId={currentUserId} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
