'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Comment, Profile } from '@/lib/supabase/types'
import { getImageUrl } from '@/lib/supabase/image'
import { likeComment, unlikeComment, deleteComment, hideComment, unhideComment, createComment } from '@/app/actions/comments'
import ContentMenu from './ContentMenu'
import { renderContent } from '@/lib/render-content'
import MentionDropdown, { useMention } from './MentionDropdown'

interface Props {
  comment: Comment
  currentUserId?: string
  postAuthorId?: string
  replies?: Comment[]
  postId?: string
  currentUserProfile?: Profile | null
  onReplyAdded?: (reply: Comment) => void
}


function formatTimeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr`
  if (diff < 604800) return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) !== 1 ? 's' : ''}`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ReplyItem({
  reply,
  currentUserId,
  postAuthorId,
}: {
  reply: Comment
  currentUserId?: string
  postAuthorId?: string
}) {
  const [liked, setLiked] = useState(reply.is_liked_by_me ?? false)
  const [likeCount, setLikeCount] = useState(reply.like_count ?? 0)
  const [deleted, setDeleted] = useState(false)
  const [hidden, setHidden] = useState(!!reply.hidden_at)

  const isPostAuthor = currentUserId === postAuthorId
  const canHide = isPostAuthor && reply.author_id !== currentUserId

  if (deleted) return null

  if (hidden && isPostAuthor) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-zinc-800/50 rounded-xl px-3 py-2 flex items-center justify-between">
          <p className="text-zinc-500 text-sm">Reply hidden.</p>
          <button
            onClick={async () => { setHidden(false); await unhideComment(reply.id) }}
            className="text-sm text-orange-400 hover:text-orange-300 font-medium transition-colors"
          >
            Undo
          </button>
        </div>
      </div>
    )
  }

  if (hidden && reply.author_id !== currentUserId) return null

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
            <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm font-bold">
              {(author?.first_name?.[0] ?? '?').toUpperCase()}
            </div>
          )}
        </div>
      </Link>
      <div className="flex-1 min-w-0">
        <div className="bg-zinc-800 rounded-xl px-3 py-1.5">
          <Link
            href={`/profile/${author?.username}`}
            className="font-bold text-white text-base hover:underline"
          >
            {displayName}
          </Link>
          <p className="text-zinc-200 text-sm mt-0.5 whitespace-pre-wrap">{renderContent(reply.content)}</p>
        </div>
        <div className="flex items-center gap-2 mt-0.5 pl-1">
          <span className="text-zinc-500 text-sm">{formatTimeAgo(reply.created_at)}</span>
          {currentUserId && (
            <button
              onClick={handleLike}
              className={`text-sm font-medium py-1 px-1 transition-colors ${
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
              className="text-sm py-1 px-1 text-zinc-500 hover:text-red-400 transition-colors"
            >
              Delete
            </button>
          ) : currentUserId ? (
            <ContentMenu
              reportType="comment"
              reportTargetId={reply.id}
              blockUserId={reply.author_id}
              onHide={canHide ? async () => { setHidden(true); await hideComment(reply.id) } : undefined}
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
  postAuthorId,
  replies,
  postId,
  currentUserProfile,
  onReplyAdded,
}: Props) {
  const [liked, setLiked] = useState(comment.is_liked_by_me ?? false)
  const [likeCount, setLikeCount] = useState(comment.like_count ?? 0)
  const [deleted, setDeleted] = useState(false)
  const [hidden, setHidden] = useState(!!comment.hidden_at)
  const [showReplyInput, setShowReplyInput] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [submittingReply, setSubmittingReply] = useState(false)
  const [replyCursorPos, setReplyCursorPos] = useState(0)
  const replyInputRef = useRef<HTMLTextAreaElement>(null)

  const handleReplyMentionSelect = useCallback((newText: string, newCursorPos: number) => {
    setReplyText(newText)
    setReplyCursorPos(newCursorPos)
    setTimeout(() => {
      const el = replyInputRef.current
      if (el) {
        el.focus()
        el.setSelectionRange(newCursorPos, newCursorPos)
      }
    }, 0)
  }, [])

  const replyMention = useMention(replyText, replyCursorPos, handleReplyMentionSelect)

  // Auto-grow reply textarea — moved out of onChange to avoid layout
  // recalculations that can trigger infinite re-render loops on iOS Safari.
  useEffect(() => {
    const el = replyInputRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }
  }, [replyText])

  const isPostAuthor = currentUserId === postAuthorId
  const canHide = isPostAuthor && comment.author_id !== currentUserId

  if (deleted) return null

  // Hidden comment — only post author sees this placeholder
  if (hidden && isPostAuthor) {
    return (
      <div className="flex items-center gap-3 py-3 border-t border-zinc-800 first:border-t-0">
        <div className="flex-1 bg-zinc-800/50 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-zinc-500 text-sm">This comment has been hidden.</p>
          <button
            onClick={handleUnhide}
            className="text-sm text-orange-400 hover:text-orange-300 font-medium transition-colors"
          >
            Undo
          </button>
        </div>
      </div>
    )
  }

  // Hidden comment — non-post-author non-commenter shouldn't see it
  if (hidden && comment.author_id !== currentUserId) return null

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

  async function handleHide() {
    setHidden(true)
    await hideComment(comment.id)
  }

  async function handleUnhide() {
    setHidden(false)
    await unhideComment(comment.id)
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
            className="font-bold text-white text-base hover:underline"
          >
            {displayName}
          </Link>
          <p className="text-zinc-200 text-base mt-0.5 whitespace-pre-wrap">{renderContent(comment.content)}</p>
        </div>

        <div className="flex items-center gap-3 mt-1 pl-1">
          <span className="text-zinc-500 text-sm">{formatTimeAgo(comment.created_at)}</span>
          {currentUserId && (
            <button
              onClick={handleLike}
              className={`text-sm font-medium py-1 px-1 transition-colors ${
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
              className={`text-sm font-medium py-1 px-1 transition-colors ${
                showReplyInput ? 'text-orange-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Reply
            </button>
          )}
          {currentUserId === comment.author_id ? (
            <button
              onClick={handleDelete}
              className="text-sm py-1 px-1 text-zinc-500 hover:text-red-400 transition-colors"
            >
              Delete
            </button>
          ) : currentUserId ? (
            <ContentMenu
              reportType="comment"
              reportTargetId={comment.id}
              blockUserId={comment.author_id}
              onHide={canHide ? handleHide : undefined}
            />
          ) : null}
        </div>

        {/* Inline reply composer */}
        {showReplyInput && (
          <form onSubmit={handleReplySubmit} className="flex gap-2 mt-2 items-center relative">
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
                <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm font-bold">
                  {(currentUserProfile?.first_name?.[0] ?? '?').toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1 relative">
              <textarea
                ref={replyInputRef}
                value={replyText}
                onChange={(e) => {
                  setReplyText(e.target.value)
                  setReplyCursorPos(e.target.selectionStart ?? 0)
                }}
                onKeyDown={(e) => {
                  if (replyMention.handleKeyDown(e)) return
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (replyText.trim() && !submittingReply) handleReplySubmit(e)
                  }
                }}
                onSelect={(e) => setReplyCursorPos((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
                placeholder={`Reply to @${displayName}…`}
                autoFocus
                disabled={submittingReply}
                rows={1}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-3 py-1 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-transparent resize-none overflow-hidden"
              />
              {replyMention.visible && (
                <MentionDropdown
                  suggestions={replyMention.suggestions}
                  activeIndex={replyMention.activeIndex}
                  onSelect={replyMention.selectSuggestion}
                />
              )}
            </div>
            <button
              type="submit"
              disabled={!replyText.trim() || submittingReply}
              className="text-orange-400 hover:text-orange-300 disabled:opacity-40 text-sm font-semibold transition-colors"
            >
              {submittingReply ? '…' : 'Post'}
            </button>
          </form>
        )}

        {/* Threaded replies */}
        {replies && replies.length > 0 && (
          <div className="mt-2 pl-3 border-l-2 border-zinc-800 space-y-2">
            {replies.map((reply) => (
              <ReplyItem key={reply.id} reply={reply} currentUserId={currentUserId} postAuthorId={postAuthorId} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
