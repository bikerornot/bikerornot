'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import type { BikePhoto } from '@/lib/supabase/types'
import { getImageUrl } from '@/lib/supabase/image'
import { compressImage } from '@/lib/compress'
import { uploadBikeGalleryPhoto, deleteBikePhoto, setBikePrimaryPhoto } from '@/app/actions/garage'

interface Props {
  bikeId: string
  initialPhotos: BikePhoto[]
  isOwnGarage: boolean
}

export default function BikePhotoGallery({ bikeId, initialPhotos, isOwnGarage }: Props) {
  const [photos, setPhotos] = useState(initialPhotos)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedPhoto = photos[selectedIndex] ?? null

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploading(true)
    setError(null)
    try {
      const compressed = await compressImage(file, 1, 1920)
      const formData = new FormData()
      formData.append('file', compressed)
      const newPhoto = await uploadBikeGalleryPhoto(bikeId, formData)
      setPhotos((prev) => [...prev, newPhoto])
      // Select the newly uploaded photo
      setSelectedIndex(photos.length)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete() {
    if (!selectedPhoto || deleting) return
    setDeleting(true)
    setError(null)
    try {
      await deleteBikePhoto(selectedPhoto.id)
      setPhotos((prev) => prev.filter((p) => p.id !== selectedPhoto.id))
      setSelectedIndex((prev) => Math.max(0, prev - 1))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  async function handleSetPrimary() {
    if (!selectedPhoto || selectedPhoto.is_primary) return
    try {
      await setBikePrimaryPhoto(selectedPhoto.id)
      setPhotos((prev) =>
        prev.map((p) => ({
          ...p,
          is_primary: p.id === selectedPhoto.id,
        }))
      )
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to set primary')
    }
  }

  // Empty state
  if (photos.length === 0) {
    return (
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-10 text-center">
        <p className="text-4xl mb-3">🏍️</p>
        <p className="text-zinc-500 text-sm mb-3">No photos yet.</p>
        {isOwnGarage && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-orange-400 hover:text-orange-300 text-sm font-medium transition-colors"
            >
              {uploading ? 'Uploading...' : 'Add a photo'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleUpload}
            />
          </>
        )}
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      </div>
    )
  }

  return (
    <div>
      {/* Main photo */}
      <div className="relative aspect-video rounded-xl overflow-hidden bg-zinc-800">
        {selectedPhoto && (
          <Image
            src={getImageUrl('bikes', selectedPhoto.storage_path)}
            alt="Bike photo"
            fill
            className="object-cover"
            priority
          />
        )}

        {/* Delete button overlay (own garage) */}
        {isOwnGarage && selectedPhoto && (
          <div className="absolute top-3 right-3 flex gap-2">
            {!selectedPhoto.is_primary && (
              <button
                onClick={handleSetPrimary}
                className="bg-black/60 hover:bg-black/80 text-white rounded-full px-3 h-9 flex items-center gap-1.5 transition-colors text-xs font-medium"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                Set as main
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={deleting}
              title="Delete photo"
              className="bg-black/60 hover:bg-red-600/80 text-white rounded-full w-9 h-9 flex items-center justify-center transition-colors disabled:opacity-50"
            >
              {deleting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Thumbnail strip */}
      <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
        {photos.map((photo, i) => (
          <button
            key={photo.id}
            onClick={() => setSelectedIndex(i)}
            className={`relative w-16 h-16 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0 transition-all ${
              i === selectedIndex ? 'ring-2 ring-orange-500' : 'opacity-70 hover:opacity-100'
            }`}
          >
            <Image
              src={getImageUrl('bikes', photo.storage_path)}
              alt=""
              fill
              className="object-cover"
              sizes="64px"
            />
            {photo.is_primary && (
              <div className="absolute top-0.5 right-0.5 bg-orange-500 rounded-full w-3 h-3 flex items-center justify-center">
                <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </div>
            )}
          </button>
        ))}

        {/* Upload button */}
        {isOwnGarage && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-16 h-16 rounded-lg border border-dashed border-zinc-700 hover:border-orange-500 flex-shrink-0 flex items-center justify-center text-zinc-500 hover:text-orange-400 transition-colors"
          >
            {uploading ? (
              <div className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleUpload}
      />

      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  )
}
