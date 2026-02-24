'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  getPostImages,
  getAvatarImages,
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
}

export default function ImagesClient({
  initialPostImages,
  initialAvatars,
  hasMorePosts,
  hasMoreAvatars,
}: Props) {
  const [tab, setTab] = useState<TabType>('post')

  const [postImages, setPostImages] = useState(initialPostImages)
  const [avatars, setAvatars] = useState(initialAvatars)
  const [postPage, setPostPage] = useState(1)
  const [avatarPage, setAvatarPage] = useState(1)
  const [hasMorePost, setHasMorePost] = useState(hasMorePosts)
  const [hasMoreAvatar, setHasMoreAvatar] = useState(hasMoreAvatars)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const images = tab === 'post' ? postImages : avatars
  const hasMore = tab === 'post' ? hasMorePost : hasMoreAvatar

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

  async function loadMore() {
    setLoadingMore(true)
    try {
      if (tab === 'post') {
        const next = postPage + 1
        const { images: more, hasMore: moreAvail } = await getPostImages(next)
        setPostImages((prev) => [...prev, ...more])
        setPostPage(next)
        setHasMorePost(moreAvail)
      } else {
        const next = avatarPage + 1
        const { images: more, hasMore: moreAvail } = await getAvatarImages(next)
        setAvatars((prev) => [...prev, ...more])
        setAvatarPage(next)
        setHasMoreAvatar(moreAvail)
      }
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleRemove(ids: string[]) {
    const toRemove = images.filter((i) => ids.includes(i.id))
    setBusy(true)
    try {
      if (tab === 'post') {
        await removePostImages(toRemove.map((i) => ({ imageId: i.id, storagePath: i.storage_path })))
        setPostImages((prev) => prev.filter((i) => !ids.includes(i.id)))
      } else {
        await removeAvatars(toRemove.map((i) => ({ userId: i.author_id!, storagePath: i.storage_path })))
        setAvatars((prev) => prev.filter((i) => !ids.includes(i.id)))
      }
      setSelected((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1.5">
        {(['post', 'avatar'] as const).map((t) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === t
                ? 'bg-orange-500 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
            }`}
          >
            {t === 'post' ? 'Post Images' : 'Profile Photos'}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-30 flex items-center gap-3 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 shadow-xl">
          <span className="text-zinc-300 text-sm font-medium flex-1">
            {selected.size} image{selected.size !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => setSelected(new Set())}
            className="text-zinc-500 hover:text-white text-xs transition-colors"
          >
            Clear
          </button>
          <button
            onClick={() => handleRemove(Array.from(selected))}
            disabled={busy}
            className="bg-red-900/40 hover:bg-red-900/60 disabled:opacity-40 text-red-400 text-xs font-semibold px-4 py-2 rounded-lg transition-colors border border-red-800/50"
          >
            {busy ? 'Removing…' : 'Remove Selected'}
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
        <div className="text-center py-16 text-zinc-600">
          <p className="text-sm">No {tab === 'post' ? 'post images' : 'profile photos'} found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {images.map((img) => (
            <ImageCard
              key={img.id}
              image={img}
              isSelected={selected.has(img.id)}
              onToggle={() => toggleSelect(img.id)}
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
    <div
      className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
        checked || indeterminate ? 'bg-orange-500 border-orange-500' : 'border-zinc-600 bg-transparent'
      }`}
    >
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
  onRemove,
  busy,
}: {
  image: AdminImage
  isSelected: boolean
  onToggle: () => void
  onRemove: () => void
  busy: boolean
}) {
  const url = imgUrl(image.type, image.storage_path)
  const adminUserUrl = image.author_id ? `/admin/users/${image.author_id}` : null

  return (
    <div
      className={`group relative rounded-xl overflow-hidden border transition-colors ${
        isSelected ? 'border-orange-500' : 'border-zinc-800'
      }`}
    >
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

        {/* Checkbox — visible on hover or when selected */}
        <button
          onClick={onToggle}
          className={`absolute top-2 left-2 transition-opacity ${
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          aria-label="Select"
        >
          <Checkbox checked={isSelected} />
        </button>

        {/* Remove button — visible on hover or when selected */}
        <button
          onClick={onRemove}
          disabled={busy}
          className={`absolute top-2 right-2 bg-black/60 hover:bg-red-900/80 disabled:opacity-40 text-white rounded-lg p-1 transition-all ${
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          aria-label="Remove image"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Footer */}
      <div className="bg-zinc-900 px-2.5 py-2">
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
      </div>
    </div>
  )
}
