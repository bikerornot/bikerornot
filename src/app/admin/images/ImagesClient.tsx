'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  getPostImages,
  getAvatarImages,
  approvePostImages,
  approveAvatars,
  removePostImages,
  removeAvatars,
  type AdminImage,
} from '@/app/actions/images'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

function imgUrl(type: 'post' | 'avatar', path: string) {
  const bucket = type === 'post' ? 'posts' : 'avatars'
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
}

type TabType = 'post' | 'avatar'

interface Props {
  initialPostImages: AdminImage[]
  initialAvatars: AdminImage[]
  hasMorePosts: boolean
  hasMoreAvatars: boolean
  postQueueTotal: number
  avatarQueueTotal: number
}

export default function ImagesClient({
  initialPostImages,
  initialAvatars,
  hasMorePosts,
  hasMoreAvatars,
  postQueueTotal,
  avatarQueueTotal,
}: Props) {
  const [tab, setTab] = useState<TabType>('post')

  const [postImages, setPostImages] = useState(initialPostImages)
  const [avatars, setAvatars] = useState(initialAvatars)
  const [postPage, setPostPage] = useState(1)
  const [avatarPage, setAvatarPage] = useState(1)
  const [hasMorePost, setHasMorePost] = useState(hasMorePosts)
  const [hasMoreAvatar, setHasMoreAvatar] = useState(hasMoreAvatars)
  const [postTotal, setPostTotal] = useState(postQueueTotal)
  const [avatarTotal, setAvatarTotal] = useState(avatarQueueTotal)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const images = tab === 'post' ? postImages : avatars
  const hasMore = tab === 'post' ? hasMorePost : hasMoreAvatar
  const queueTotal = tab === 'post' ? postTotal : avatarTotal

  function switchTab(t: TabType) {
    setTab(t)
    setSelected(new Set())
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === images.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(images.map((i) => i.id)))
    }
  }

  function clearFromList(ids: string[], countChange: number) {
    if (tab === 'post') {
      setPostImages((prev) => prev.filter((i) => !ids.includes(i.id)))
      setPostTotal((prev) => Math.max(0, prev - countChange))
    } else {
      setAvatars((prev) => prev.filter((i) => !ids.includes(i.id)))
      setAvatarTotal((prev) => Math.max(0, prev - countChange))
    }
    setSelected((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.delete(id))
      return next
    })
  }

  async function loadMore() {
    setLoadingMore(true)
    try {
      if (tab === 'post') {
        const next = postPage + 1
        const { images: more, hasMore: moreAvail, queueTotal: newTotal } = await getPostImages(next)
        setPostImages((prev) => [...prev, ...more])
        setPostPage(next)
        setHasMorePost(moreAvail)
        setPostTotal(newTotal)
      } else {
        const next = avatarPage + 1
        const { images: more, hasMore: moreAvail, queueTotal: newTotal } = await getAvatarImages(next)
        setAvatars((prev) => [...prev, ...more])
        setAvatarPage(next)
        setHasMoreAvatar(moreAvail)
        setAvatarTotal(newTotal)
      }
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleApprove(ids: string[]) {
    const toApprove = images.filter((i) => ids.includes(i.id))
    setBusy(true)
    try {
      if (tab === 'post') {
        await approvePostImages(toApprove.map((i) => i.id))
      } else {
        await approveAvatars(toApprove.map((i) => i.author_id!))
      }
      clearFromList(ids, ids.length)
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(ids: string[]) {
    const toRemove = images.filter((i) => ids.includes(i.id))
    setBusy(true)
    try {
      if (tab === 'post') {
        await removePostImages(toRemove.map((i) => ({ imageId: i.id, storagePath: i.storage_path })))
      } else {
        await removeAvatars(toRemove.map((i) => ({ userId: i.author_id!, storagePath: i.storage_path })))
      }
      clearFromList(ids, ids.length)
    } finally {
      setBusy(false)
    }
  }

  const TABS: { key: TabType; label: string; total: number }[] = [
    { key: 'post', label: 'Post Images', total: postTotal },
    { key: 'avatar', label: 'Profile Photos', total: avatarTotal },
  ]

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === t.key
                ? 'bg-orange-500 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
            }`}
          >
            {t.label}
            {t.total > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full leading-none ${
                tab === t.key ? 'bg-white/20 text-white' : 'bg-zinc-700 text-zinc-400'
              }`}>
                {t.total}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-30 flex items-center gap-3 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 shadow-xl">
          <span className="text-zinc-300 text-sm font-medium flex-1">
            {selected.size} selected
          </span>
          <button
            onClick={() => setSelected(new Set())}
            className="text-zinc-500 hover:text-white text-xs transition-colors"
          >
            Clear
          </button>
          <button
            onClick={() => handleApprove(Array.from(selected))}
            disabled={busy}
            className="bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 text-emerald-400 text-xs font-semibold px-4 py-2 rounded-lg transition-colors border border-emerald-500/30"
          >
            {busy ? 'Working…' : 'Approve Selected'}
          </button>
          <button
            onClick={() => handleRemove(Array.from(selected))}
            disabled={busy}
            className="bg-red-900/40 hover:bg-red-900/60 disabled:opacity-40 text-red-400 text-xs font-semibold px-4 py-2 rounded-lg transition-colors border border-red-800/50"
          >
            {busy ? 'Working…' : 'Remove Selected'}
          </button>
        </div>
      )}

      {/* Select all */}
      {images.length > 1 && (
        <button
          onClick={toggleSelectAll}
          className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-xs transition-colors px-1"
        >
          <Checkbox
            checked={selected.size === images.length}
            indeterminate={selected.size > 0 && selected.size < images.length}
          />
          {selected.size === images.length ? 'Deselect all' : `Select all ${images.length} loaded`}
        </button>
      )}

      {/* Grid */}
      {images.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-zinc-500 text-sm">Queue is empty — all {tab === 'post' ? 'post images' : 'profile photos'} reviewed</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {images.map((img) => (
            <ImageCard
              key={img.id}
              image={img}
              isSelected={selected.has(img.id)}
              onToggle={() => toggleSelect(img.id)}
              onApprove={() => handleApprove([img.id])}
              onRemove={() => handleRemove([img.id])}
              busy={busy}
            />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="text-center pt-2">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}

