'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { uploadProfilePhoto } from './actions'
import { compressImage } from '@/lib/compress'

export default function ProfilePhotoUpload({ userId }: { userId: string }) {
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
      const formData = new FormData()
      formData.append('file', compressed)
      const result = await uploadProfilePhoto(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
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
        aria-label="Change profile photo"
        className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center rounded-full cursor-pointer disabled:cursor-wait"
      >
        <span className="text-white text-xs font-medium text-center leading-tight px-1">
          {uploading ? 'Uploading…' : 'Change photo'}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
      {error && (
        <p className="absolute -bottom-6 left-0 right-0 text-center text-red-400 text-xs">
          {error}
        </p>
      )}
    </>
  )
}
