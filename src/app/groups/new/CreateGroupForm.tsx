'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createGroup } from '@/app/actions/groups'
import { compressImage } from '@/lib/compress'
import { GROUP_CATEGORIES, US_STATES, type GroupCategory } from '@/lib/supabase/types'

export default function CreateGroupForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public')
  const [category, setCategory] = useState<GroupCategory | ''>('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleCoverSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setError(null)
    try {
      const compressed = await compressImage(file, 1, 1920)
      if (compressed.size > 3 * 1024 * 1024) {
        setError('Image is too large. Please choose a smaller file.')
        return
      }
      if (coverPreview) URL.revokeObjectURL(coverPreview)
      setCoverFile(compressed)
      setCoverPreview(URL.createObjectURL(compressed))
    } catch {
      setError('Failed to process image')
    }
  }

  function removeCover() {
    if (coverPreview) URL.revokeObjectURL(coverPreview)
    setCoverFile(null)
    setCoverPreview(null)
  }

  const locationRequired = category === 'local' || category === 'clubs'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    if (locationRequired && (!state || !zipCode.trim())) {
      setError('State and zip code are required for local riding groups and clubs.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const group = await createGroup(name.trim(), description.trim() || null, privacy, coverFile, {
        category: category || null,
        city: city.trim() || null,
        state: state || null,
        zipCode: zipCode.trim() || null,
      })
      router.push(`/groups/${group.slug}?invite=1`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create group')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Cover photo */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">Cover Photo (optional)</label>
        {coverPreview ? (
          <div className="relative h-36 rounded-xl overflow-hidden bg-zinc-800">
            <Image src={coverPreview} alt="Cover preview" fill className="object-cover" />
            <button
              type="button"
              onClick={removeCover}
              className="absolute top-2 right-2 bg-black/70 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm hover:bg-black"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full h-36 rounded-xl border-2 border-dashed border-zinc-700 hover:border-orange-500 text-zinc-500 hover:text-orange-400 transition-colors flex flex-col items-center justify-center gap-2 text-sm"
          >
            <span className="text-2xl">📷</span>
            <span>Click to add cover photo</span>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleCoverSelect}
        />
      </div>

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1.5" htmlFor="name">
          Group Name <span className="text-red-400">*</span>
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. SoCal Cruisers"
          maxLength={80}
          required
          className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
        />
      </div>

      {/* Privacy */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">Privacy</label>
        <div className="flex gap-2">
          {(['public', 'private'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPrivacy(p)}
              className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${
                privacy === p
                  ? 'bg-orange-500 border-orange-500 text-white'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              {p === 'public' ? '🌐 Public' : '🔒 Private'}
            </button>
          ))}
        </div>
        <p className="text-zinc-600 text-sm mt-1.5">
          {privacy === 'public'
            ? 'Anyone can see and join this group instantly.'
            : 'Anyone can see the group, but joining requires approval.'}
        </p>
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1.5" htmlFor="category">
          Category (optional)
        </label>
        <select
          id="category"
          value={category}
          onChange={(e) => setCategory(e.target.value as GroupCategory | '')}
          className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
        >
          <option value="">Select a category...</option>
          {GROUP_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1.5" htmlFor="desc">
          Description (optional)
        </label>
        <textarea
          id="desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's this group about?"
          rows={4}
          maxLength={500}
          className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors resize-none"
        />
      </div>

      {/* Location */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1.5">
          Location {category === 'local' || category === 'clubs' ? <span className="text-red-400">*</span> : <span className="text-zinc-600">(optional)</span>}
        </label>
        {(category === 'local' || category === 'clubs') && (
          <p className="text-zinc-500 text-xs mb-2">State and zip code are required for local riding groups and clubs.</p>
        )}
        <div className="space-y-2">
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City"
            maxLength={100}
            className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
          />
          <div className="flex gap-2">
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="flex-1 bg-zinc-900 border border-zinc-800 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            >
              <option value="">State...</option>
              {US_STATES.map((s) => (
                <option key={s.abbr} value={s.abbr}>{s.name}</option>
              ))}
            </select>
            <input
              type="text"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder="Zip Code"
              inputMode="numeric"
              maxLength={5}
              className="w-28 bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={!name.trim() || submitting || (locationRequired && (!state || !zipCode.trim()))}
        className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl transition-colors"
      >
        {submitting ? 'Creating...' : 'Create Group'}
      </button>
    </form>
  )
}