function Checkbox({ checked, indeterminate }: { checked: boolean; indeterminate?: boolean }) {
  return (
    <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
      checked || indeterminate ? 'bg-orange-500 border-orange-500' : 'border-zinc-600 bg-transparent'
    }`}>
      {checked && (
        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
          <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {!checked && indeterminate && <div className="w-2 h-0.5 bg-white rounded-full" />}
    </div>
  )
}

function ImageCard({
  image,
  isSelected,
  onToggle,
  onApprove,
  onRemove,
  busy,
}: {
  image: AdminImage
  isSelected: boolean
  onToggle: () => void
  onApprove: () => void
  onRemove: () => void
  busy: boolean
}) {
  const url = imgUrl(image.type, image.storage_path)
  const adminUserUrl = image.author_id ? `/admin/users/${image.author_id}` : null

  return (
    <div className={`group rounded-xl overflow-hidden border transition-colors ${
      isSelected ? 'border-orange-500' : 'border-zinc-800'
    }`}>
      {/* Thumbnail */}
      <div className="relative aspect-square bg-zinc-800">
        <a href={url} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
          <Image
            src={url}
            alt=""
            fill
            className="object-cover hover:opacity-90 transition-opacity"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          />
        </a>

        {/* Checkbox overlay */}
        <button
          onClick={onToggle}
          className={`absolute top-2 left-2 transition-opacity ${
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          aria-label="Select"
        >
          <Checkbox checked={isSelected} />
        </button>
      </div>

      {/* Footer */}
      <div className="bg-zinc-900 px-2.5 pt-2 pb-2.5 space-y-2">
        {adminUserUrl ? (
          <Link
            href={adminUserUrl}
            className="text-zinc-500 hover:text-orange-400 text-xs truncate block transition-colors"
          >
            @{image.author_username ?? 'unknown'}
          </Link>
        ) : (
          <span className="text-zinc-600 text-xs truncate block">unknown</span>
        )}

        <div className="flex gap-1.5">
          <button
            onClick={onApprove}
            disabled={busy}
            className="flex-1 bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 text-emerald-400 text-xs font-semibold py-1 rounded-lg transition-colors"
          >
            ✓ Approve
          </button>
          <button
            onClick={onRemove}
            disabled={busy}
            className="flex-1 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 text-red-400 text-xs font-semibold py-1 rounded-lg transition-colors"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  )
}
