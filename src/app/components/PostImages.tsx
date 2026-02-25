'use client'

import { useState } from 'react'
import Image from 'next/image'
import { getImageUrl } from '@/lib/supabase/image'
import { PostImage } from '@/lib/supabase/types'

export default function PostImages({ images }: { images: PostImage[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  if (images.length === 0) return null

  const urls = images.map((img) => getImageUrl('posts', img.storage_path))

  const gridClass =
    images.length === 1
      ? 'grid-cols-1'
      : images.length === 2
        ? 'grid-cols-2'
        : images.length === 3
          ? 'grid-cols-3'
          : 'grid-cols-2'

  return (
    <>
      <div className={`grid gap-1 ${gridClass}`}>
        {images.slice(0, 4).map((img, i) => (
          <div
            key={img.id}
            className="relative aspect-[4/5] overflow-hidden cursor-pointer bg-zinc-800"
            onClick={() => setLightboxIndex(i)}
          >
            <Image
              src={urls[i]}
              alt={`Image ${i + 1}`}
              fill
              className={`${images.length === 1 ? 'object-contain' : 'object-cover'} hover:opacity-90 transition-opacity`}
            />
            {i === 3 && images.length > 4 && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-xl font-bold">
                +{images.length - 4}
              </div>
            )}
          </div>
        ))}
      </div>

      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <div
            className="relative max-w-4xl max-h-full w-full h-full"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={urls[lightboxIndex]}
              alt="Full size"
              fill
              className="object-contain"
            />
            <button
              onClick={() => setLightboxIndex(null)}
              className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg hover:bg-black/80"
            >
              ×
            </button>
            {lightboxIndex > 0 && (
              <button
                onClick={() => setLightboxIndex(lightboxIndex - 1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 text-white rounded-full w-10 h-10 flex items-center justify-center text-xl hover:bg-black/80"
              >
                ‹
              </button>
            )}
            {lightboxIndex < urls.length - 1 && (
              <button
                onClick={() => setLightboxIndex(lightboxIndex + 1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 text-white rounded-full w-10 h-10 flex items-center justify-center text-xl hover:bg-black/80"
              >
                ›
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
