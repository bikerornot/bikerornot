'use client'

import { useState } from 'react'
import Link from 'next/link'
import { dismissBanner } from '@/app/actions/banners'
import type { SiteBanner as SiteBannerType } from '@/lib/supabase/types'

interface Props {
  banners: SiteBannerType[]
}

const colorMap: Record<string, { bg: string; text: string; link: string; dismiss: string }> = {
  orange: { bg: 'bg-orange-500', text: 'text-white', link: 'text-white underline font-semibold', dismiss: 'text-white/70 hover:text-white' },
  blue:   { bg: 'bg-blue-600', text: 'text-white', link: 'text-white underline font-semibold', dismiss: 'text-white/70 hover:text-white' },
  green:  { bg: 'bg-emerald-600', text: 'text-white', link: 'text-white underline font-semibold', dismiss: 'text-white/70 hover:text-white' },
  red:    { bg: 'bg-red-600', text: 'text-white', link: 'text-white underline font-semibold', dismiss: 'text-white/70 hover:text-white' },
  yellow: { bg: 'bg-yellow-500', text: 'text-black', link: 'text-black underline font-semibold', dismiss: 'text-black/50 hover:text-black' },
  zinc:   { bg: 'bg-zinc-800', text: 'text-zinc-200', link: 'text-orange-400 font-semibold', dismiss: 'text-zinc-500 hover:text-zinc-300' },
}

export default function SiteBanner({ banners: initialBanners }: Props) {
  const [banners, setBanners] = useState(initialBanners)

  if (banners.length === 0) return null

  async function handleDismiss(bannerId: string) {
    setBanners(prev => prev.filter(b => b.id !== bannerId))
    await dismissBanner(bannerId)
  }

  return (
    <>
      {banners.map(banner => {
        const colors = colorMap[banner.bg_color] ?? colorMap.orange
        return (
          <div key={banner.id} className={`${colors.bg} ${colors.text}`}>
            <div className="max-w-2xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
              <p className="text-sm flex-1">
                {banner.text}
                {banner.link_url && banner.link_text && (
                  <>
                    {' '}
                    <Link href={banner.link_url} className={colors.link}>
                      {banner.link_text}
                    </Link>
                  </>
                )}
              </p>
              {banner.dismissible && (
                <button
                  onClick={() => handleDismiss(banner.id)}
                  className={`flex-shrink-0 transition-colors ${colors.dismiss}`}
                  aria-label="Dismiss"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}
