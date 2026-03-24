'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { markAsSold, deleteListing, renewListing, deactivateListing, reactivateListing } from '@/app/actions/classifieds'
import { type MyListing } from '@/lib/supabase/types'
import { getImageUrl } from '@/lib/supabase/image'

type Tab = 'active' | 'inactive' | 'sold' | 'expired' | 'draft'

interface Props {
  initialListings: MyListing[]
}

function formatPrice(dollars: number | null, priceType: string): string {
  if (dollars === null) return 'Contact for Price'
  const formatted = dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  if (priceType === 'obo') return `${formatted} OBO`
  return formatted
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: 'bg-green-500/20 text-green-400',
    inactive: 'bg-blue-500/20 text-blue-400',
    sold: 'bg-red-500/20 text-red-400',
    expired: 'bg-yellow-500/20 text-yellow-400',
    draft: 'bg-zinc-700/50 text-zinc-400',
  }
  return map[status] ?? 'bg-zinc-700/50 text-zinc-400'
}

export default function MyListingsClient({ initialListings }: Props) {
  const [listings, setListings] = useState<MyListing[]>(initialListings)
  const [tab, setTab] = useState<Tab>('active')
  const [pendingAction, setPendingAction] = useState<Set<string>>(new Set())
  const [confirmModal, setConfirmModal] = useState<{ type: 'sold' | 'delete' | 'deactivate'; listingId: string; title: string } | null>(null)

  const filtered = useMemo(() => {
    return listings.filter((l) => l.status === tab)
  }, [listings, tab])

  const counts = useMemo(() => {
    const c = { active: 0, inactive: 0, sold: 0, expired: 0, draft: 0 }
    for (const l of listings) {
      if (l.status in c) c[l.status as Tab]++
    }
    return c
  }, [listings])

  // Aggregate stats for active tab
  const activeStats = useMemo(() => {
    const active = listings.filter((l) => l.status === 'active')
    const totalViews = active.reduce((sum, l) => sum + l.view_count, 0)
    const totalSaves = active.reduce((sum, l) => sum + l.save_count, 0)
    let daysUntilExpiry: number | null = null
    for (const l of active) {
      if (l.expires_at) {
        const days = Math.ceil((new Date(l.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        if (daysUntilExpiry === null || days < daysUntilExpiry) {
          daysUntilExpiry = days
        }
      }
    }
    return { totalViews, totalSaves, daysUntilExpiry }
  }, [listings])

  async function handleMarkSold(listingId: string) {
    if (pendingAction.has(listingId)) return
    setPendingAction((p) => new Set(p).add(listingId))
    try {
      await markAsSold(listingId)
      setListings((prev) =>
        prev.map((l) => (l.id === listingId ? { ...l, status: 'sold' as const, sold_at: new Date().toISOString() } : l))
      )
    } catch (err) {
      console.error('Failed to mark as sold:', err)
    } finally {
      setPendingAction((p) => {
        const next = new Set(p)
        next.delete(listingId)
        return next
      })
      setConfirmModal(null)
    }
  }

  async function handleDelete(listingId: string) {
    if (pendingAction.has(listingId)) return
    setPendingAction((p) => new Set(p).add(listingId))
    try {
      await deleteListing(listingId)
      setListings((prev) => prev.filter((l) => l.id !== listingId))
    } catch (err) {
      console.error('Failed to delete listing:', err)
    } finally {
      setPendingAction((p) => {
        const next = new Set(p)
        next.delete(listingId)
        return next
      })
      setConfirmModal(null)
    }
  }

  async function handleRenew(listingId: string) {
    if (pendingAction.has(listingId)) return
    setPendingAction((p) => new Set(p).add(listingId))
    try {
      await renewListing(listingId)
      setListings((prev) =>
        prev.map((l) => (l.id === listingId ? { ...l, status: 'active' as const, expires_at: null } : l))
      )
    } catch (err) {
      console.error('Failed to renew listing:', err)
    } finally {
      setPendingAction((p) => {
        const next = new Set(p)
        next.delete(listingId)
        return next
      })
    }
  }

  async function handleDeactivate(listingId: string) {
    if (pendingAction.has(listingId)) return
    setPendingAction((p) => new Set(p).add(listingId))
    try {
      await deactivateListing(listingId)
      setListings((prev) =>
        prev.map((l) => (l.id === listingId ? { ...l, status: 'inactive' as const } : l))
      )
    } catch (err) {
      console.error('Failed to deactivate listing:', err)
    } finally {
      setPendingAction((p) => {
        const next = new Set(p)
        next.delete(listingId)
        return next
      })
      setConfirmModal(null)
    }
  }

  async function handleReactivate(listingId: string) {
    if (pendingAction.has(listingId)) return
    setPendingAction((p) => new Set(p).add(listingId))
    try {
      await reactivateListing(listingId)
      setListings((prev) =>
        prev.map((l) => (l.id === listingId ? { ...l, status: 'active' as const } : l))
      )
    } catch (err) {
      console.error('Failed to reactivate listing:', err)
    } finally {
      setPendingAction((p) => {
        const next = new Set(p)
        next.delete(listingId)
        return next
      })
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'active', label: 'Active' },
    { key: 'inactive', label: 'Inactive' },
    { key: 'sold', label: 'Sold' },
    { key: 'expired', label: 'Expired' },
    { key: 'draft', label: 'Drafts' },
  ]

  const emptyMessages: Record<Tab, { text: string; cta?: string; href?: string }> = {
    active: { text: 'No active listings.', cta: 'List your bike!', href: '/classifieds/new' },
    inactive: { text: 'No inactive listings.' },
    sold: { text: 'No sold listings yet.' },
    expired: { text: 'No expired listings.' },
    draft: { text: 'No drafts saved.' },
  }

  return (
    <div>
      {/* Tab pills */}
      <div className="flex gap-1 mb-6 bg-zinc-900 rounded-xl p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-orange-500 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>

      {/* Aggregate stats bar (active tab only) */}
      {tab === 'active' && counts.active > 0 && (
        <div className="flex gap-6 mb-4 px-3 py-2.5 bg-zinc-900 rounded-xl border border-zinc-800">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span className="text-white font-medium">{activeStats.totalViews}</span> views
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <span className="text-white font-medium">{activeStats.totalSaves}</span> saves
          </div>
          {activeStats.daysUntilExpiry !== null && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-white font-medium">{activeStats.daysUntilExpiry}</span> {activeStats.daysUntilExpiry === 1 ? 'day' : 'days'} until next expiry
            </div>
          )}
        </div>
      )}

      {/* Listing rows */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-zinc-500 text-base">{emptyMessages[tab].text}</p>
          {emptyMessages[tab].cta && emptyMessages[tab].href && (
            <Link
              href={emptyMessages[tab].href!}
              className="inline-block mt-3 text-orange-400 hover:text-orange-300 text-sm font-medium transition-colors"
            >
              {emptyMessages[tab].cta}
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((listing) => (
            <ListingRow
              key={listing.id}
              listing={listing}
              pending={pendingAction.has(listing.id)}
              onMarkSold={() => setConfirmModal({ type: 'sold', listingId: listing.id, title: listing.title })}
              onDeactivate={() => setConfirmModal({ type: 'deactivate', listingId: listing.id, title: listing.title })}
              onReactivate={() => handleReactivate(listing.id)}
              onDelete={() => setConfirmModal({ type: 'delete', listingId: listing.id, title: listing.title })}
              onRenew={() => handleRenew(listing.id)}
            />
          ))}
        </div>
      )}

      {/* Confirm modal */}
      {confirmModal && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
          <div className="fixed inset-0 bg-black/60" onClick={() => setConfirmModal(null)} />
          <div className="relative bg-zinc-900 rounded-2xl border border-zinc-800 p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-white mb-2">
              {confirmModal.type === 'sold' ? 'Mark as Sold?' : confirmModal.type === 'deactivate' ? 'Deactivate Listing?' : 'Delete Listing?'}
            </h3>
            <p className="text-sm text-zinc-400 mb-6">
              {confirmModal.type === 'sold'
                ? `Mark "${confirmModal.title}" as sold? This will remove it from search results.`
                : confirmModal.type === 'deactivate'
                  ? `Deactivate "${confirmModal.title}"? It will be hidden from search but you can reactivate it anytime. Your remaining time will be preserved.`
                  : `Permanently delete "${confirmModal.title}"? This cannot be undone.`}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  confirmModal.type === 'sold'
                    ? handleMarkSold(confirmModal.listingId)
                    : confirmModal.type === 'deactivate'
                      ? handleDeactivate(confirmModal.listingId)
                      : handleDelete(confirmModal.listingId)
                }
                disabled={pendingAction.has(confirmModal.listingId)}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 ${
                  confirmModal.type === 'sold'
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : confirmModal.type === 'deactivate'
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                {pendingAction.has(confirmModal.listingId)
                  ? 'Processing...'
                  : confirmModal.type === 'sold'
                    ? 'Mark as Sold'
                    : confirmModal.type === 'deactivate'
                      ? 'Deactivate'
                      : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ListingRow({
  listing,
  pending,
  onMarkSold,
  onDeactivate,
  onReactivate,
  onDelete,
  onRenew,
}: {
  listing: MyListing
  pending: boolean
  onMarkSold: () => void
  onDeactivate: () => void
  onReactivate: () => void
  onDelete: () => void
  onRenew: () => void
}) {
  const coverImage = listing.images?.[0]
  const coverUrl = coverImage
    ? getImageUrl('classifieds', coverImage.storage_path)
    : null

  const subtitle = [listing.year, listing.make, listing.model].filter(Boolean).join(' ')

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-3 flex gap-3 items-start">
      {/* Thumbnail */}
      <div className="relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-zinc-800">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={listing.title}
            fill
            className="object-cover"
            sizes="64px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white truncate">{listing.title}</h3>
            <p className="text-xs text-zinc-500 truncate">{subtitle}</p>
          </div>
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${statusBadge(listing.status)}`}>
            {listing.status}
          </span>
        </div>

        {/* Price + stats row */}
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-sm font-bold text-orange-400">
            {formatPrice(listing.price, listing.price_type)}
          </span>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              {listing.view_count}
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              {listing.save_count}
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {listing.message_count}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-2">
          {listing.status === 'active' && (
            <>
              <Link
                href={`/classifieds/${listing.id}/edit`}
                className="text-xs text-zinc-400 hover:text-white px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                Edit
              </Link>
              <button
                onClick={onDeactivate}
                disabled={pending}
                className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded-md bg-blue-500/10 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
              >
                Deactivate
              </button>
              <button
                onClick={onMarkSold}
                disabled={pending}
                className="text-xs text-green-400 hover:text-green-300 px-2 py-1 rounded-md bg-green-500/10 hover:bg-green-500/20 transition-colors disabled:opacity-50"
              >
                Mark as Sold
              </button>
              <button
                onClick={onDelete}
                disabled={pending}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                Delete
              </button>
            </>
          )}
          {listing.status === 'inactive' && (
            <>
              <button
                onClick={onReactivate}
                disabled={pending}
                className="text-xs text-orange-400 hover:text-orange-300 px-2 py-1 rounded-md bg-orange-500/10 hover:bg-orange-500/20 transition-colors disabled:opacity-50"
              >
                {pending ? 'Reactivating...' : 'Reactivate'}
              </button>
              <button
                onClick={onMarkSold}
                disabled={pending}
                className="text-xs text-green-400 hover:text-green-300 px-2 py-1 rounded-md bg-green-500/10 hover:bg-green-500/20 transition-colors disabled:opacity-50"
              >
                Mark as Sold
              </button>
              <button
                onClick={onDelete}
                disabled={pending}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                Delete
              </button>
            </>
          )}
          {listing.status === 'expired' && (
            <>
              <button
                onClick={onRenew}
                disabled={pending}
                className="text-xs text-orange-400 hover:text-orange-300 px-2 py-1 rounded-md bg-orange-500/10 hover:bg-orange-500/20 transition-colors disabled:opacity-50"
              >
                {pending ? 'Renewing...' : 'Renew'}
              </button>
              <button
                onClick={onDelete}
                disabled={pending}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                Delete
              </button>
            </>
          )}
          {listing.status === 'draft' && (
            <>
              <Link
                href={`/classifieds/${listing.id}/edit`}
                className="text-xs text-orange-400 hover:text-orange-300 px-2 py-1 rounded-md bg-orange-500/10 hover:bg-orange-500/20 transition-colors"
              >
                Edit
              </Link>
              <button
                onClick={onDelete}
                disabled={pending}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                Delete
              </button>
            </>
          )}
          {listing.status === 'sold' && (
            <span className="text-xs text-zinc-600 italic">
              Sold {listing.sold_at ? new Date(listing.sold_at).toLocaleDateString() : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
