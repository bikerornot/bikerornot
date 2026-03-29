'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { UserBike, BikePhoto } from '@/lib/supabase/types'
import BikeSelector, { BikeData } from '@/app/settings/BikeSelector'
import { addBike, updateBike, deleteBike, uploadBikePhoto, getBikePhotos, uploadBikeGalleryPhoto, deleteBikePhoto, setBikePrimaryPhoto } from '@/app/actions/garage'
import { compressImage } from '@/lib/compress'
import { getImageUrl } from '@/lib/supabase/image'
import { bikeSluggify } from '@/lib/bike-slug'

interface BikeCard {
  id: string
  year: string
  make: string
  model: string
  description: string | null
  photo_url: string | null
}

interface Props {
  isOwnProfile: boolean
  initialBikes: UserBike[]
  ownerCounts: Record<string, number>
  username: string
}

const EMPTY: BikeData = { year: '', make: '', model: '' }

function PhotoThumbnail({
  photoUrl,
  isUploading,
  onClick,
  isOwn,
}: {
  photoUrl: string | null
  isUploading: boolean
  onClick?: () => void
  isOwn: boolean
}) {
  return (
    <div
      onClick={isOwn ? onClick : undefined}
      className={`relative w-16 h-16 rounded-lg bg-zinc-800 overflow-hidden flex-shrink-0 ${isOwn ? 'cursor-pointer group' : ''}`}
    >
      {photoUrl ? (
        <Image src={photoUrl} alt="Bike photo" fill className="object-cover" sizes="64px" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-2xl select-none">🏍️</div>
      )}

      {isOwn && !isUploading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
          </svg>
        </div>
      )}

      {isUploading && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

/** Horizontal photo gallery strip for a bike — shows all photos + add button */
function BikePhotoGallery({
  bikeId,
  onPrimaryChanged,
}: {
  bikeId: string
  onPrimaryChanged: (newPhotoUrl: string | null) => void
}) {
  const [photos, setPhotos] = useState<BikePhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [menuPhotoId, setMenuPhotoId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const galleryFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getBikePhotos(bikeId).then((p) => {
      setPhotos(p)
      setLoading(false)
    })
  }, [bikeId])

  async function handleAddPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploading(true)
    setError(null)
    try {
      const compressed = await compressImage(file, 1, 1920)
      const formData = new FormData()
      formData.append('file', compressed)
      const newPhoto = await uploadBikeGalleryPhoto(bikeId, formData)
      setPhotos((prev) => [...prev, newPhoto])
      // If it's the first photo, update the parent card thumbnail
      if (newPhoto.is_primary) {
        onPrimaryChanged(newPhoto.storage_path)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(photoId: string) {
    const photo = photos.find((p) => p.id === photoId)
    if (!photo) return
    setMenuPhotoId(null)
    try {
      await deleteBikePhoto(photoId)
      const remaining = photos.filter((p) => p.id !== photoId)
      // If deleted was primary, the server promotes the next one
      if (photo.is_primary && remaining.length > 0) {
        remaining[0].is_primary = true
        onPrimaryChanged(remaining[0].storage_path)
      } else if (remaining.length === 0) {
        onPrimaryChanged(null)
      }
      setPhotos(remaining)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  async function handleSetPrimary(photoId: string) {
    const photo = photos.find((p) => p.id === photoId)
    if (!photo || photo.is_primary) return
    setMenuPhotoId(null)
    try {
      await setBikePrimaryPhoto(photoId)
      setPhotos((prev) =>
        prev.map((p) => ({ ...p, is_primary: p.id === photoId }))
      )
      onPrimaryChanged(photo.storage_path)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to set primary')
    }
  }

  if (loading) {
    return <div className="text-zinc-600 text-sm py-1">Loading photos…</div>
  }

  return (
    <div className="mt-2">
      <input
        ref={galleryFileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleAddPhoto}
      />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {photos.map((photo) => (
          <div key={photo.id} className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setMenuPhotoId(menuPhotoId === photo.id ? null : photo.id)}
              className="relative w-16 h-16 rounded-lg bg-zinc-800 overflow-hidden group"
            >
              <Image
                src={getImageUrl('bikes', photo.storage_path)}
                alt="Bike photo"
                fill
                className="object-cover"
                sizes="64px"
              />
              {photo.is_primary && (
                <div className="absolute top-0.5 left-0.5 bg-orange-500 text-white text-[9px] font-bold px-1 rounded">
                  Main
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="6" r="1.5" fill="currentColor" />
                  <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                  <circle cx="12" cy="18" r="1.5" fill="currentColor" />
                </svg>
              </div>
            </button>
            {/* Context menu */}
            {menuPhotoId === photo.id && (
              <div className="absolute top-full left-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden whitespace-nowrap">
                {!photo.is_primary && (
                  <button
                    onClick={() => handleSetPrimary(photo.id)}
                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-zinc-700 transition-colors"
                  >
                    Set as main photo
                  </button>
                )}
                <button
                  onClick={() => handleDelete(photo.id)}
                  className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-zinc-700 transition-colors"
                >
                  Delete photo
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Add photo button */}
        {photos.length < 10 && (
          <button
            type="button"
            onClick={() => galleryFileRef.current?.click()}
            disabled={uploading}
            className="w-16 h-16 rounded-lg border-2 border-dashed border-zinc-700 hover:border-orange-500 flex items-center justify-center text-zinc-500 hover:text-orange-400 transition-colors flex-shrink-0"
          >
            {uploading ? (
              <div className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            )}
          </button>
        )}
      </div>
      {error && <p className="text-red-400 text-sm mt-1">{error}</p>}
    </div>
  )
}

/** Read-only photo strip for visitors viewing someone's garage */
function ReadOnlyPhotoStrip({ bikeId }: { bikeId: string }) {
  const [photos, setPhotos] = useState<BikePhoto[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getBikePhotos(bikeId).then((p) => {
      setPhotos(p)
      setLoaded(true)
    })
  }, [bikeId])

  // Don't show strip if only 0-1 photos (the main thumbnail covers that)
  if (!loaded || photos.length <= 1) return null

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 mt-2">
      {photos.map((photo) => (
        <div key={photo.id} className="relative w-14 h-14 rounded-lg bg-zinc-800 overflow-hidden flex-shrink-0">
          <Image
            src={getImageUrl('bikes', photo.storage_path)}
            alt="Bike photo"
            fill
            className="object-cover"
            sizes="56px"
          />
        </div>
      ))}
    </div>
  )
}

export default function GarageTab({ isOwnProfile, initialBikes, ownerCounts, username }: Props) {
  const [bikes, setBikes] = useState<BikeCard[]>(
    initialBikes.map((b) => ({
      id: b.id,
      year: String(b.year ?? ''),
      make: b.make ?? '',
      model: b.model ?? '',
      description: b.description ?? null,
      photo_url: b.photo_url ?? null,
    }))
  )
  const [addingNew, setAddingNew] = useState(false)
  const [newForm, setNewForm] = useState<BikeData>(EMPTY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<BikeData>(EMPTY)
  const [editDescription, setEditDescription] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [photoTargetId, setPhotoTargetId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function startEdit(bike: BikeCard) {
    setEditingId(bike.id)
    setEditForm({ year: bike.year, make: bike.make, model: bike.model })
    setEditDescription(bike.description ?? '')
    setAddingNew(false)
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditForm(EMPTY)
    setEditDescription('')
  }

  function openAddForm() {
    setAddingNew(true)
    setNewForm(EMPTY)
    setEditingId(null)
    setError(null)
  }

  function cancelAdd() {
    setAddingNew(false)
    setNewForm(EMPTY)
  }

  async function handleAdd() {
    if (!newForm.year || !newForm.make || !newForm.model) return
    setSavingId('new')
    setError(null)
    try {
      const id = await addBike(parseInt(newForm.year), newForm.make.trim(), newForm.model.trim())
      setBikes((prev) => [
        ...prev,
        { id, year: newForm.year, make: newForm.make, model: newForm.model, description: null, photo_url: null },
      ])
      cancelAdd()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add bike')
    } finally {
      setSavingId(null)
    }
  }

  async function handleUpdate(id: string) {
    if (!editForm.year || !editForm.make || !editForm.model) return
    setSavingId(id)
    setError(null)
    try {
      await updateBike(id, parseInt(editForm.year), editForm.make.trim(), editForm.model.trim(), editDescription || null)
      setBikes((prev) =>
        prev.map((b) =>
          b.id === id ? { ...b, year: editForm.year, make: editForm.make, model: editForm.model, description: editDescription.trim() || null } : b
        )
      )
      cancelEdit()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update bike')
    } finally {
      setSavingId(null)
    }
  }

  async function handleDelete(id: string) {
    setSavingId(id)
    setError(null)
    try {
      await deleteBike(id)
      setBikes((prev) => prev.filter((b) => b.id !== id))
      if (editingId === id) cancelEdit()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete bike')
    } finally {
      setSavingId(null)
    }
  }

  function triggerPhotoUpload(bikeId: string) {
    setPhotoTargetId(bikeId)
    fileInputRef.current?.click()
  }

  async function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const targetId = photoTargetId
    setPhotoTargetId(null)
    if (!file || !targetId) return

    setUploadingId(targetId)
    setError(null)
    try {
      const compressed = await compressImage(file, 1, 1920)
      const formData = new FormData()
      formData.append('file', compressed)
      const path = await uploadBikePhoto(targetId, formData)
      setBikes((prev) => prev.map((b) => (b.id === targetId ? { ...b, photo_url: path } : b)))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Photo upload failed')
    } finally {
      setUploadingId(null)
    }
  }

  // ── Read-only view ──────────────────────────────────────────────────────────
  if (!isOwnProfile) {
    if (bikes.length === 0) {
      return (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-10 text-center">
          <p className="text-4xl mb-3">🏍️</p>
          <p className="text-zinc-500 text-sm">No bikes in the garage yet.</p>
        </div>
      )
    }
    return (
      <div className="space-y-3">
        {bikes.map((bike) => (
          <div key={bike.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-4">
              <Link href={`/garage/${username}?bike=${bikeSluggify(bike.year, bike.make, bike.model)}`}>
                <PhotoThumbnail
                  photoUrl={bike.photo_url ? getImageUrl('bikes', bike.photo_url) : null}
                  isUploading={false}
                  isOwn={false}
                />
              </Link>
              <div className="flex-1 min-w-0">
                <Link
                  href={`/garage/${username}?bike=${bikeSluggify(bike.year, bike.make, bike.model)}`}
                  className="text-white font-medium hover:text-orange-400 transition-colors"
                >
                  {[bike.year, bike.make, bike.model].filter(Boolean).join(' ')}
                </Link>
                {bike.description && (
                  <p className="text-zinc-400 text-sm mt-1 whitespace-pre-wrap leading-relaxed">{bike.description}</p>
                )}
                {(ownerCounts[bike.id] ?? 0) > 0 && (
                  <Link
                    href={`/garage/${username}?bike=${bikeSluggify(bike.year, bike.make, bike.model)}`}
                    className="text-orange-400 hover:text-orange-300 text-sm mt-1 block transition-colors"
                  >
                    {ownerCounts[bike.id]} other {ownerCounts[bike.id] === 1 ? 'owner' : 'owners'} →
                  </Link>
                )}
              </div>
            </div>
            <ReadOnlyPhotoStrip bikeId={bike.id} />
          </div>
        ))}
      </div>
    )
  }

  // ── Editable view ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Hidden file input — shared across all bike photo uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handlePhotoFile}
      />

      {bikes.map((bike) => {
        const isEditing = editingId === bike.id
        const isSaving = savingId === bike.id
        const isUploading = uploadingId === bike.id
        const photoUrl = bike.photo_url ? getImageUrl('bikes', bike.photo_url) : null

        // ── Edit mode ──
        if (isEditing) {
          return (
            <div key={bike.id} className="bg-zinc-900 border border-orange-500/30 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-zinc-500 uppercase tracking-wider">
                  Editing bike
                </span>
                <button
                  onClick={cancelEdit}
                  className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
              <BikeSelector value={editForm} onChange={setEditForm} />
              <div className="mt-3">
                <label className="text-zinc-400 text-sm block mb-1">About this bike <span className="text-zinc-600">(optional)</span></label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Mods, history, stories..."
                  maxLength={2000}
                  rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500 resize-none"
                />
                <p className="text-zinc-600 text-sm text-right mt-0.5">{editDescription.length}/2000</p>
              </div>
              <button
                onClick={() => handleUpdate(bike.id)}
                disabled={isSaving || !editForm.year || !editForm.make || !editForm.model}
                className="mt-2 w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2 rounded-lg transition-colors text-sm"
              >
                {isSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          )
        }

        // ── Display mode ──
        return (
          <div key={bike.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-4">
              <PhotoThumbnail
                photoUrl={photoUrl}
                isUploading={isUploading}
                onClick={() => triggerPhotoUpload(bike.id)}
                isOwn={true}
              />

              <div className="flex-1 min-w-0">
                <Link
                  href={`/garage/${username}?bike=${bikeSluggify(bike.year, bike.make, bike.model)}`}
                  className="text-white font-medium hover:text-orange-400 transition-colors"
                >
                  {[bike.year, bike.make, bike.model].filter(Boolean).join(' ')}
                </Link>
                {bike.description && (
                  <p className="text-zinc-400 text-sm mt-1 whitespace-pre-wrap leading-relaxed">{bike.description}</p>
                )}
                {(ownerCounts[bike.id] ?? 0) > 0 ? (
                  <Link
                    href={`/garage/${username}?bike=${bikeSluggify(bike.year, bike.make, bike.model)}`}
                    className="text-orange-400 hover:text-orange-300 text-sm mt-1 block transition-colors"
                  >
                    {ownerCounts[bike.id]} other {ownerCounts[bike.id] === 1 ? 'owner' : 'owners'} →
                  </Link>
                ) : null}
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => startEdit(bike)}
                  disabled={!!savingId}
                  title="Edit bike"
                  className="p-2 text-zinc-500 hover:text-orange-400 transition-colors disabled:opacity-40"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(bike.id)}
                  disabled={!!savingId}
                  title="Delete bike"
                  className="p-2 text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-40"
                >
                  {isSaving ? (
                    <div className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Photo gallery strip */}
            <BikePhotoGallery
              bikeId={bike.id}
              onPrimaryChanged={(newPath) => {
                setBikes((prev) =>
                  prev.map((b) => (b.id === bike.id ? { ...b, photo_url: newPath } : b))
                )
              }}
            />
          </div>
        )
      })}

      {/* Add form */}
      {addingNew ? (
        <div className="bg-zinc-900 border border-orange-500/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-zinc-500 uppercase tracking-wider">
              New bike
            </span>
            <button
              onClick={cancelAdd}
              className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
          <BikeSelector value={newForm} onChange={setNewForm} />
          <button
            onClick={handleAdd}
            disabled={savingId === 'new' || !newForm.year || !newForm.make || !newForm.model}
            className="mt-3 w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2 rounded-lg transition-colors text-sm"
          >
            {savingId === 'new' ? 'Saving…' : 'Save Bike'}
          </button>
        </div>
      ) : (
        <button
          onClick={openAddForm}
          className="w-full border border-dashed border-zinc-700 hover:border-orange-500 text-zinc-500 hover:text-orange-400 rounded-xl py-3 text-sm font-medium transition-colors"
        >
          + Add a Bike
        </button>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  )
}
