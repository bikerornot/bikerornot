'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { Profile } from '@/lib/supabase/types'
import { getImageUrl } from '@/lib/supabase/image'
import { createPost } from '@/app/actions/posts'
import { compressImage } from '@/lib/compress'

interface Props {
  currentUserProfile: Profile
  wallOwnerId?: string
  groupId?: string
  onPostCreated?: (postId: string) => void
}

export default function PostComposer({ currentUserProfile, wallOwnerId, groupId, onPostCreated }: Props) {
  const [content, setContent] = useState('')
  const [images, setImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      onPostCreated?.(result.postId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create post')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
      <form onSubmit={handleSubmit}>
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
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's on your mind?"
              rows={3}
              disabled={submitting}
              className="w-full bg-transparent text-white placeholder-zinc-500 focus:outline-none text-base resize-none"
            />

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

            {compressing && <p className="text-zinc-400 text-xs mt-2">Compressing images…</p>}
            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800">
              <div className="flex items-center gap-2">
                {images.length < 4 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-zinc-400 hover:text-orange-400 transition-colors p-1.5 rounded-lg hover:bg-zinc-800"
                    title="Add photos (max 4)"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
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
              </div>

              <button
                type="submit"
                disabled={(!content.trim() && images.length === 0) || submitting || compressing}
                className="bg-orange-500 hover:bg-orange-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
              >
                {submitting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
