'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { uploadCoverPhoto } from './actions'

export default function CoverPhotoUpload({ userId }: { userId: string }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 10 * 1024 * 1024) {
      setError('Cover image must be under 10 MB')
      return
    }

    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      await uploadCoverPhoto(formData)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="absolute bottom-3 right-3 bg-black/60 hover:bg-black/80 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors border border-white/20 flex items-center gap-1.5"
      >
        📷 {uploading ? 'Uploading…' : 'Update cover'}
      </button>
      {error && (
        <p className="absolute bottom-12 right-3 bg-red-500/90 text-white text-xs px-3 py-1.5 rounded-lg">
          {error}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
    </>
  )
}
