'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'

export default function AvatarPreview({
  avatarUrl,
  firstName,
}: {
  avatarUrl: string | null
  firstName?: string | null
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  function handleMouseEnter() {
    if (!ref.current || !avatarUrl) return
    const rect = ref.current.getBoundingClientRect()
    setPos({ top: rect.top, left: rect.right + 12 })
  }

  function handleMouseLeave() {
    setPos(null)
  }

  return (
    <>
      <div
        ref={ref}
        className="flex-shrink-0 cursor-zoom-in"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
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
      </div>

      {avatarUrl && pos && (
        <div
          className="fixed pointer-events-none rounded-xl overflow-hidden shadow-2xl ring-1 ring-zinc-700"
          style={{ top: pos.top, left: pos.left, zIndex: 9999 }}
        >
          <Image src={avatarUrl} alt="" width={500} height={500} className="object-cover block" />
        </div>
      )}
    </>
  )
}
