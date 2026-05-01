'use client'

import Image from 'next/image'
import Link from 'next/link'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
function avatarUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}`
}

interface Props {
  username: string | null
  firstName?: string | null
  profilePhotoUrl: string | null
  /** Optional href — when set, the avatar becomes a link */
  href?: string | null
  /** Visible avatar size in px. Default 56. */
  size?: number
  /** Outer ring class — overrideable (e.g. red ring for flagged) */
  ringClass?: string
  /** Class for the hover preview ring */
  previewRingClass?: string
}

/**
 * Standardized admin user avatar with a 256px hover-enlarge preview floating
 * to the right. Used on Reports, AI Flags, and Watchlist queues so a VA can
 * spot fake / stock / underage faces at a glance without leaving the row.
 */
export function UserAvatarWithPreview({
  username,
  firstName,
  profilePhotoUrl,
  href,
  size = 56,
  ringClass = 'ring-1 ring-zinc-700',
  previewRingClass = 'ring-2 ring-orange-500/60',
}: Props) {
  const url = profilePhotoUrl ? avatarUrl(profilePhotoUrl) : null
  const initial = (firstName?.[0] ?? username?.[0] ?? '?').toUpperCase()

  const inner = (
    <div className="relative group flex-shrink-0">
      <div
        className={`rounded-full bg-zinc-800 overflow-hidden ${ringClass}`}
        style={{ width: size, height: size }}
      >
        {url ? (
          <Image src={url} alt={username ?? ''} width={size} height={size} className="object-cover w-full h-full" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold" style={{ fontSize: size * 0.36 }}>
            {initial}
          </div>
        )}
      </div>
      {url && (
        <div className="hidden group-hover:block absolute z-40 left-full top-0 ml-3 pointer-events-none">
          <div className={`w-64 h-64 rounded-xl overflow-hidden shadow-2xl bg-zinc-900 ${previewRingClass}`}>
            <Image src={url} alt={username ?? ''} width={256} height={256} className="object-cover w-full h-full" />
          </div>
        </div>
      )}
    </div>
  )

  return href ? <Link href={href}>{inner}</Link> : inner
}
