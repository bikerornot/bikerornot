'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createEvent, type EventType, type EventCategory, type RecurrenceRule } from '@/app/actions/events'
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

const RECURRENCE_OPTIONS: { value: RecurrenceRule | ''; label: string }[] = [
  { value: '', label: 'One-time event' },
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every two weeks' },
  { value: 'monthly', label: 'Every month' },
]

interface Props {
  userGroups: { id: string; name: string; slug: string }[]
  preselectedGroupId?: string
  initialType?: EventType
}

export default function CreateEventForm({ userGroups, preselectedGroupId, initialType }: Props) {
  const router = useRouter()
  const [type, setType] = useState<EventType>(initialType ?? 'event')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<EventCategory | ''>('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [recurrence, setRecurrence] = useState<RecurrenceRule | ''>('')
  const [groupId, setGroupId] = useState(preselectedGroupId ?? '')
  const [maxAttendees, setMaxAttendees] = useState('')

  // Location
  const [venueName, setVenueName] = useState('')
  const [address, setAddress] = useState('')
  const [zipCode, setZipCode] = useState('')

  // Ride end
  const [endAddress, setEndAddress] = useState('')
  const [endZipCode, setEndZipCode] = useState('')

  // Ride stops
  const [stops, setStops] = useState<{ label: string; address: string; zip_code: string }[]>([])

  // Cover photo
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Flyer image
  const [flyerFile, setFlyerFile] = useState<File | null>(null)
  const [flyerPreview, setFlyerPreview] = useState<string | null>(null)
  const flyerRef = useRef<HTMLInputElement>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      if (flyerPreview) URL.revokeObjectURL(flyerPreview)
      setFlyerFile(compressed)
      setFlyerPreview(URL.createObjectURL(compressed))
    } catch {
      setError('Failed to process flyer image')
    }
  }

  function removeFlyer() {
    if (flyerPreview) URL.revokeObjectURL(flyerPreview)
    setFlyerFile(null)
    setFlyerPreview(null)
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

  const submittingRef = useRef(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !startsAt || !address.trim() || !zipCode.trim()) return
    if (submittingRef.current) return
    submittingRef.current = true

    setSubmitting(true)
    setError(null)
    try {
      const event = await createEvent({
        type,
        title: title.trim(),
        description: description.trim() || null,
        category: category || null,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        recurrence_rule: recurrence || null,
        group_id: groupId || null,
        max_attendees: maxAttendees ? parseInt(maxAttendees) : null,
        venue_name: type === 'event' ? (venueName.trim() || null) : null,
        address: address.trim() || null,
        zip_code: zipCode.trim() || null,
        end_address: type === 'ride' ? (endAddress.trim() || null) : null,
        end_zip_code: type === 'ride' ? (endZipCode.trim() || null) : null,
        stops: type === 'ride' ? stops.filter((s) => s.address.trim()) : undefined,
      }, coverFile, flyerFile)
      router.push(`/events/${event.slug}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create event')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Type selector */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">What are you creating?</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => { setType('event'); setCategory('') }}
            className={`py-4 rounded-xl border-2 text-center transition-colors ${
              type === 'event'
                ? 'border-orange-500 bg-orange-500/10'
                : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
            }`}
          >
            <p className={`font-bold text-lg ${type === 'event' ? 'text-orange-400' : 'text-white'}`}>Event</p>
            <p className="text-sm text-zinc-500 mt-0.5">Rally, meetup, show, bike night</p>
          </button>
          <button
            type="button"
            onClick={() => { setType('ride'); setCategory('') }}
            className={`py-4 rounded-xl border-2 text-center transition-colors ${
              type === 'ride'
                ? 'border-orange-500 bg-orange-500/10'
                : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
            }`}
          >
            <p className={`font-bold text-lg ${type === 'ride' ? 'text-orange-400' : 'text-white'}`}>Ride</p>
            <p className="text-sm text-zinc-500 mt-0.5">Group ride with start and end</p>
          </button>
        </div>
      </div>

      {/* Cover photo + Flyer side by side */}
      <div className="grid grid-cols-2 gap-3">
        {/* Cover photo */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Cover Photo</label>
          {coverPreview ? (
            <div className="relative h-32 rounded-xl overflow-hidden bg-zinc-800">
              <Image src={coverPreview} alt="Cover preview" fill className="object-cover" />
              <button
                type="button"
                onClick={removeCover}
                className="absolute top-1.5 right-1.5 bg-black/70 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-black"
              >
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full h-32 rounded-xl border-2 border-dashed border-zinc-700 hover:border-orange-500 text-zinc-500 hover:text-orange-400 transition-colors flex flex-col items-center justify-center gap-1.5 text-sm"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
              </svg>
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

        {/* Flyer image */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Event Flyer</label>
          {flyerPreview ? (
            <div className="relative h-32 rounded-xl overflow-hidden bg-zinc-800">
              <img src={flyerPreview} alt="Flyer preview" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={removeFlyer}
                className="absolute top-1.5 right-1.5 bg-black/70 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-black"
              >
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => flyerRef.current?.click()}
              className="w-full h-32 rounded-xl border-2 border-dashed border-zinc-700 hover:border-orange-500 text-zinc-500 hover:text-orange-400 transition-colors flex flex-col items-center justify-center gap-1.5 text-sm"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
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
          placeholder={type === 'ride' ? 'Saturday Morning Ride' : 'Bike Night at The Pub'}
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
          {(type === 'ride' ? RIDE_CATEGORIES : EVENT_CATEGORIES).map((c) => (
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
          placeholder="Tell riders what to expect..."
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
          <label className="block text-sm font-medium text-zinc-300 mb-1">End Date & Time (optional)</label>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>
      </div>

      {/* Recurrence */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Repeat</label>
        <select
          value={recurrence}
          onChange={(e) => setRecurrence(e.target.value as RecurrenceRule | '')}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          {RECURRENCE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      {/* Location — Event venue */}
      {type === 'event' && (
        <>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Venue Name (optional)</label>
            <input
              type="text"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              placeholder="The Iron Horse Saloon"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Address <span className="text-orange-400">*</span></label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="1068 N US Hwy 1, Ormond Beach, FL"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Zip Code <span className="text-orange-400">*</span></label>
            <input
              type="text"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              placeholder="32174"
              maxLength={5}
              inputMode="numeric"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        </>
      )}

      {/* Location — Ride start/end/stops */}
      {type === 'ride' && (
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
                  className="text-zinc-500 hover:text-red-400 text-sm transition-colors"
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
        <label className="block text-sm font-medium text-zinc-300 mb-1">Max Attendees (optional)</label>
        <input
          type="number"
          value={maxAttendees}
          onChange={(e) => setMaxAttendees(e.target.value)}
          placeholder="Leave blank for unlimited"
          min={1}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </div>

      {/* Group (optional) */}
      {userGroups.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">Post to a Group (optional)</label>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            disabled={!!preselectedGroupId}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-base text-white focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-60"
          >
            <option value="">No group — standalone event</option>
            {userGroups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">{error}</p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting || !title.trim() || !startsAt || !address.trim() || !zipCode.trim()}
        className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors text-base"
      >
        {submitting ? 'Creating...' : type === 'ride' ? 'Create Ride' : 'Create Event'}
      </button>
    </form>
  )
}
