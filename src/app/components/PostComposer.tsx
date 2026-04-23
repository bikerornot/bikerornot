'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Profile, UserBike } from '@/lib/supabase/types'
import { getImageUrl } from '@/lib/supabase/image'
import { createPost } from '@/app/actions/posts'
import { compressImage } from '@/lib/compress'
import { extractYouTubeId, fetchYouTubeMeta } from '@/lib/youtube'
import MentionDropdown, { useMention } from './MentionDropdown'
import PlacePicker from './PlacePicker'
import { getOrCreatePlace, type PlaceSearchResult } from '@/app/actions/places'

interface Props {
  currentUserProfile: Profile
  wallOwnerId?: string
  wallOwnerUsername?: string
  groupId?: string
  bikeId?: string
  bikes?: UserBike[]
  onPostCreated?: (postId: string) => void
}

export default function PostComposer({ currentUserProfile, wallOwnerId, wallOwnerUsername, groupId, bikeId, bikes, onPostCreated }: Props) {
  const [content, setContent] = useState('')
  const [images, setImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ytPreview, setYtPreview] = useState<{ id: string; title: string; channel: string } | null>(null)
  const [focused, setFocused] = useState(false)
  const [bikePickerOpen, setBikePickerOpen] = useState(false)
  const [taggedBike, setTaggedBike] = useState<UserBike | null>(null)
  const [placePickerOpen, setPlacePickerOpen] = useState(false)
  const [checkedInPlace, setCheckedInPlace] = useState<PlaceSearchResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const ytIdRef = useRef<string | null>(null)
  const [cursorPos, setCursorPos] = useState(0)

  const showBikeTag = bikes !== undefined && !bikeId
  const expanded =
    focused ||
    content.length > 0 ||
    images.length > 0 ||
    ytPreview !== null ||
    taggedBike !== null ||
    bikePickerOpen ||
    checkedInPlace !== null ||
    placePickerOpen

  const handleMentionSelect = useCallback((newText: string, newCursorPos: number) => {
    setContent(newText)
    setCursorPos(newCursorPos)
    // Set cursor position after React re-renders
    setTimeout(() => {
      const ta = textareaRef.current
      if (ta) {
        ta.focus()
        ta.setSelectionRange(newCursorPos, newCursorPos)
      }
    }, 0)
  }, [])

  const mention = useMention(content, cursorPos, handleMentionSelect)

  useEffect(() => {
    const yt = extractYouTubeId(content)
    if (!yt) {
      setYtPreview(null)
      ytIdRef.current = null
      return
    }
    if (yt.id === ytIdRef.current) return
    ytIdRef.current = yt.id
    const timer = setTimeout(async () => {
      const meta = await fetchYouTubeMeta(yt.id)
      if (meta && yt.id === ytIdRef.current) {
        setYtPreview({ id: yt.id, ...meta })
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [content])

  const avatarUrl = currentUserProfile.profile_photo_url
    ? getImageUrl('avatars', currentUserProfile.profile_photo_url)
    : null
  const displayName = currentUserProfile.username ?? 'Unknown'

  const contextPlaceholder = bikeId
    ? 'Share something about this ride…'
    : wallOwnerUsername
    ? `Share something with @${wallOwnerUsername}…`
    : null

  const [rotatedPlaceholder, setRotatedPlaceholder] = useState(() => {
    const firstName = currentUserProfile.first_name ?? 'rider'
    return `What's up, ${firstName}?`
  })

  useEffect(() => {
    if (contextPlaceholder) return
    const firstName = currentUserProfile.first_name ?? 'rider'
    const mobilePool = [
      "What's the word?",
      'Tell the crew…',
      "What's shakin'?",
      'Share the ride…',
      `What's up, ${firstName}?`,
    ]
    const desktopPool = [
      `What's going on, ${firstName}?`,
      'Share something with the crew…',
    ]
    const isMobile =
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 639px)').matches
    const pool = isMobile ? mobilePool : desktopPool
    setRotatedPlaceholder(pool[Math.floor(Math.random() * pool.length)])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const placeholder = contextPlaceholder ?? rotatedPlaceholder

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (images.length + files.length > 4) {
      setError('Maximum 4 images per post')
      return
    }

    setCompressing(true)
    setError(null)
    try {
      const compressed = await Promise.all(files.map((f) => compressImage(f)))

      // Validate total payload stays under Vercel's 4.5 MB function limit
      const existingBytes = images.reduce((s, f) => s + f.size, 0)
      const newBytes = compressed.reduce((s, f) => s + f.size, 0)
      if (existingBytes + newBytes > 3.5 * 1024 * 1024) {
        setError('Images are too large. Please use fewer images or choose smaller files.')
        return
      }

      setImages((prev) => [...prev, ...compressed])
      compressed.forEach((file) => {
        setImagePreviews((prev) => [...prev, URL.createObjectURL(file)])
      })
    } catch {
      setError('Failed to process images')
    } finally {
      setCompressing(false)
    }
  }

  function removeImage(index: number) {
    URL.revokeObjectURL(imagePreviews[index])
    setImages((prev) => prev.filter((_, i) => i !== index))
    setImagePreviews((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim() && images.length === 0) return

    setSubmitting(true)
    setError(null)

    try {
      const formData = new FormData()
      if (content.trim()) formData.set('content', content.trim())
      if (wallOwnerId) formData.set('wallOwnerId', wallOwnerId)
      if (groupId) formData.set('groupId', groupId)
      const effectiveBikeId = bikeId ?? taggedBike?.id
      if (effectiveBikeId) formData.set('bikeId', effectiveBikeId)
      // Resolve the check-in right before submit — getOrCreatePlace will
      // reuse the places row if someone else has already checked in here.
      // Failure is non-fatal: post still goes out, we just skip the attach.
      if (checkedInPlace) {
        try {
          const placeId = await getOrCreatePlace(checkedInPlace)
          formData.set('placeId', placeId)
        } catch (err) {
          console.warn('Could not resolve place for check-in', err)
        }
      }
      images.forEach((file) => formData.append('images', file))

      const result = await createPost(formData)

      if ('error' in result) {
        setError(result.error)
        return
      }

      setContent('')
      setImages([])
      imagePreviews.forEach((url) => URL.revokeObjectURL(url))
      setImagePreviews([])
      setYtPreview(null)
      ytIdRef.current = null
      setTaggedBike(null)
      setBikePickerOpen(false)
      setCheckedInPlace(null)
      setFocused(false)
      onPostCreated?.(result.postId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create post')
    } finally {
      setSubmitting(false)
    }
  }

  function insertMention() {
    const ta = textareaRef.current
    if (!ta) return
    ta.focus()
    setFocused(true)
    const pos = ta.selectionStart ?? content.length
    const before = content.slice(0, pos)
    const after = content.slice(pos)
    const needsSpace = before.length > 0 && !/\s$/.test(before)
    const insert = (needsSpace ? ' ' : '') + '@'
    const newText = before + insert + after
    const newPos = pos + insert.length
    setContent(newText)
    setCursorPos(newPos)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(newPos, newPos)
    }, 0)
  }

  function handleBikeClick() {
    setBikePickerOpen((v) => !v)
  }

  function formatBike(b: UserBike) {
    return [b.year, b.make, b.model].filter(Boolean).join(' ') || 'Untitled bike'
  }

  const hasBikes = (bikes ?? []).length > 0

  return (
    <div
      className={`bg-zinc-900 rounded-xl border p-4 shadow-lg shadow-black/40 transition-colors ${
        expanded ? 'border-orange-500/70' : 'border-orange-500/30'
      }`}
    >
      <form onSubmit={handleSubmit}>
        {/* Avatar + textarea row */}
        <div className="flex gap-3 items-start">
          <div className="w-11 h-11 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={displayName}
                width={44}
                height={44}
                className="object-cover w-full h-full"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold">
                {(currentUserProfile.first_name?.[0] ?? '?').toUpperCase()}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => {
                setContent(e.target.value)
                setCursorPos(e.target.selectionStart ?? 0)
              }}
              onKeyDown={(e) => {
                if (mention.handleKeyDown(e)) return
              }}
              onSelect={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={placeholder}
              rows={expanded ? 3 : 1}
              maxLength={5000}
              disabled={submitting}
              className="w-full bg-transparent text-white placeholder-zinc-500 focus:outline-none text-base resize-none leading-6 pt-2"
            />
            {content.length > 4500 && (
              <p className={`text-xs mt-1 ${content.length >= 5000 ? 'text-red-400' : 'text-zinc-500'}`}>
                {content.length}/5000
              </p>
            )}
            {mention.visible && (
              <MentionDropdown
                suggestions={mention.suggestions}
                activeIndex={mention.activeIndex}
                onSelect={mention.selectSuggestion}
                inline
              />
            )}

          </div>

          {/* Icon-only action row at rest */}
          {!expanded && (
            <div className="flex items-center gap-1 pt-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-orange-400/70 hover:text-orange-400 p-2 rounded-lg hover:bg-zinc-800"
                title="Add photos"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </button>
              {showBikeTag && (
                <button
                  type="button"
                  onClick={() => {
                    setFocused(true)
                    handleBikeClick()
                  }}
                  className="text-orange-400/70 hover:text-orange-400 p-2 rounded-lg hover:bg-zinc-800"
                  title="Tag a bike"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <circle cx="5.5" cy="17.5" r="3.5" />
                    <circle cx="18.5" cy="17.5" r="3.5" />
                    <path d="M15 6h3l2 5m-4-5l-4 11H5.5m0 0l2-7h7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={insertMention}
                className="text-orange-400/70 hover:text-orange-400 p-2 rounded-lg hover:bg-zinc-800"
                title="Tag a friend"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFocused(true)
                  setPlacePickerOpen(true)
                }}
                className="text-orange-400/70 hover:text-orange-400 p-2 rounded-lg hover:bg-zinc-800"
                title="Check in"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-7.5 8-13a8 8 0 10-16 0c0 5.5 8 13 8 13z" />
                  <circle cx="12" cy="9" r="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Image previews — rendered at form level (not inside the avatar
            row) so they span the full composer width and match how the
            final post looks in the feed. Previously they were nested in
            the textarea column, which pinched them flush to the right of
            the avatar. */}
        {imagePreviews.length > 0 && (
          <div
            className={`grid gap-2 mt-3 ${imagePreviews.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}
          >
            {imagePreviews.map((url, i) => (
              <div
                key={i}
                className="relative aspect-video rounded-lg overflow-hidden bg-zinc-800"
              >
                <Image src={url} alt="" fill className="object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-black"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* YouTube preview — full width to match how it looks when posted */}
        {ytPreview && (
          <div className="mt-2 rounded-xl overflow-hidden border border-zinc-700">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://img.youtube.com/vi/${ytPreview.id}/hqdefault.jpg`}
                alt="YouTube preview"
                className="w-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center shadow-lg">
                  <svg className="w-5 h-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
            </div>
            <div className="bg-zinc-800 px-3 py-2.5 space-y-0.5">
              <p className="flex items-center gap-1.5 text-sm text-zinc-500">
                <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5a3 3 0 0 0-2.1 2.1C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z" />
                </svg>
                YouTube
              </p>
              <p className="text-white text-sm font-medium line-clamp-2">{ytPreview.title}</p>
              <p className="text-zinc-400 text-sm">{ytPreview.channel}</p>
            </div>
          </div>
        )}

        {/* Checked-in place chip — mirrors the tagged-bike chip below so
            both optional post annotations share the same visual language. */}
        {checkedInPlace && (
          <div className="mt-3 flex items-center gap-3 bg-zinc-800 rounded-lg p-2 pr-3 border border-zinc-700">
            <div className="w-12 h-12 rounded-md bg-orange-500/15 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-7.5 8-13a8 8 0 10-16 0c0 5.5 8 13 8 13z" />
                <circle cx="12" cy="9" r="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-orange-400/80 font-medium">Checked in at</p>
              <p className="text-white text-sm font-medium truncate">{checkedInPlace.name}</p>
              {checkedInPlace.fullAddress && (
                <p className="text-zinc-500 text-xs truncate">{checkedInPlace.fullAddress}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setCheckedInPlace(null)}
              className="text-zinc-500 hover:text-white p-1.5 rounded-full hover:bg-zinc-700 flex-shrink-0"
              title="Remove check-in"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Tagged bike chip */}
        {taggedBike && (
          <div className="mt-3 flex items-center gap-3 bg-zinc-800 rounded-lg p-2 pr-3 border border-zinc-700">
            <div className="relative w-12 h-12 rounded-md bg-zinc-700 overflow-hidden flex-shrink-0">
              {taggedBike.photo_url ? (
                <Image
                  src={getImageUrl('bikes', taggedBike.photo_url)}
                  alt={formatBike(taggedBike)}
                  fill
                  className="object-cover"
                  sizes="48px"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xl select-none">🏍️</div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-orange-400/80 font-medium">Riding</p>
              <p className="text-white text-sm font-medium truncate">{formatBike(taggedBike)}</p>
            </div>
            <button
              type="button"
              onClick={() => setTaggedBike(null)}
              className="text-zinc-500 hover:text-white p-1.5 rounded-full hover:bg-zinc-700 flex-shrink-0"
              title="Remove bike"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Bike picker panel */}
        {bikePickerOpen && showBikeTag && (
          <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-950 overflow-hidden">
            {hasBikes ? (
              <>
                <div className="px-3 py-2 text-xs uppercase tracking-wider text-zinc-500 border-b border-zinc-800 flex items-center justify-between">
                  <span>Tag a bike from your garage</span>
                  <button
                    type="button"
                    onClick={() => setBikePickerOpen(false)}
                    className="text-zinc-500 hover:text-white"
                    title="Close"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {(bikes ?? []).map((bike) => (
                    <button
                      key={bike.id}
                      type="button"
                      onClick={() => {
                        setTaggedBike(bike)
                        setBikePickerOpen(false)
                      }}
                      className="w-full flex items-center gap-3 p-2.5 hover:bg-zinc-800 transition-colors text-left"
                    >
                      <div className="relative w-11 h-11 rounded-md bg-zinc-800 overflow-hidden flex-shrink-0">
                        {bike.photo_url ? (
                          <Image
                            src={getImageUrl('bikes', bike.photo_url)}
                            alt={formatBike(bike)}
                            fill
                            className="object-cover"
                            sizes="44px"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-lg select-none">🏍️</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{formatBike(bike)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="p-4 text-center">
                <div className="text-3xl mb-2">🏍️</div>
                <p className="text-white text-sm font-medium mb-1">No bikes in your garage yet</p>
                <p className="text-zinc-400 text-xs mb-3">Add one so you can tag it in your posts.</p>
                <Link
                  href={`/profile/${currentUserProfile.username}?tab=Garage`}
                  className="inline-block bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-1.5 rounded-full transition-colors"
                >
                  Go to my garage
                </Link>
                <button
                  type="button"
                  onClick={() => setBikePickerOpen(false)}
                  className="block mx-auto mt-2 text-xs text-zinc-500 hover:text-zinc-300"
                >
                  Not now
                </button>
              </div>
            )}
          </div>
        )}

        {compressing && <p className="text-zinc-400 text-sm mt-2">Compressing images…</p>}
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={handleImageSelect}
        />

        {/* Expanded action bar */}
        {expanded && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800">
            <div className="flex items-center gap-1">
              {images.length < 4 && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-orange-400/80 hover:text-orange-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800 text-sm font-medium"
                  title="Add photos (max 4)"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  Photo
                </button>
              )}
              {showBikeTag && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleBikeClick}
                  className={`flex items-center gap-1.5 transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800 text-sm font-medium ${
                    bikePickerOpen || taggedBike
                      ? 'text-orange-400 bg-zinc-800'
                      : 'text-orange-400/80 hover:text-orange-400'
                  }`}
                  title="Tag a bike"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <circle cx="5.5" cy="17.5" r="3.5" />
                    <circle cx="18.5" cy="17.5" r="3.5" />
                    <path d="M15 6h3l2 5m-4-5l-4 11H5.5m0 0l2-7h7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Bike
                </button>
              )}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={insertMention}
                className="flex items-center gap-1.5 text-orange-400/80 hover:text-orange-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800 text-sm font-medium"
                title="Tag a friend"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                <span>Tag</span>
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setPlacePickerOpen(true)}
                className={`flex items-center gap-1.5 transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800 text-sm font-medium ${
                  placePickerOpen || checkedInPlace
                    ? 'text-orange-400 bg-zinc-800'
                    : 'text-orange-400/80 hover:text-orange-400'
                }`}
                title="Check in"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-7.5 8-13a8 8 0 10-16 0c0 5.5 8 13 8 13z" />
                  <circle cx="12" cy="9" r="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Check in</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={(!content.trim() && images.length === 0 && !taggedBike) || submitting || compressing}
              className="bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-1.5 rounded-full transition-colors"
            >
              {submitting ? 'Posting…' : 'Post'}
            </button>
          </div>
        )}
      </form>

      {placePickerOpen && (
        <PlacePicker
          onClose={() => setPlacePickerOpen(false)}
          onSelect={(place) => {
            setCheckedInPlace(place)
            setPlacePickerOpen(false)
          }}
        />
      )}
    </div>
  )
}
