'use client'

import { useState } from 'react'
import Image from 'next/image'
import { getImageUrl } from '@/lib/supabase/image'
import { PostImage } from '@/lib/supabase/types'

interface ImageDimensions {
  width: number
  height: number
}

export default function PostImages({ images }: { images: PostImage[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [dimensions, setDimensions] = useState<(ImageDimensions | null)[]>(
    () => Array(images.length).fill(null)
  )

  if (images.length === 0) return null

  const urls = images.map((img) => getImageUrl('posts', img.storage_path))

  function handleLoad(i: number, e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = e.currentTarget
    setDimensions((prev) => {
      const next = [...prev]
      next[i] = { width: naturalWidth, height: naturalHeight }
      return next
    })
  }

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
        {images.slice(0, 4).map((img, i) => {
          const dim = dimensions[i]

          // Single image: natural aspect ratio, no cropping, no bars
          // Multi-image grid: fixed square cells for uniform grid appearance
          const singleImage = images.length === 1

          return (
            <div
              key={img.id}
              className="relative overflow-hidden cursor-pointer bg-zinc-800"
              style={
                singleImage && dim
                  ? { aspectRatio: `${dim.width} / ${dim.height}` }
                  : singleImage
                    ? { aspectRatio: '4 / 5' } // placeholder until loaded
                    : { aspectRatio: '1 / 1' }  // square cells for grid
              }
              onClick={() => setLightboxIndex(i)}
            >
              <Image
                src={urls[i]}
                alt={`Image ${i + 1}`}
                fill
                className="object-cover hover:opacity-90 transition-opacity"
                onLoad={(e) => handleLoad(i, e)}
              />
              {i === 3 && images.length > 4 && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-xl font-bold">
                  +{images.length - 4}
                </div>
              )}
            </div>
          )
        })}
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
