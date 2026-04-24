'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Post, Profile } from '@/lib/supabase/types'
import { getImageUrl } from '@/lib/supabase/image'
import { likePost, unlikePost, deletePost, sharePost, editPost } from '@/app/actions/posts'
import { joinGroup } from '@/app/actions/groups'
import PostImages from './PostImages'
import CommentSection from './CommentSection'
import ContentMenu from './ContentMenu'
import { extractYouTubeId, fetchYouTubeMeta } from '@/lib/youtube'
import { renderContent } from '@/lib/render-content'
import VerifiedBadge from './VerifiedBadge'
import EventCard from './EventCard'
import LikersModal from './LikersModal'

interface Props {
  post: Post
  currentUserId?: string
  currentUserProfile?: Profile | null
  initialShowComments?: boolean
  wallOwnerId?: string
  blockedUserIds?: string[]
  userGroupIds?: string[]
  onLikeChange?: (postId: string, liked: boolean, likeCount: number) => void
  onCommentCountChange?: (postId: string, commentCount: number) => void
  onDelete?: (postId: string) => void
}

const GARAGE_REGEX = /^Added a (.+) to my garage! 🏍️/

function renderGaragePost(text: string, authorUsername?: string | null) {
  const match = text.match(GARAGE_REGEX)
  if (!match || !authorUsername) return null
  const bikeName = match[1]
  const garageUrl = `/profile/${authorUsername}?tab=Garage`
  return (
    <>
      Added a{' '}
      <Link href={garageUrl} className="text-orange-400 hover:text-orange-300 font-semibold">
        {bikeName}
      </Link>
      {' '}to my garage! 🏍️
    </>
  )
}

const GROUP_JOIN_REGEX = /^Joined the group (.+)!(?:\n([\s\S]+))?$/

function renderGroupJoinPost(text: string, groupSlug?: string | null, showedInHeader?: boolean) {
  const match = text.match(GROUP_JOIN_REGEX)
  if (!match) return null
  const groupName = match[1]
  const description = match[2]?.trim()
  const href = groupSlug ? `/groups/${groupSlug}` : null
  return (
    <div>
      {showedInHeader ? (
        // Group name already in header — just say "Joined this group"
        <span className="text-white font-semibold">Joined this group</span>
      ) : (
        <span>
          Joined{' '}
          {href ? (
            <Link href={href} className="text-orange-400 hover:text-orange-300 font-semibold">{groupName}</Link>
          ) : (
            <span className="font-semibold text-white">{groupName}</span>
          )}
        </span>
      )}
      {description && (
        <p className="text-zinc-300 text-base mt-1 leading-snug">{description}</p>
      )}
    </div>
  )
}

const LISTING_REGEX = /^Listed my (.+) for sale(.*)\n\nhttps:\/\/bikerornot\.com\/classifieds\/(.+)$/

function renderListingPost(text: string) {
  const match = text.match(LISTING_REGEX)
  if (!match) return null
  const bikeName = match[1]
  const priceNote = match[2] // e.g. " — $5,000"
  return (
    <>
      Listed my {bikeName} for sale{priceNote} —{' '}
      <Link
        href={`/classifieds/${match[3]}`}
        className="text-orange-400 hover:text-orange-300 font-semibold"
        onClick={(e) => e.stopPropagation()}
      >
        View Listing
      </Link>
    </>
  )
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
          <p className="flex items-center gap-1.5 text-sm text-zinc-500">
            {YT_ICON}
            YouTube
          </p>
          <p className="text-white text-sm font-medium line-clamp-2">{meta.title}</p>
          <p className="text-zinc-400 text-sm">{meta.channel}</p>
        </div>
      )}
    </div>
  )
}

function formatTimeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) !== 1 ? 's' : ''} ago`
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
              <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm font-bold">
                {(author?.first_name?.[0] ?? '?').toUpperCase()}
              </div>
            )}
          </div>
        </Link>
        <Link href={`/profile/${author?.username}`} className="text-sm font-semibold text-white hover:underline inline-flex items-center gap-1">
          {author?.username ?? 'Unknown'}
          {author?.phone_verified_at && <VerifiedBadge className="w-3.5 h-3.5" />}
        </Link>
        <span className="text-zinc-500 text-sm">· {formatTimeAgo(post.created_at)}</span>
      </div>
      {post.place && (
        <div className="px-4 -mt-2 mb-1 flex items-center gap-1.5 text-zinc-400 text-sm">
          <svg className="w-4 h-4 text-orange-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-7.5 8-13a8 8 0 10-16 0c0 5.5 8 13 8 13z" />
            <circle cx="12" cy="9" r="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="truncate">at <span className="text-white font-medium">{post.place.name}</span></span>
        </div>
      )}
      {post.content && (() => {
        const ytVideo = extractYouTubeId(post.content)
        return (
          <div className="px-3 py-2 bg-zinc-800/30 space-y-2">
            <p className="text-zinc-200 text-base leading-relaxed whitespace-pre-wrap">
              {renderContent(post.content, ytVideo?.fullUrl)}
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
      {post.event && (
        <div className="px-3 pb-3 pt-2 bg-zinc-800/30">
          <EventCard event={post.event as any} />
        </div>
      )}
      {!post.content && (!post.images || post.images.length === 0) && !post.event && (
        <div className="px-3 py-2 bg-zinc-800/30">
          <p className="text-zinc-500 text-sm italic">No content</p>
        </div>
      )}
    </div>
  )
}

export default function PostCard({ post, currentUserId, currentUserProfile, initialShowComments, wallOwnerId, blockedUserIds, userGroupIds, onLikeChange, onCommentCountChange, onDelete }: Props) {
  const [liked, setLiked] = useState(post.is_liked_by_me ?? false)
  const [likeCount, setLikeCount] = useState(post.like_count ?? 0)
  const [commentCount, setCommentCount] = useState(post.comment_count ?? 0)
  const [showComments, setShowComments] = useState(initialShowComments ?? false)
  const [deleted, setDeleted] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareCaption, setShareCaption] = useState('')
  const [sharing, setSharing] = useState(false)
  const [joinedGroup, setJoinedGroup] = useState(false)
  const [joiningGroup, setJoiningGroup] = useState(false)
  const [showLikers, setShowLikers] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(post.content ?? '')
  const [editError, setEditError] = useState('')
  const [saving, setSaving] = useState(false)
  const [displayContent, setDisplayContent] = useState(post.content)
  const [wasEdited, setWasEdited] = useState(!!post.edited_at)

  if (deleted) return null

  const author = post.author
  const avatarUrl = author?.profile_photo_url
    ? getImageUrl('avatars', author.profile_photo_url)
    : null
  const displayName = author?.username ?? 'Unknown'

  async function handleLike() {
    if (!currentUserId) return
    if (liked) {
      const nextCount = Math.max(0, likeCount - 1)
      setLiked(false)
      setLikeCount(nextCount)
      onLikeChange?.(post.id, false, nextCount)
      await unlikePost(post.id)
    } else {
      const nextCount = likeCount + 1
      setLiked(true)
      setLikeCount(nextCount)
      onLikeChange?.(post.id, true, nextCount)
      await likePost(post.id)
    }
  }

  // Stable identity: CommentSection consumes this as a useEffect dep. A fresh
  // closure on every PostCard render would re-fire the effect unnecessarily;
  // combined with an ancestor setState that always produces a new array, that
  // loop starved router transitions and froze navigation while comments were
  // open. Parent now short-circuits no-op updates, but keeping this stable is
  // belt-and-braces against the same failure mode creeping back.
  const updateCommentCount = useCallback((next: number) => {
    setCommentCount(next)
    onCommentCountChange?.(post.id, next)
  }, [post.id, onCommentCountChange])

  async function handleDelete() {
    setDeleted(true)
    onDelete?.(post.id)
    await deletePost(post.id)
  }

  const EDIT_WINDOW_MS = 15 * 60 * 1000
  const isOwnPost = currentUserId === post.author_id
  const postAge = Date.now() - new Date(post.created_at).getTime()
  const canEdit = isOwnPost && !post.shared_post_id && commentCount === 0 && postAge <= EDIT_WINDOW_MS

  async function handleEdit() {
    if (saving) return
    setSaving(true)
    setEditError('')
    const result = await editPost(post.id, editContent)
    if (result.error) {
      setEditError(result.error)
      setSaving(false)
    } else {
      setDisplayContent(editContent.trim())
      setWasEdited(true)
      setEditing(false)
      setSaving(false)
    }
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
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-relaxed">
            <Link
              href={`/profile/${author?.username}`}
              className="font-bold text-white hover:underline text-lg sm:text-base inline-flex items-center gap-1"
            >
              @{displayName}
              {author?.phone_verified_at && <VerifiedBadge />}
            </Link>
            {post.group && (
              <>
                <span className="text-zinc-400 text-base sm:text-sm">posted in</span>
                <Link
                  href={`/groups/${post.group.slug}`}
                  className="font-semibold text-orange-400 hover:text-orange-300 text-base sm:text-sm hover:underline"
                >
                  {post.group.name}
                </Link>
                {post.group_id && currentUserId && userGroupIds && !userGroupIds.includes(post.group_id) && !joinedGroup && (
                  <button
                    onClick={async (e) => {
                      e.preventDefault()
                      if (joiningGroup) return
                      setJoiningGroup(true)
                      try {
                        await joinGroup(post.group_id!)
                        setJoinedGroup(true)
                      } catch { /* ignore */ }
                      setJoiningGroup(false)
                    }}
                    disabled={joiningGroup}
                    className="text-xs font-semibold text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 px-2 py-0.5 rounded-full transition-colors"
                  >
                    {joiningGroup ? '...' : 'Join'}
                  </button>
                )}
                {joinedGroup && (
                  <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    Joined
                  </span>
                )}
              </>
            )}
            {post.bike && !post.group && (
              <>
                <span className="text-zinc-400 text-base sm:text-sm">on</span>
                <Link
                  href={`/bikes/${post.bike.id}`}
                  className="font-semibold text-orange-400 hover:text-orange-300 text-base sm:text-sm hover:underline"
                >
                  {[post.bike.year, post.bike.make, post.bike.model].filter(Boolean).join(' ')}
                </Link>
              </>
            )}
            <span className="text-zinc-600 text-sm">·</span>
            <span className="text-zinc-500 text-sm">{formatTimeAgo(post.created_at)}</span>
            {wasEdited && <><span className="text-zinc-600 text-sm">·</span><span className="text-zinc-600 text-sm">Edited</span></>}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {currentUserId && currentUserId !== post.author_id && (
            <ContentMenu
              reportType="post"
              reportTargetId={post.id}
              blockUserId={post.author_id}
            />
          )}
          {canEdit && !editing && (
            <button
              onClick={() => { setEditContent(displayContent ?? ''); setEditing(true); setEditError('') }}
              className="text-zinc-600 hover:text-orange-400 transition-colors text-sm p-1"
              title="Edit post"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.4 7.125a.75.75 0 0 0-.188.335l-.775 2.902a.75.75 0 0 0 .919.919l2.902-.775a.75.75 0 0 0 .335-.188l4.612-4.612a1.75 1.75 0 0 0 0-2.475l-.712-.718ZM3.5 3A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5V9.5a.75.75 0 0 0-1.5 0v3a.25.25 0 0 1-.25.25h-7.5a.25.25 0 0 1-.25-.25v-7.5A.25.25 0 0 1 3.75 4.75H7a.75.75 0 0 0 0-1.5H3.75A.25.25 0 0 0 3.5 3Z" />
              </svg>
            </button>
          )}
          {(currentUserId === post.author_id || (wallOwnerId && currentUserId === wallOwnerId)) && (
            <button
              onClick={handleDelete}
              className="text-zinc-600 hover:text-red-400 transition-colors text-sm p-1"
              title="Delete post"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {post.place && (
        <div className="px-4 -mt-2 mb-1 flex items-center gap-1.5 text-zinc-400 text-sm">
          <svg className="w-4 h-4 text-orange-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-7.5 8-13a8 8 0 10-16 0c0 5.5 8 13 8 13z" />
            <circle cx="12" cy="9" r="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="truncate">at <span className="text-white font-medium">{post.place.name}</span></span>
        </div>
      )}

      {/* Bike preview — for posts composed on a bike's wall, anchor the
          text to the bike with a photo + name chip so feed readers know
          which ride the question or comment is about. */}
      {post.bike && (
        <Link
          href={`/bikes/${post.bike.id}`}
          className="mx-4 mb-2 flex items-center gap-3 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-800 rounded-xl p-2 transition-colors"
        >
          <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-900 flex-shrink-0 relative">
            {post.bike.photo_url ? (
              <Image
                src={getImageUrl('bikes', post.bike.photo_url)}
                alt=""
                fill
                className="object-cover"
                sizes="48px"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg className="w-6 h-6 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <circle cx="5.5" cy="17.5" r="3.5" />
                  <circle cx="18.5" cy="17.5" r="3.5" />
                  <path d="M15 6h3l2 5m-4-5l-4 11H5.5m0 0l2-7h7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-zinc-500 text-xs">Posted on this bike</p>
            <p className="text-white font-medium text-sm truncate">
              {[post.bike.year, post.bike.make, post.bike.model].filter(Boolean).join(' ') || 'Bike'}
            </p>
          </div>
          <svg className="w-4 h-4 text-zinc-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}

      {/* Text content — edit mode or display mode */}
      {editing ? (
        <div className="px-4 pb-3 space-y-2">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={3}
            maxLength={5000}
            className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-orange-500 transition-colors resize-none"
            autoFocus
          />
          {editError && <p className="text-red-400 text-sm">{editError}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={handleEdit}
              disabled={saving || !editContent.trim()}
              className="bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => { setEditing(false); setEditError('') }}
              className="text-zinc-400 hover:text-white text-sm px-3 py-1.5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (displayContent || post.shared_post_id) && (() => {
        const garageContent = displayContent ? renderGaragePost(displayContent, post.author?.username) : null
        const groupJoinContent = !garageContent && displayContent ? renderGroupJoinPost(displayContent, post.group?.slug, !!post.group) : null
        const listingContent = !garageContent && !groupJoinContent && displayContent ? renderListingPost(displayContent) : null
        const specialContent = garageContent ?? groupJoinContent ?? listingContent
        const ytVideo = !specialContent && displayContent ? extractYouTubeId(displayContent) : null
        return (
          <div className="px-4 pb-3 space-y-2">
            {displayContent && (
              specialContent ? (
                <div className="text-zinc-200 text-lg leading-relaxed whitespace-pre-wrap">
                  {specialContent}
                </div>
              ) : (
                <p className="text-zinc-200 text-lg leading-relaxed whitespace-pre-wrap">
                  {renderContent(displayContent, ytVideo?.fullUrl)}
                </p>
              )
            )}
            {ytVideo && <YouTubeEmbed videoId={ytVideo.id} />}
            {post.shared_post_id && (
              post.shared_post
                ? <SharedPostEmbed post={post.shared_post} />
                : <div className="border border-zinc-700 rounded-xl px-4 py-3 text-zinc-500 text-sm italic">Original post was deleted.</div>
            )}
            {post.event && (
              <div className="border border-zinc-800 rounded-xl overflow-hidden">
                <EventCard event={post.event as any} />
              </div>
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

      {/* Game share CTA */}
      {post.post_type === 'game_share' && (
        <Link
          href="/play"
          className="flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-4 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.44 9.03L15.41 5H11v2h3.59l2 2H5c-2.8 0-5 2.2-5 5s2.2 5 5 5c2.46 0 4.45-1.69 4.9-4h1.65l2.77-2.77c-.21.54-.32 1.14-.32 1.77 0 2.8 2.2 5 5 5s5-2.2 5-5c0-2.8-2.2-5-5-5-1.09 0-2.09.35-2.91.93L14.4 9.03h5.04zM5 17c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3zm14 0c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z" />
          </svg>
          Play What's That Bike?
        </Link>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-4 px-2 py-1 border-t border-zinc-800">
        {/* Like group: heart + count */}
        <div className="flex items-center">
          <button
            onClick={handleLike}
            className={`flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg transition-colors ${
              liked
                ? 'text-orange-400 bg-orange-500/10'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            {liked ? (
              <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            ) : (
              <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
          {likeCount > 0 && (
            <button
              onClick={() => setShowLikers(true)}
              className="min-h-[44px] px-2 flex items-center text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {likeCount}
            </button>
          )}
        </div>

        {/* Comment group: bubble + count */}
        <button
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-2 min-h-[44px] px-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {commentCount > 0 && <span className="text-sm font-medium">{commentCount}</span>}
        </button>

        {/* Share */}
        {currentUserId && !post.shared_post_id && (
          <button
            onClick={() => setShowShareModal(true)}
            className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Share"
          >
            <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </button>
        )}
      </div>

      {/* Likers modal */}
      {showLikers && currentUserId && (
        <LikersModal
          postId={post.id}
          currentUserId={currentUserId}
          onClose={() => setShowLikers(false)}
        />
      )}

      {/* Share modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowShareModal(false)} />
          <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
              <h2 className="text-white font-semibold">Share to Feed</h2>
              <button onClick={() => setShowShareModal(false)} className="text-zinc-500 hover:text-white transition-colors text-lg leading-none">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <textarea
                value={shareCaption}
                onChange={(e) => setShareCaption(e.target.value)}
                placeholder="Say something about this post… (optional)"
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-orange-500 transition-colors resize-none"
              />
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
            postAuthorId={post.author_id}
            currentUserId={currentUserId}
            currentUserProfile={currentUserProfile}
            blockedUserIds={blockedUserIds}
            onVisibleCountChange={updateCommentCount}
          />
        </div>
      )}
    </div>
  )
}
