'use client'

import { useState } from 'react'
import Image from 'next/image'

export default function AvatarPreview({
  avatarUrl,
  firstName,
}: {
  avatarUrl: string | null
  firstName?: string | null
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="relative flex-shrink-0 cursor-zoom-in"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="w-14 h-14 rounded-full bg-zinc-700 overflow-hidden">
        {avatarUrl ? (
          <Image src={avatarUrl} alt="" width={56} height={56} className="object-cover w-full h-full" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold text-lg">
            {firstName?.[0]?.toUpperCase() ?? '?'}
          </div>
        )}
      </div>
      {avatarUrl && hovered && (
        <div className="absolute left-16 top-0 z-50 pointer-events-none">
          <Image
            src={avatarUrl}
            alt=""
            width={500}
            height={500}
            className="rounded-xl object-cover shadow-2xl ring-1 ring-zinc-700"
          />
        </div>
      )}
    </div>
  )
}
