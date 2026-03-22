'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { Profile } from '@/lib/supabase/types'
import { getImageUrl } from '@/lib/supabase/image'
import { createPost } from '@/app/actions/posts'
import { compressImage } from '@/lib/compress'
import { extractYouTubeId, fetchYouTubeMeta } from '@/lib/youtube'
import MentionDropdown, { useMention } from './MentionDropdown'

interface Props {
  currentUserProfile: Profile
  wallOwnerId?: string
  groupId?: string
  bikeId?: string
  onPostCreated?: (postId: string) => void
}

export default function PostComposer({ currentUserProfile, wallOwnerId, groupId, bikeId, onPostCreated }: Props) {
  const [content, setContent] = useState('')
  const [images, setImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ytPreview, setYtPreview] = useState<{ id: string; title: string; channel: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const ytIdRef = useRef<string | null>(null)
  const [cursorPos, setCursorPos] = useState(0)

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
      if (bikeId) formData.set('bikeId', bikeId)
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
      onPostCreated?.(result.postId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create post')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-orange-500/5 rounded-xl border border-orange-500/30 p-4 shadow-lg shadow-black/40 focus-within:border-orange-500/60 transition-colors">
      <form onSubmit={handleSubmit}>
        {/* Avatar + textarea row */}
        <div className="flex gap-3">
          <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
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
                {(currentUserProfile.first_name?.[0] ?? '?').toUpperCase()}
              </div>
            )}
          </div>

          <div className="flex-1">
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
              placeholder={bikeId ? "Share something about this ride…" : "Share something with the crew…"}
              rows={3}
              disabled={submitting}
              className="w-full bg-transparent text-white placeholder-zinc-500 focus:outline-none text-base resize-none"
            />
            {mention.visible && (
              <MentionDropdown
                suggestions={mention.suggestions}
                activeIndex={mention.activeIndex}
                onSelect={mention.selectSuggestion}
                inline
              />
            )}

            {imagePreviews.length > 0 && (
              <div
                className={`grid gap-2 mt-2 ${imagePreviews.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}
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
                      className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-black"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

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
              <p className="flex items-center gap-1.5 text-xs text-zinc-500">
                <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5a3 3 0 0 0-2.1 2.1C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z" />
                </svg>
                YouTube
              </p>
              <p className="text-white text-sm font-medium line-clamp-2">{ytPreview.title}</p>
              <p className="text-zinc-400 text-xs">{ytPreview.channel}</p>
            </div>
          </div>
        )}

        {compressing && <p className="text-zinc-400 text-xs mt-2">Compressing images…</p>}
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}

        {/* Action bar */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-orange-500/20">
          <div className="flex items-center gap-2">
            {images.length < 4 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-orange-400/70 hover:text-orange-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800 text-sm font-medium"
                title="Add photos (max 4)"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                Add Photo
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={handleImageSelect}
            />
            <button
              type="button"
              onClick={() => {
                const ta = textareaRef.current
                if (!ta) return
                ta.focus()
                const pos = ta.selectionStart ?? content.length
                const before = content.slice(0, pos)
                const after = content.slice(pos)
                // Add space before @ if needed
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
              }}
              className="flex items-center gap-1.5 text-orange-400/70 hover:text-orange-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800 text-sm font-medium"
              title="Tag a friend"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
              <span className="hidden sm:inline">Tag</span>
            </button>
          </div>

          <button
            type="submit"
            disabled={(!content.trim() && images.length === 0) || submitting || compressing}
            className="bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-1.5 rounded-full transition-colors"
          >
            {submitting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </form>
    </div>
  )
}
