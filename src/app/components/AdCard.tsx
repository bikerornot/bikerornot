'use client'

import { useState, useRef, useEffect } from 'react'
import { getImageUrl } from '@/lib/supabase/image'
import { recordImpression, dismissAd } from '@/app/actions/ads'
import type { AdData } from '@/app/actions/ads'

interface Props {
  ad: AdData
  onDismiss?: () => void
  preview?: boolean
}

export default function AdCard({ ad, onDismiss, preview }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [impressionRecorded, setImpressionRecorded] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Impression tracking: fire once when 50%+ visible for 1 second
  useEffect(() => {
    if (impressionRecorded) return
    const el = cardRef.current
    if (!el) return

    let timer: ReturnType<typeof setTimeout> | null = null

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          timer = setTimeout(() => {
            setImpressionRecorded(true)
            recordImpression(ad.id)
          }, 1000)
        } else if (timer) {
          clearTimeout(timer)
          timer = null
        }
      },
      { threshold: 0.5 }
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (timer) clearTimeout(timer)
    }
  }, [ad.id, impressionRecorded])

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleDismiss() {
    setMenuOpen(false)
    setDismissed(true)
    await dismissAd(ad.id)
    onDismiss?.()
  }

  if (dismissed) return null

  // If imageUrl is already a full URL (blob: or https:), use it directly; otherwise build storage URL
  const imageUrl = ad.imageUrl.startsWith('blob:') || ad.imageUrl.startsWith('http')
    ? ad.imageUrl
    : getImageUrl('ads', ad.imageUrl)
  const clickUrl = `/api/ads/click?ad=${encodeURIComponent(ad.id)}&dest=${encodeURIComponent(ad.destinationUrl)}`

  return (
    <div ref={cardRef} className="bg-zinc-900 sm:rounded-xl sm:border sm:border-zinc-800 overflow-hidden">
      {/* Advertiser name + Sponsored label + menu */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="leading-tight">
          {ad.advertiserName && <p className="text-white text-sm font-semibold">{ad.advertiserName}</p>}
          <span className="text-[11px] text-zinc-500 font-medium">Sponsored</span>
        </div>
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors px-1 py-0.5 rounded text-sm leading-none"
            aria-label="Ad options"
          >
            •••
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-40 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-50 overflow-hidden">
              <button
                onClick={handleDismiss}
                className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                Not interested
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Primary text (above image) */}
      {ad.primaryText && (
        <div className="px-4 pt-1.5 pb-2 text-zinc-200 text-base leading-relaxed">
          {ad.primaryText.split(/\n\s*\n/).map((para, i) => (
            <p key={i} className={`whitespace-pre-wrap ${i > 0 ? 'mt-1.5' : ''}`}>{para}</p>
          ))}
        </div>
      )}

      {/* Image */}
      {imageUrl ? (
        <a href={clickUrl} {...(preview ? { target: '_blank' } : {})} rel="noopener noreferrer">
          <div className="flex justify-center bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={ad.headline}
              className="max-w-full h-auto"
            />
          </div>
        </a>
      ) : (
        <div className="flex items-center justify-center bg-zinc-800 h-48">
          <p className="text-zinc-500 text-sm">No image selected</p>
        </div>
      )}

      {/* Headline + description + CTA (below image) */}
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white font-semibold text-base">{ad.headline}</p>
          {ad.description && <p className="text-zinc-400 text-sm mt-0.5">{ad.description}</p>}
        </div>
        <a
          href={clickUrl}
          {...(preview ? { target: '_blank' } : {})}
          rel="noopener noreferrer"
          className="flex-shrink-0 bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors"
        >
          {ad.ctaText}
        </a>
      </div>
    </div>
  )
}
