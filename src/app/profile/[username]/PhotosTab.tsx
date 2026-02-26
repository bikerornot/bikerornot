'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { getImageUrl } from '@/lib/supabase/image'
import { likePost, unlikePost } from '@/app/actions/posts'
import CommentSection from '@/app/components/CommentSection'
import type { Profile } from '@/lib/supabase/types'

interface PhotoItem {
  id: string
  storagePath: string
  bucket: 'posts' | 'bikes'
  caption: string | null
  postId: string | null
  likeCount: number
  isLikedByMe: boolean
  commentCount: number
}

interface Props {
  profileId: string
  currentUserId?: string
  currentUserProfile?: Profile | null
}

export default function PhotosTab({ profileId, currentUserId, currentUserProfile }: Props) {
  const [postPhotos, setPostPhotos] = useState<PhotoItem[]>([])
  const [bikePhotos, setBikePhotos] = useState<PhotoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({})
  const [likeCountMap, setLikeCountMap] = useState<Record<string, number>>({})
  const [showCommentsFor, setShowCommentsFor] = useState<string | null>(null)

  const allPhotos = [...postPhotos, ...bikePhotos]
  const totalPhotos = postPhotos.length + bikePhotos.length

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      const [{ data: posts }, { data: bikes }] = await Promise.all([
        supabase
          .from('posts')
          .select('id, content, images:post_images(id, storage_path, order_index)')
          .eq('author_id', profileId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('user_bikes')
          .select('id, year, make, model, photo_url')
          .eq('user_id', profileId)
          .not('photo_url', 'is', null),
      ])

      const postIds = (posts ?? []).map((p) => p.id)

      const [{ data: allLikes }, { data: myLikes }, { data: allComments }] = await Promise.all([
        postIds.length > 0
          ? supabase.from('post_likes').select('post_id').in('post_id', postIds)
          : Promise.resolve({ data: [] as { post_id: string }[] }),
        postIds.length > 0 && currentUserId
          ? supabase.from('post_likes').select('post_id').in('post_id', postIds).eq('user_id', currentUserId)
          : Promise.resolve({ data: [] as { post_id: string }[] }),
        postIds.length > 0
          ? supabase.from('comments').select('post_id').in('post_id', postIds).is('deleted_at', null)
          : Promise.resolve({ data: [] as { post_id: string }[] }),
      ])

      const likeCountByPost = (allLikes ?? []).reduce<Record<string, number>>((acc, r) => {
        acc[r.post_id] = (acc[r.post_id] ?? 0) + 1
        return acc
      }, {})
      const myLikeSet = new Set((myLikes ?? []).map((l) => l.post_id))
      const commentCountByPost = (allComments ?? []).reduce<Record<string, number>>((acc, r) => {
        acc[r.post_id] = (acc[r.post_id] ?? 0) + 1
        return acc
      }, {})

      const pPhotos: PhotoItem[] = []
      for (const post of posts ?? []) {
        const sorted = [...(post.images ?? [])].sort((a, b) => a.order_index - b.order_index)
        for (const img of sorted) {
          pPhotos.push({
            id: img.id,
            storagePath: img.storage_path,
            bucket: 'posts',
            caption: post.content ?? null,
            postId: post.id,
            likeCount: likeCountByPost[post.id] ?? 0,
            isLikedByMe: myLikeSet.has(post.id),
            commentCount: commentCountByPost[post.id] ?? 0,
          })
        }
      }

      const bPhotos: PhotoItem[] = (bikes ?? []).map((b) => ({
        id: b.id,
        storagePath: b.photo_url!,
        bucket: 'bikes' as const,
        caption: [b.year, b.make, b.model].filter(Boolean).join(' ') || null,
        postId: null,
        likeCount: 0,
        isLikedByMe: false,
        commentCount: 0,
      }))

      // Seed lightbox interaction state from fetched data
      const likedInit: Record<string, boolean> = {}
      const countInit: Record<string, number> = {}
      for (const p of pPhotos) {
        if (p.postId) {
          likedInit[p.postId] = p.isLikedByMe
          countInit[p.postId] = p.likeCount
        }
      }
      setLikedMap(likedInit)
      setLikeCountMap(countInit)
      setPostPhotos(pPhotos)
      setBikePhotos(bPhotos)
      setLoading(false)
    }

    load().catch(console.error)
  }, [profileId, currentUserId])

  // Collapse comments when navigating to a different photo
  useEffect(() => {
    setShowCommentsFor(null)
  }, [lightboxIndex])

  // Keyboard navigation
  useEffect(() => {
    if (lightboxIndex === null) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightboxIndex(null)
      if (e.key === 'ArrowRight') setLightboxIndex((i) => (i !== null && i < totalPhotos - 1 ? i + 1 : i))
      if (e.key === 'ArrowLeft') setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i))
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [lightboxIndex, totalPhotos])

  async function handleLike(postId: string) {
    if (!currentUserId) return
    const isLiked = likedMap[postId] ?? false
    setLikedMap((prev) => ({ ...prev, [postId]: !isLiked }))
    setLikeCountMap((prev) => ({ ...prev, [postId]: (prev[postId] ?? 0) + (isLiked ? -1 : 1) }))
    if (isLiked) {
      await unlikePost(postId)
    } else {
      await likePost(postId)
    }
  }

  if (loading) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 text-center">
        <p className="text-zinc-500 text-sm">Loading photos…</p>
      </div>
    )
  }

  if (totalPhotos === 0) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-10 text-center">
        <p className="text-zinc-400 text-sm">No photos yet.</p>
        <p className="text-zinc-600 text-xs mt-1">Share a post with a photo to add it here.</p>
      </div>
    )
  }

  const currentPhoto = lightboxIndex !== null ? allPhotos[lightboxIndex] : null

  function renderGrid(photos: PhotoItem[], startIndex: number) {
    return (
      <div className="grid grid-cols-3 gap-1">
        {photos.map((photo, i) => (
          <button
            key={photo.id}
            onClick={() => setLightboxIndex(startIndex + i)}
            className="relative aspect-square bg-zinc-800 overflow-hidden group rounded-sm"
          >
            <Image
              src={getImageUrl(photo.bucket, photo.storagePath)}
              alt={photo.caption ?? 'Photo'}
              fill
              sizes="(max-width: 672px) 33vw, 224px"
              className="object-cover transition-transform duration-200 group-hover:scale-105"
            />
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {postPhotos.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Post Photos · {postPhotos.length}
          </p>
          {renderGrid(postPhotos, 0)}
        </div>
      )}

      {bikePhotos.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
            Bike Photos · {bikePhotos.length}
          </p>
          {renderGrid(bikePhotos, postPhotos.length)}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && currentPhoto && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">

          {/* Top bar: counter + close */}
          <div className="flex items-center justify-between px-4 py-2 flex-shrink-0">
            <span className="text-zinc-500 text-sm">{lightboxIndex + 1} / {totalPhotos}</span>
            <button
              onClick={() => setLightboxIndex(null)}
              className="text-white/60 hover:text-white transition-colors p-1"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Image — fills all available space between top bar and bottom panel */}
          <div className="flex-1 relative flex items-center justify-center min-h-0">
            {lightboxIndex > 0 && (
              <button
                className="absolute left-2 z-10 text-white/50 hover:text-white transition-colors"
                onClick={() => setLightboxIndex(lightboxIndex - 1)}
                aria-label="Previous"
              >
                <svg className="w-9 h-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getImageUrl(currentPhoto.bucket, currentPhoto.storagePath)}
              alt={currentPhoto.caption ?? 'Photo'}
              className="max-h-full max-w-full object-contain"
            />
            {lightboxIndex < totalPhotos - 1 && (
              <button
                className="absolute right-2 z-10 text-white/50 hover:text-white transition-colors"
                onClick={() => setLightboxIndex(lightboxIndex + 1)}
                aria-label="Next"
              >
                <svg className="w-9 h-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>

          {/* Bottom panel — always visible, comments expand upward */}
          <div className="flex-shrink-0 bg-zinc-900 border-t border-zinc-800 max-w-2xl w-full mx-auto">

            {/* Caption */}
            {currentPhoto.caption && (
              <p className="px-4 pt-3 pb-1 text-zinc-200 text-sm leading-relaxed line-clamp-2">
                {currentPhoto.caption}
              </p>
            )}

            {/* Like + comment action bar (post photos only, logged-in users only) */}
            {currentPhoto.postId && currentUserId && (
              <div className="flex items-center gap-1 px-3 py-2">
                <button
                  onClick={() => handleLike(currentPhoto.postId!)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-base font-medium transition-colors ${
                    likedMap[currentPhoto.postId]
                      ? 'text-orange-400 bg-orange-500/10'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  }`}
                >
                  {likedMap[currentPhoto.postId] ? '♥' : '♡'}
                  {(likeCountMap[currentPhoto.postId] ?? 0) > 0 && (
                    <span className="text-sm">{likeCountMap[currentPhoto.postId]}</span>
                  )}
                </button>

                <button
                  onClick={() =>
                    setShowCommentsFor(
                      showCommentsFor === currentPhoto.postId ? null : currentPhoto.postId
                    )
                  }
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-base font-medium transition-colors ${
                    showCommentsFor === currentPhoto.postId
                      ? 'text-orange-400 bg-orange-500/10'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  }`}
                >
                  💬
                  {currentPhoto.commentCount > 0 && (
                    <span className="text-sm">{currentPhoto.commentCount}</span>
                  )}
                </button>
              </div>
            )}

            {/* Comments — scrollable, max height so they don't push image off screen */}
            {currentPhoto.postId && showCommentsFor === currentPhoto.postId && (
              <div className="max-h-56 overflow-y-auto border-t border-zinc-800 px-4 py-3">
                <CommentSection
                  postId={currentPhoto.postId}
                  currentUserId={currentUserId}
                  currentUserProfile={currentUserProfile}
                />
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
