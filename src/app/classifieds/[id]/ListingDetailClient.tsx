'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { getImageUrl } from '@/lib/supabase/image'
import { saveListing, unsaveListing, sendListingInquiry } from '@/app/actions/classifieds'
import VerifiedBadge from '@/app/components/VerifiedBadge'
import ContentMenu from '@/app/components/ContentMenu'
import { LISTING_CONDITIONS, type ListingDetail } from '@/lib/supabase/types'

interface Props {
  listing: ListingDetail
  currentUserId: string | null
}

function formatPrice(price: number | null, priceType: string): string {
  if (price === null) return 'Contact for Price'
  const formatted = price.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  if (priceType === 'obo') return `${formatted} OBO`
  if (priceType === 'offer') return 'Make an Offer'
  return formatted
}

function formatMileage(mileage: number | null): string {
  if (mileage === null) return 'N/A'
  return mileage.toLocaleString('en-US') + ' mi'
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return raw
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const days = Math.floor((now - then) / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  if (months === 1) return '1 month ago'
  return `${months} months ago`
}

export default function ListingDetailClient({ listing, currentUserId }: Props) {
  const [saved, setSaved] = useState(listing.is_saved)
  const [savingInFlight, setSavingInFlight] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [activeImage, setActiveImage] = useState(0)
  const [shareMsg, setShareMsg] = useState<string | null>(null)
  const [showInquiry, setShowInquiry] = useState(false)
  const [inquiryText, setInquiryText] = useState('')
  const [sendingInquiry, setSendingInquiry] = useState(false)
  const [inquirySent, setInquirySent] = useState(false)
  const [inquiryError, setInquiryError] = useState<string | null>(null)

  const images = listing.images.sort((a, b) => a.order_index - b.order_index)
  const hasImages = images.length > 0
  const isOwn = listing.is_own_listing

  const priceColor = listing.price_type === 'obo' ? 'text-green-400' : 'text-orange-400'

  const sellerAvatarUrl = listing.seller_photo
    ? getImageUrl('avatars', listing.seller_photo)
    : null

  const memberSinceYear = new Date(listing.seller_member_since).getFullYear()

  // Save / unsave
  const toggleSave = useCallback(async () => {
    if (!currentUserId || savingInFlight) return
    setSavingInFlight(true)
    const wasSaved = saved
    setSaved(!wasSaved) // optimistic
    try {
      if (wasSaved) {
        await unsaveListing(listing.id)
      } else {
        await saveListing(listing.id)
      }
    } catch {
      setSaved(wasSaved) // revert
    } finally {
      setSavingInFlight(false)
    }
  }, [currentUserId, saved, savingInFlight, listing.id])

  // Share
  const handleShare = useCallback(async () => {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title: listing.title, url })
        return
      } catch {
        // cancelled or unsupported, fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setShareMsg('Link copied!')
      setTimeout(() => setShareMsg(null), 2000)
    } catch {
      // ignore
    }
  }, [listing.title])

  // Send inquiry
  const handleSendInquiry = useCallback(async () => {
    if (!inquiryText.trim() || sendingInquiry) return
    setSendingInquiry(true)
    setInquiryError(null)
    try {
      await sendListingInquiry(listing.id, inquiryText)
      setInquirySent(true)
      setInquiryText('')
    } catch (err) {
      setInquiryError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setSendingInquiry(false)
    }
  }, [listing.id, inquiryText, sendingInquiry])

  // Lightbox navigation
  const lightboxPrev = () => setActiveImage((i) => (i - 1 + images.length) % images.length)
  const lightboxNext = () => setActiveImage((i) => (i + 1) % images.length)

  return (
    <div>
      {/* Back link */}
      <Link
        href="/classifieds"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-orange-400 transition-colors mb-4"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to listings
      </Link>

      {/* Hero Image */}
      <div className="relative mb-2">
        {hasImages ? (
          <button
            onClick={() => { setActiveImage(0); setLightboxOpen(true) }}
            className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-zinc-900 cursor-pointer group"
          >
            <Image
              src={getImageUrl('classifieds', images[activeImage].storage_path)}
              alt={listing.title}
              fill
              className="object-cover group-hover:scale-[1.02] transition-transform duration-300"
              sizes="(max-width: 768px) 100vw, 896px"
              priority
            />
            {/* Image counter */}
            {images.length > 1 && (
              <span className="absolute bottom-3 right-3 bg-black/70 text-white text-xs font-medium px-2.5 py-1 rounded-full">
                {activeImage + 1} / {images.length}
              </span>
            )}
            {/* SOLD banner */}
            {listing.status === 'sold' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-red-600/90 text-white text-3xl font-black tracking-widest px-12 py-3 -rotate-12 shadow-xl">
                  SOLD
                </div>
              </div>
            )}
          </button>
        ) : (
          <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-zinc-900 flex items-center justify-center">
            <svg className="w-16 h-16 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {listing.status === 'sold' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-red-600/90 text-white text-3xl font-black tracking-widest px-12 py-3 -rotate-12 shadow-xl">
                  SOLD
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          {images.map((img, idx) => (
            <button
              key={img.id}
              onClick={() => setActiveImage(idx)}
              className={`relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                idx === activeImage ? 'border-orange-500' : 'border-zinc-700 hover:border-zinc-500'
              }`}
            >
              <Image
                src={getImageUrl('classifieds', img.storage_path)}
                alt={`Photo ${idx + 1}`}
                fill
                className="object-cover"
                sizes="64px"
              />
            </button>
          ))}
        </div>
      )}

      {/* Title, Price, Bike Info */}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-white leading-tight">{listing.title}</h1>
        <div className="flex items-center gap-2 mt-1.5">
          <p className={`text-xl font-bold ${priceColor}`}>
            {formatPrice(listing.price, listing.price_type)}
          </p>
          {listing.trade_considered && (
            <span className="text-xs font-medium bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
              Open to Trades
            </span>
          )}
        </div>
        <p className="text-sm text-zinc-400 mt-1">
          {listing.year} {listing.make} {listing.model}{listing.trim ? ` ${listing.trim}` : ''}
        </p>
        {(listing.city || listing.state) && (
          <div className="flex items-center gap-1.5 text-sm text-zinc-500 mt-1">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>{[listing.city, listing.state].filter(Boolean).join(', ')}</span>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-3 mb-6">
        {currentUserId && !isOwn && (
          <button
            onClick={toggleSave}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              saved
                ? 'bg-red-500/20 text-red-400'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            <svg className="w-4 h-4" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            {saved ? 'Saved' : 'Save'}
          </button>
        )}

        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          Share
        </button>

        {shareMsg && (
          <span className="text-xs text-green-400 font-medium">{shareMsg}</span>
        )}

        {currentUserId && !isOwn && (
          <ContentMenu
            reportType="listing"
            reportTargetId={listing.id}
            blockUserId={listing.seller_id}
          />
        )}
      </div>

      {/* Spec grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Mileage</p>
          <p className="text-base font-semibold text-white">{formatMileage(listing.mileage)}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Condition</p>
          <p className="text-base font-semibold text-white">{LISTING_CONDITIONS[listing.condition].label}</p>
        </div>
        {listing.color && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Color</p>
            <p className="text-base font-semibold text-white">{listing.color}</p>
          </div>
        )}
        {listing.vin && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">VIN</p>
            <p className="text-base font-semibold text-white font-mono text-sm">{listing.vin}</p>
          </div>
        )}
      </div>

      {/* Description */}
      {listing.description && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">Description</h2>
          <p className="text-base text-zinc-200 whitespace-pre-wrap leading-relaxed">{listing.description}</p>
        </div>
      )}

      {/* Modifications */}
      {listing.modifications && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">Modifications</h2>
          <p className="text-base text-zinc-200 whitespace-pre-wrap">{listing.modifications}</p>
        </div>
      )}

      {/* Listing meta */}
      <div className="flex items-center gap-4 text-xs text-zinc-500 mb-6">
        {listing.published_at && (
          <span>Posted {timeAgo(listing.published_at)}</span>
        )}
        <span>{listing.view_count.toLocaleString()} views</span>
        <span>{listing.save_count.toLocaleString()} saves</span>
      </div>

      {/* Seller card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Seller</h2>
        <div className="flex items-center gap-3 mb-3">
          {sellerAvatarUrl ? (
            <Image
              src={sellerAvatarUrl}
              alt={listing.seller_username}
              width={48}
              height={48}
              className="w-12 h-12 rounded-full object-cover bg-zinc-800"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-zinc-700 flex items-center justify-center text-lg font-bold text-zinc-300">
              {listing.seller_first_name[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Link
                href={`/profile/${listing.seller_username}`}
                className="text-base font-semibold text-white hover:text-orange-400 transition-colors truncate"
              >
                {listing.seller_username}
              </Link>
              {listing.seller_verified && <VerifiedBadge />}
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
              <span>Member since {memberSinceYear}</span>
              {listing.seller_listings_sold > 0 && (
                <>
                  <span className="text-zinc-700">|</span>
                  <span>{listing.seller_listings_sold} sold</span>
                </>
              )}
              {listing.mutual_friend_count > 0 && (
                <>
                  <span className="text-zinc-700">|</span>
                  <span>{listing.mutual_friend_count} mutual {listing.mutual_friend_count === 1 ? 'friend' : 'friends'}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Seller phone */}
        {listing.seller_phone && (
          <div className="flex items-center gap-2 text-sm text-zinc-300 mb-3">
            <svg className="w-4 h-4 text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <a href={`tel:${listing.seller_phone}`} className="hover:text-orange-400 transition-colors">
              {formatPhone(listing.seller_phone)}
            </a>
          </div>
        )}

        {/* CTA */}
        {isOwn ? (
          <Link
            href={`/classifieds/${listing.id}/edit`}
            className="block w-full text-center bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
          >
            Edit Listing
          </Link>
        ) : currentUserId ? (
          <div>
            {inquirySent ? (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm px-4 py-3 rounded-xl text-center">
                Message sent! The seller will see it in their inbox.
              </div>
            ) : !showInquiry ? (
              <button
                onClick={() => setShowInquiry(true)}
                className="block w-full text-center bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
              >
                Message Seller
              </button>
            ) : (
              <div className="space-y-3">
                {inquiryError && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl">
                    {inquiryError}
                  </div>
                )}
                <textarea
                  value={inquiryText}
                  onChange={e => setInquiryText(e.target.value)}
                  placeholder="Ask about this listing..."
                  maxLength={2000}
                  rows={3}
                  autoFocus
                  className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-orange-500 transition-colors resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowInquiry(false); setInquiryText(''); setInquiryError(null) }}
                    className="flex-1 text-center bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-semibold py-2.5 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendInquiry}
                    disabled={!inquiryText.trim() || sendingInquiry}
                    className="flex-1 text-center bg-orange-500 hover:bg-orange-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
                  >
                    {sendingInquiry ? 'Sending...' : 'Send Message'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <Link
            href="/login"
            className="block w-full text-center bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
          >
            Log In to Contact Seller
          </Link>
        )}
      </div>

      {/* Lightbox */}
      {lightboxOpen && hasImages && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) setLightboxOpen(false) }}
        >
          {/* Close button */}
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 text-white/70 hover:text-white z-10 p-2"
            aria-label="Close lightbox"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Counter */}
          <div className="absolute top-4 left-4 text-white/70 text-sm font-medium z-10">
            {activeImage + 1} / {images.length}
          </div>

          {/* Previous */}
          {images.length > 1 && (
            <button
              onClick={lightboxPrev}
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2 z-10"
              aria-label="Previous image"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {/* Image */}
          <div className="relative w-full h-full max-w-5xl max-h-[85vh] mx-12 sm:mx-20 flex items-center justify-center">
            <Image
              src={getImageUrl('classifieds', images[activeImage].storage_path)}
              alt={`${listing.title} - Photo ${activeImage + 1}`}
              fill
              className="object-contain"
              sizes="100vw"
            />
          </div>

          {/* Next */}
          {images.length > 1 && (
            <button
              onClick={lightboxNext}
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2 z-10"
              aria-label="Next image"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
