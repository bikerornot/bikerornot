'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { updateGroup } from '@/app/actions/groups'
import { compressImage } from '@/lib/compress'
import { GROUP_CATEGORIES, US_STATES, type GroupCategory } from '@/lib/supabase/types'

interface Props {
  groupId: string
  currentDescription: string | null
  currentPrivacy: 'public' | 'private'
  currentCoverUrl: string | null
  currentCategory: GroupCategory | null
  currentCity: string | null
  currentState: string | null
  currentZipCode: string | null
}

export default function EditGroupPanel({
  groupId,
  currentDescription,
  currentPrivacy,
  currentCoverUrl,
  currentCategory,
  currentCity,
  currentState,
  currentZipCode,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState(currentDescription ?? '')
  const [privacy, setPrivacy] = useState<'public' | 'private'>(currentPrivacy)
  const [category, setCategory] = useState<GroupCategory | ''>(currentCategory ?? '')
  const [city, setCity] = useState(currentCity ?? '')
  const [state, setState] = useState(currentState ?? '')
  const [zipCode, setZipCode] = useState(currentZipCode ?? '')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, startSave] = useTransition()
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

  function removeCoverPreview() {
    if (coverPreview) URL.revokeObjectURL(coverPreview)
    setCoverPreview(null)
    setCoverFile(null)
  }

  function handleCancel() {
    setOpen(false)
    setDescription(currentDescription ?? '')
    setPrivacy(currentPrivacy)
    setCategory(currentCategory ?? '')
    setCity(currentCity ?? '')
    setState(currentState ?? '')
    setZipCode(currentZipCode ?? '')
    removeCoverPreview()
    setError(null)
  }

  function handleSave() {
    setError(null)
    startSave(async () => {
      try {
        await updateGroup(groupId, {
          description: description.trim() || null,
          coverFile,
          privacy: privacy === 'private' ? 'private' : undefined,
          category: category || null,
          city: city.trim() || null,
          state: state || null,
          zipCode: zipCode.trim() || null,
        })
        setOpen(false)
        removeCoverPreview()
        router.refresh()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to save changes')
      }
    })
  }

  const displayCover = coverPreview ?? currentCoverUrl

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-zinc-400 hover:text-orange-400 border border-zinc-700 hover:border-orange-500 rounded-full px-3 py-1.5 transition-colors flex items-center gap-1.5"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
        </svg>
        Edit Group
      </button>

      {open && (
        <div className="mt-4 bg-zinc-800/40 border border-zinc-700 rounded-xl p-4 space-y-4">

          {/* Cover photo */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2">Cover Photo</label>
            {displayCover ? (
              <div className="relative h-32 rounded-xl overflow-hidden bg-zinc-800">
                <Image src={displayCover} alt="Group cover" fill className="object-cover" />
                <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="bg-black/70 text-white text-xs font-medium px-3 py-1.5 rounded-full hover:bg-black transition-colors"
                  >
                    Change Photo
                  </button>
                  {coverPreview && (
                    <button
                      type="button"
                      onClick={removeCoverPreview}
                      className="bg-black/70 text-white text-xs font-medium px-3 py-1.5 rounded-full hover:bg-black transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full h-24 rounded-xl border-2 border-dashed border-zinc-700 hover:border-orange-500 text-zinc-500 hover:text-orange-400 transition-colors flex items-center justify-center gap-2 text-sm"
              >
                <span className="text-xl">📷</span>
                <span>Add cover photo</span>
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

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as GroupCategory | '')}
              className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            >
              <option value="">No category</option>
              {GROUP_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this group about?"
              rows={3}
              maxLength={500}
              className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors resize-none"
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2">Location</label>
            <div className="space-y-2">
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
                maxLength={100}
                className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
              />
              <div className="flex gap-2">
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="flex-1 bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
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
                  placeholder="Zip"
                  inputMode="numeric"
                  maxLength={5}
                  className="w-24 bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Privacy — one-way toggle, only shown if currently public */}
          {currentPrivacy === 'public' && (
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">Privacy</label>
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
              {privacy === 'private' && (
                <p className="text-amber-400/80 text-xs mt-1.5">
                  Warning: This is permanent — private groups cannot be made public again.
                </p>
              )}
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-400 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}
