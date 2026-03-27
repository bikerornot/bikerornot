'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { updateEvent, type EventDetail, type EventCategory } from '@/app/actions/events'
import { getImageUrl } from '@/lib/supabase/image'
import { compressImage } from '@/lib/compress'

const RIDE_CATEGORIES: { value: EventCategory; label: string }[] = [
  { value: 'group_ride', label: 'Group Ride' },
  { value: 'charity', label: 'Charity Ride' },
  { value: 'poker_run', label: 'Poker Run' },
  { value: 'scenic_tour', label: 'Scenic Tour' },
  { value: 'other', label: 'Other' },
]

const EVENT_CATEGORIES: { value: EventCategory; label: string }[] = [
  { value: 'rally', label: 'Rally' },
  { value: 'meetup', label: 'Meetup' },
  { value: 'bike_night', label: 'Bike Night' },
  { value: 'show', label: 'Bike Show' },
  { value: 'swap_meet', label: 'Swap Meet' },
  { value: 'charity', label: 'Charity' },
  { value: 'other', label: 'Other' },
]

function toLocalDatetime(iso: string): string {
  const d = new Date(iso)
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}

interface Props {
  event: EventDetail
}

export default function EditEventForm({ event }: Props) {
  const router = useRouter()
  const [title, setTitle] = useState(event.title)
  const [description, setDescription] = useState(event.description ?? '')
  const [category, setCategory] = useState<EventCategory | ''>(event.category ?? '')
  const [startsAt, setStartsAt] = useState(toLocalDatetime(event.starts_at))
  const [endsAt, setEndsAt] = useState(event.ends_at ? toLocalDatetime(event.ends_at) : '')
  const [venueName, setVenueName] = useState(event.venue_name ?? '')
  const [address, setAddress] = useState(event.address ?? '')
  const [zipCode, setZipCode] = useState(event.zip_code ?? '')
  const [endAddress, setEndAddress] = useState(event.end_address ?? '')
  const [endZipCode, setEndZipCode] = useState(event.end_zip_code ?? '')
  const [stops, setStops] = useState<{ label: string; address: string; zip_code: string }[]>(
    (event.stops ?? []).map((s) => ({ label: s.label ?? '', address: s.address, zip_code: s.zip_code ?? '' }))
  )
  const [maxAttendees, setMaxAttendees] = useState(event.max_attendees?.toString() ?? '')

  // Cover photo
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(
    event.cover_photo_url ? getImageUrl('covers', event.cover_photo_url) : null
  )
  const fileRef = useRef<HTMLInputElement>(null)

  // Flyer
  const [flyerFile, setFlyerFile] = useState<File | null>(null)
  const [flyerPreview, setFlyerPreview] = useState<string | null>(
    event.flyer_url ? getImageUrl('covers', event.flyer_url) : null
  )
  const flyerRef = useRef<HTMLInputElement>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const categories = event.type === 'ride' ? RIDE_CATEGORIES : EVENT_CATEGORIES

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
      if (coverPreview && coverPreview.startsWith('blob:')) URL.revokeObjectURL(coverPreview)
      setCoverFile(compressed)
      setCoverPreview(URL.createObjectURL(compressed))
    } catch {
      setError('Failed to process image')
    }
  }

  async function handleFlyerSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setError(null)
    try {
      const compressed = await compressImage(file, 2, 2048)
      if (compressed.size > 5 * 1024 * 1024) {
        setError('Flyer image is too large. Please choose a smaller file.')
        return
      }
      if (flyerPreview && flyerPreview.startsWith('blob:')) URL.revokeObjectURL(flyerPreview)
      setFlyerFile(compressed)
      setFlyerPreview(URL.createObjectURL(compressed))
    } catch {
      setError('Failed to process flyer image')
    }
  }

  function addStop() {
    setStops([...stops, { label: '', address: '', zip_code: '' }])
  }

  function removeStop(idx: number) {
    setStops(stops.filter((_, i) => i !== idx))
  }

  function updateStop(idx: number, field: string, value: string) {
    setStops(stops.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !startsAt) return

    setSubmitting(true)
    setError(null)
    try {
      await updateEvent(event.id, {
        title: title.trim(),
        description: description.trim() || null,
        category: category || null,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        venue_name: event.type === 'event' ? (venueName.trim() || null) : undefined,
        address: address.trim() || null,
        zip_code: zipCode.trim() || null,
        end_address: event.type === 'ride' ? (endAddress.trim() || null) : undefined,
        end_zip_code: event.type === 'ride' ? (endZipCode.trim() || null) : undefined,
        stops: event.type === 'ride' ? stops.filter((s) => s.address.trim()) : undefined,
        max_attendees: maxAttendees ? parseInt(maxAttendees) : null,
      }, coverFile, flyerFile)
      router.push(`/events/${event.slug}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update event')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Cover photo + Flyer side by side */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Cover Photo</label>
          {coverPreview ? (
            <div className="relative h-32 rounded-xl overflow-hidden bg-zinc-800">
              <Image src={coverPreview} alt="Cover preview" fill className="object-cover" unoptimized={coverPreview.startsWith('blob:')} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute top-1.5 right-1.5 bg-black/70 text-white rounded-full px-2.5 py-0.5 text-xs hover:bg-black"
              >
                Change
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full h-32 rounded-xl border-2 border-dashed border-zinc-700 hover:border-orange-500 text-zinc-500 hover:text-orange-400 transition-colors flex flex-col items-center justify-center gap-1.5 text-xs"
            >
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
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Event Flyer</label>
          {flyerPreview ? (
            <div className="relative h-32 rounded-xl overflow-hidden bg-zinc-800">
              <img src={flyerPreview} alt="Flyer preview" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => flyerRef.current?.click()}
                className="absolute top-1.5 right-1.5 bg-black/70 text-white rounded-full px-2.5 py-0.5 text-xs hover:bg-black"
              >
                Change
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => flyerRef.current?.click()}
              className="w-full h-32 rounded-xl border-2 border-dashed border-zinc-700 hover:border-orange-500 text-zinc-500 hover:text-orange-400 transition-colors flex flex-col items-center justify-center gap-1.5 text-xs"
            >
              <span>Upload flyer</span>
            </button>
          )}
          <input
            ref={flyerRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFlyerSelect}
          />
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={150}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as EventCategory | '')}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="">Select category</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={5000}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
        />
      </div>

      {/* Date & Time */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">Start Date & Time</label>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">End Date & Time</label>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>
      </div>

      {/* Event location */}
      {event.type === 'event' && (
        <>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Venue Name</label>
            <input
              type="text"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Zip Code</label>
            <input
              type="text"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              maxLength={5}
              inputMode="numeric"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        </>
      )}

      {/* Ride locations */}
      {event.type === 'ride' && (
        <>
          <div className="border border-zinc-800 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-zinc-300">Start Location</p>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street address"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
            <input
              type="text"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              placeholder="Zip code (city &amp; state auto-filled)"
              maxLength={5}
              inputMode="numeric"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          {/* Stops */}
          {stops.map((stop, idx) => (
            <div key={idx} className="border border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-300">Stop {idx + 1}</p>
                <button
                  type="button"
                  onClick={() => removeStop(idx)}
                  className="text-zinc-500 hover:text-red-400 text-xs transition-colors"
                >
                  Remove
                </button>
              </div>
              <input
                type="text"
                value={stop.label}
                onChange={(e) => updateStop(idx, 'label', e.target.value)}
                placeholder="Label (e.g. Lunch stop)"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
              <input
                type="text"
                value={stop.address}
                onChange={(e) => updateStop(idx, 'address', e.target.value)}
                placeholder="Street address"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
              <input
                type="text"
                value={stop.zip_code}
                onChange={(e) => updateStop(idx, 'zip_code', e.target.value)}
                placeholder="Zip code (city &amp; state auto-filled)"
                maxLength={5}
                inputMode="numeric"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
          ))}

          <button
            type="button"
            onClick={addStop}
            className="text-orange-400 hover:text-orange-300 text-sm font-medium transition-colors"
          >
            + Add a stop
          </button>

          <div className="border border-zinc-800 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-zinc-300">End Location</p>
            <input
              type="text"
              value={endAddress}
              onChange={(e) => setEndAddress(e.target.value)}
              placeholder="Street address"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
            <input
              type="text"
              value={endZipCode}
              onChange={(e) => setEndZipCode(e.target.value)}
              placeholder="Zip code (city &amp; state auto-filled)"
              maxLength={5}
              inputMode="numeric"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        </>
      )}

      {/* Max attendees */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Max Attendees</label>
        <input
          type="number"
          value={maxAttendees}
          onChange={(e) => setMaxAttendees(e.target.value)}
          placeholder="Leave blank for unlimited"
          min={1}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">{error}</p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting || !title.trim() || !startsAt}
        className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors text-base"
      >
        {submitting ? 'Saving...' : 'Save Changes'}
      </button>
    </form>
  )
}
