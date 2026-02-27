'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Post, Profile } from '@/lib/supabase/types'
import { getImageUrl } from '@/lib/supabase/image'
import { likePost, unlikePost, deletePost, sharePost } from '@/app/actions/posts'
import PostImages from './PostImages'
import CommentSection from './CommentSection'
import ContentMenu from './ContentMenu'
import { extractYouTubeId, fetchYouTubeMeta } from '@/lib/youtube'

function getPostTextSize(content: string): string {
  const len = content.length
  if (len <= 80)  return 'text-2xl font-bold leading-snug'
  if (len <= 130) return 'text-xl font-semibold leading-snug'
  if (len <= 280) return 'text-lg leading-relaxed'
  return 'text-base leading-relaxed'
}

interface Props {
  post: Post
  currentUserId?: string
  currentUserProfile?: Profile | null
  initialShowComments?: boolean
}

const URL_REGEX = /(https?:\/\/[^\s]+)/g

function renderWithLinks(text: string, excludeUrl?: string) {
  const parts = text.split(URL_REGEX)
  return parts.map((part, i) => {
    if (!URL_REGEX.test(part)) return part
    if (excludeUrl && part === excludeUrl) return null
    return (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-orange-400 hover:text-orange-300 underline break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    )
  })
}

const YT_ICON = (
  <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5a3 3 0 0 0-2.1 2.1C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z" />
  </svg>
)

function YouTubeEmbed({ videoId }: { videoId: string }) {
  const [playing, setPlaying] = useState(false)
  const [meta, setMeta] = useState<{ title: string; channel: string } | null>(null)

  useEffect(() => {
    fetchYouTubeMeta(videoId).then((m) => { if (m) setMeta(m) }).catch(() => {})
  }, [videoId])

  return (
    <div className="rounded-xl overflow-hidden border border-zinc-700">
      {playing ? (
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          <iframe
            className="absolute inset-0 w-full h-full"
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="relative w-full group block"
          aria-label="Play YouTube video"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
            alt="YouTube video thumbnail"
            className="w-full object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/35 transition-colors">
            <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center shadow-xl">
              <svg className="w-7 h-7 text-white ml-1" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </button>
      )}
      {meta && (
        <div className="bg-zinc-800 px-3 py-2.5 space-y-0.5">
          <p className="flex items-center gap-1.5 text-xs text-zinc-500">
            {YT_ICON}
            YouTube
          </p>
          <p className="text-white text-sm font-medium line-clamp-2">{meta.title}</p>
          <p className="text-zinc-400 text-xs">{meta.channel}</p>
        </div>
      )}
    </div>
  )
}

function formatTimeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function SharedPostEmbed({ post }: { post: Omit<Post, 'shared_post'> }) {
  const author = post.author
  const avatarUrl = author?.profile_photo_url
    ? getImageUrl('avatars', author.profile_photo_url)
    : null

  return (
    <div className="border border-zinc-700 rounded-xl overflow-hidden mt-2">
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50">
        <Link href={`/profile/${author?.username}`} className="flex-shrink-0">
          <div className="w-7 h-7 rounded-full bg-zinc-700 overflow-hidden">
            {avatarUrl ? (
              <Image src={avatarUrl} alt={author?.username ?? ''} width={28} height={28} className="object-cover w-full h-full" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs font-bold">
                {(author?.first_name?.[0] ?? '?').toUpperCase()}
              </div>
            )}
          </div>
        </Link>
        <Link href={`/profile/${author?.username}`} className="text-sm font-semibold text-white hover:underline">
          {author?.username ?? 'Unknown'}
        </Link>
        <span className="text-zinc-500 text-xs">· {formatTimeAgo(post.created_at)}</span>
      </div>
      {post.content && (() => {
        const ytVideo = extractYouTubeId(post.content)
        return (
          <div className="px-3 py-2 bg-zinc-800/30 space-y-2">
            <p className="text-zinc-200 text-base leading-relaxed whitespace-pre-wrap">
              {renderWithLinks(post.content, ytVideo?.fullUrl)}
            </p>
            {ytVideo && <YouTubeEmbed videoId={ytVideo.id} />}
          </div>
        )
      })()}
      {post.images && post.images.length > 0 && (
        <div className="bg-zinc-800/30">
          <PostImages images={post.images} />
        </div>
      )}
      {!post.content && (!post.images || post.images.length === 0) && (
        <div className="px-3 py-2 bg-zinc-800/30">
          <p className="text-zinc-500 text-sm italic">No content</p>
        </div>
      )}
    </div>
  )
}

