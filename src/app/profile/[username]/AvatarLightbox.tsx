'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { uploadProfilePhoto } from './actions'
import { compressImage } from '@/lib/compress'

interface Props {
  avatarUrl: string | null
  firstInitial: string
  isOwnProfile: boolean
}

export default function AvatarLightbox({ avatarUrl, firstInitial, isOwnProfile }: Props) {
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)

    try {
      const compressed = await compressImage(file, 0.5, 800)
      if (compressed.size > 3 * 1024 * 1024) {
        setError('Image is too large. Please choose a smaller file.')
        return
      }
      const formData = new FormData()
      formData.append('file', compressed)
      const result = await uploadProfilePhoto(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      setOpen(false)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      {/* Avatar thumbnail — clickable */}
      <div
        onClick={() => setOpen(true)}
        className="relative w-32 h-32 rounded-full border-4 border-zinc-950 bg-zinc-800 overflow-hidden flex-shrink-0 cursor-pointer group"
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt="Profile photo"
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-zinc-600">
            {firstInitial}
          </div>
        )}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-full" />
      </div>

      {/* Lightbox modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setOpen(false)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors text-sm font-medium"
            >
              Close
            </button>

            {/* Large avatar */}
            <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-zinc-800">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt="Profile photo"
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 90vw, 384px"
                  priority
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-8xl font-bold text-zinc-600">
                  {firstInitial}
                </div>
              )}
            </div>

            {/* Edit button for own profile */}
            {isOwnProfile && (
              <div className="mt-3 text-center">
                <button
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading}
                  className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors border border-zinc-700"
                >
                  {uploading ? 'Uploading...' : 'Change Photo'}
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {error && (
                  <p className="text-red-400 text-xs mt-2">{error}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