export default function PostCard({ post, currentUserId, currentUserProfile, initialShowComments }: Props) {
  const [liked, setLiked] = useState(post.is_liked_by_me ?? false)
  const [likeCount, setLikeCount] = useState(post.like_count ?? 0)
  const [commentCount, setCommentCount] = useState(post.comment_count ?? 0)
  const [showComments, setShowComments] = useState(initialShowComments ?? false)
  const [deleted, setDeleted] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareCaption, setShareCaption] = useState('')
  const [sharing, setSharing] = useState(false)

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

  async function handleShare() {
    if (sharing) return
    setSharing(true)
    try {
      await sharePost(post.id, shareCaption)
      setShowShareModal(false)
      setShareCaption('')
    } catch (err) {
      console.error(err)
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="bg-zinc-900 sm:rounded-xl sm:border sm:border-zinc-800 overflow-hidden">
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

        {currentUserId === post.author_id ? (
          <button
            onClick={handleDelete}
            className="text-zinc-600 hover:text-red-400 transition-colors text-xs flex-shrink-0 p-1"
            title="Delete post"
          >
            ✕
          </button>
        ) : currentUserId ? (
          <ContentMenu
            reportType="post"
            reportTargetId={post.id}
            blockUserId={post.author_id}
          />
        ) : null}
      </div>

      {/* Text content */}
      {(post.content || post.shared_post_id) && (() => {
        const ytVideo = post.content ? extractYouTubeId(post.content) : null
        return (
          <div className="px-4 pb-3 space-y-2">
            {post.content && (
              <p className={`text-zinc-200 whitespace-pre-wrap ${getPostTextSize(post.content)}`}>
                {renderWithLinks(post.content, ytVideo?.fullUrl)}
              </p>
            )}
            {ytVideo && <YouTubeEmbed videoId={ytVideo.id} />}
            {post.shared_post_id && (
              post.shared_post
                ? <SharedPostEmbed post={post.shared_post} />
                : <div className="border border-zinc-700 rounded-xl px-4 py-3 text-zinc-500 text-sm italic">Original post was deleted.</div>
            )}
          </div>
        )
      })()}

      {/* Images — edge to edge, no horizontal padding */}
      {post.images && post.images.length > 0 && (
        <div>
          <PostImages images={post.images} />
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-t border-zinc-800">
        <button
          onClick={handleLike}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-base font-medium transition-colors ${
            liked
              ? 'text-orange-400 bg-orange-500/10'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
          }`}
        >
          {liked ? '♥' : '♡'}
          {likeCount > 0 && <span className="text-sm">{likeCount}</span>}
        </button>

        <button
          onClick={() => {
            setShowComments(!showComments)
            setCommentCount((c) => c)
          }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-base font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          💬
          {commentCount > 0 && <span className="text-sm">{commentCount}</span>}
        </button>

        {currentUserId && !post.shared_post_id && (
          <button
            onClick={() => setShowShareModal(true)}
            className="flex items-center px-3 py-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors ml-auto"
            title="Share"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </button>
        )}
      </div>

      {/* Share modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowShareModal(false)} />
          <div className="relative w-full sm:max-w-md bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h2 className="text-white font-semibold">Share to Feed</h2>
              <button onClick={() => setShowShareModal(false)} className="text-zinc-500 hover:text-white transition-colors text-lg leading-none">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <textarea
                value={shareCaption}
                onChange={(e) => setShareCaption(e.target.value)}
                placeholder="Say something about this post… (optional)"
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-orange-500 transition-colors resize-none"
              />
              <div className="border border-zinc-700 rounded-xl overflow-hidden opacity-75">
                <SharedPostEmbed post={post} />
              </div>
            </div>
            <div className="px-4 pb-4">
              <button
                onClick={handleShare}
                disabled={sharing}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
              >
                {sharing ? 'Sharing…' : 'Share to Feed'}
              </button>
            </div>
          </div>
        </div>
      )}

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
