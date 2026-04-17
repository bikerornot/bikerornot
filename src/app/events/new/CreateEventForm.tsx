'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createEvent, type EventType, type EventCategory, type RecurrenceRule } from '@/app/actions/events'
import { extractFlyerData } from '@/app/actions/flyer-extract'
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
  const [type, setType] = useState<EventType | ''>(initialType ?? '')
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

  // Flyer image
  const [flyerFile, setFlyerFile] = useState<File | null>(null)
  const [flyerPreview, setFlyerPreview] = useState<string | null>(null)
  const flyerRef = useRef<HTMLInputElement>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [flyerSkipped, setFlyerSkipped] = useState(false)
  const extractRef = useRef<HTMLInputElement>(null)

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

  async function handleFlyerExtract(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setError(null)
    setExtracting(true)

    try {
      const compressed = await compressImage(file, 2, 2048)
      if (flyerPreview) URL.revokeObjectURL(flyerPreview)
      setFlyerFile(compressed)
      setFlyerPreview(URL.createObjectURL(compressed))

      // Convert to base64 for AI extraction
      const buffer = await compressed.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const base64 = btoa(binary)

      const data = await extractFlyerData(base64)

      if (data.title) setTitle(data.title)
      if (data.type) setType(data.type)
      if (data.category) setCategory(data.category as EventCategory)
      if (data.description) setDescription(data.description)
      if (data.startsAt) {
        const d = new Date(data.startsAt)
        if (!isNaN(d.getTime())) {
          const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
          setStartsAt(local)
        }
      }
      if (data.endsAt) {
        const d = new Date(data.endsAt)
        if (!isNaN(d.getTime())) {
          const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
          setEndsAt(local)
        }
      }
      if (data.venueName) setVenueName(data.venueName)
      if (data.address) setAddress(data.address)
      else if (data.city) setAddress(data.city + (data.state ? `, ${data.state}` : ''))
      if (data.zipCode) setZipCode(data.zipCode)
      if (data.endAddress || data.endCity) {
        setEndAddress(data.endAddress ?? `${data.endCity ?? ''}${data.endState ? `, ${data.endState}` : ''}`)
      }
      if (data.endZipCode) setEndZipCode(data.endZipCode)

      setFlyerSkipped(true)
    } catch {
      setError('Failed to read the flyer. Please fill out the details manually.')
      setFlyerSkipped(true)
    } finally {
      setExtracting(false)
    }
  }

  const submittingRef = useRef(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!type || !title.trim() || !startsAt || !address.trim() || !zipCode.trim()) return
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
      }, flyerFile)
      router.push(`/events/${event.slug}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create event')
      setSubmitting(false)
    }
  }

  const isRide = type === 'ride'
  const isEvent = type === 'event'
  const inputClass = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-base text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Type selector — only show if no type preselected */}
      {!initialType && (
        <div>
          <label className="block text-xl font-bold text-white mb-3">What are you creating?</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => { setType('ride'); setCategory('') }}
              className={`py-5 px-4 rounded-xl border-2 text-center transition-colors ${
                isRide
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
              }`}
            >
              <p className={`font-bold text-xl ${isRide ? 'text-orange-400' : 'text-white'}`}>Ride</p>
              <p className="text-base text-zinc-400 mt-1">Group ride with start and end</p>
            </button>
            <button
              type="button"
              onClick={() => { setType('event'); setCategory('') }}
              className={`py-5 px-4 rounded-xl border-2 text-center transition-colors ${
                isEvent
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
              }`}
            >
              <p className={`font-bold text-xl ${isEvent ? 'text-orange-400' : 'text-white'}`}>Event</p>
              <p className="text-base text-zinc-400 mt-1">Rally, meetup, show, bike night</p>
            </button>
          </div>
        </div>
      )}

      {type && !flyerSkipped && !extracting && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-center">
          <h2 className="text-lg font-bold text-white mb-2">
            Do you have a flyer for this {isRide ? 'ride' : 'event'}?
          </h2>
          <p className="text-zinc-400 text-sm mb-4">
            Upload it and we'll fill out the details for you
          </p>
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={() => extractRef.current?.click()}
              className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Upload Flyer
            </button>
            <button
              type="button"
              onClick={() => setFlyerSkipped(true)}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm border border-zinc-700"
            >
              No, skip
            </button>
          </div>
          <input
            ref={extractRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFlyerExtract}
          />
        </div>
      )}

      {extracting && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-white font-semibold">Reading your flyer...</p>
          <p className="text-zinc-400 text-sm mt-1">Extracting event details</p>
        </div>
      )}

      {type && flyerSkipped && <>

      {/* ── Section 1: The Basics ──────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-white">
          {isRide ? 'Name Your Ride' : 'Name Your Event'}
        </h2>

        <div>
          <label className="block text-base font-medium text-zinc-300 mb-1.5">
            {isRide ? 'What do you want to call this ride?' : 'What\'s the event called?'}
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isRide ? 'Saturday Morning Ride' : 'Bike Night at The Pub'}
            maxLength={150}
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-base font-medium text-zinc-300 mb-1.5">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as EventCategory | '')}
            className={inputClass}
          >
            <option value="">Select category</option>
            {(isRide ? RIDE_CATEGORIES : EVENT_CATEGORIES).map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Section 2: When ────────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-white">
          {isRide ? 'When Do You Roll Out?' : 'When Is It?'}
        </h2>

        <div>
          <label className="block text-base font-medium text-zinc-300 mb-1.5">Start Date & Time</label>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-base font-medium text-zinc-300 mb-1.5">End Date & Time <span className="text-zinc-500 font-normal">(optional)</span></label>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-base font-medium text-zinc-300 mb-1.5">Does this repeat?</label>
          <select
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value as RecurrenceRule | '')}
            className={inputClass}
          >
            {RECURRENCE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Section 3: Where ───────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-white">
          {isRide ? 'Route Details' : 'Where Is It?'}
        </h2>

        {isEvent && (
          <>
            <div>
              <label className="block text-base font-medium text-zinc-300 mb-1.5">Venue Name <span className="text-zinc-500 font-normal">(optional)</span></label>
              <input
                type="text"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                placeholder="The Iron Horse Saloon"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-base font-medium text-zinc-300 mb-1.5">Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="1068 N US Hwy 1, Ormond Beach, FL"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-base font-medium text-zinc-300 mb-1.5">Zip Code</label>
              <input
                type="text"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                placeholder="32174"
                maxLength={5}
                inputMode="numeric"
                className={inputClass}
              />
            </div>
          </>
        )}

        {isRide && (
          <>
            {/* Start */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold flex-shrink-0">A</span>
                <p className="text-base font-semibold text-white">Where does the ride start?</p>
              </div>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street address or meeting point"
                className={inputClass}
              />
              <input
                type="text"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                placeholder="Zip code"
                maxLength={5}
                inputMode="numeric"
                className={inputClass}
              />
            </div>

            {/* Stops */}
            {stops.map((stop, idx) => (
              <div key={idx} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs font-bold flex-shrink-0">{idx + 1}</span>
                    <p className="text-base font-semibold text-white">Stop {idx + 1}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeStop(idx)}
                    className="text-zinc-500 hover:text-red-400 text-sm font-medium transition-colors"
                  >
                    Remove
                  </button>
                </div>
                <input
                  type="text"
                  value={stop.label}
                  onChange={(e) => updateStop(idx, 'label', e.target.value)}
                  placeholder="What's this stop? (e.g. Lunch break)"
                  className={inputClass}
                />
                <input
                  type="text"
                  value={stop.address}
                  onChange={(e) => updateStop(idx, 'address', e.target.value)}
                  placeholder="Street address"
                  className={inputClass}
                />
                <input
                  type="text"
                  value={stop.zip_code}
                  onChange={(e) => updateStop(idx, 'zip_code', e.target.value)}
                  placeholder="Zip code"
                  maxLength={5}
                  inputMode="numeric"
                  className={inputClass}
                />
              </div>
            ))}

            <button
              type="button"
              onClick={addStop}
              className="flex items-center gap-2 text-orange-400 hover:text-orange-300 text-base font-medium transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add a stop along the way
            </button>

            {/* End */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs font-bold flex-shrink-0">B</span>
                <p className="text-base font-semibold text-white">Where does the ride end? <span className="text-zinc-500 font-normal">(optional)</span></p>
              </div>
              <input
                type="text"
                value={endAddress}
                onChange={(e) => setEndAddress(e.target.value)}
                placeholder="Street address or destination"
                className={inputClass}
              />
              <input
                type="text"
                value={endZipCode}
                onChange={(e) => setEndZipCode(e.target.value)}
                placeholder="Zip code"
                maxLength={5}
                inputMode="numeric"
                className={inputClass}
              />
            </div>
          </>
        )}
      </div>

      {/* ── Section 4: Details ─────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-white">Details</h2>

        <div>
          <label className="block text-base font-medium text-zinc-300 mb-1.5">
            {isRide ? 'Tell riders what to expect' : 'Describe the event'}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={isRide ? 'Route details, pace, experience level, what to bring...' : 'What can attendees expect? Any special info...'}
            rows={4}
            maxLength={5000}
            className={inputClass + ' resize-none'}
          />
        </div>

        <div>
          <label className="block text-base font-medium text-zinc-300 mb-1.5">Max Riders <span className="text-zinc-500 font-normal">(optional)</span></label>
          <input
            type="number"
            value={maxAttendees}
            onChange={(e) => setMaxAttendees(e.target.value)}
            placeholder="Leave blank for unlimited"
            min={1}
            className={inputClass}
          />
        </div>

        {userGroups.length > 0 && (
          <div>
            <label className="block text-base font-medium text-zinc-300 mb-1.5">Post to a Group <span className="text-zinc-500 font-normal">(optional)</span></label>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              disabled={!!preselectedGroupId}
              className={inputClass + ' disabled:opacity-60'}
            >
              <option value="">No group — standalone {isRide ? 'ride' : 'event'}</option>
              {userGroups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Section 5: Flyer (optional) ────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-white">Flyer <span className="text-zinc-500 font-normal text-base">(optional)</span></h2>
        <p className="text-zinc-400 text-sm -mt-2">Upload the event flyer. It&apos;ll show in the feed and on the {isRide ? 'ride' : 'event'} page.</p>

        <div>
            {flyerPreview ? (
              <div className="relative h-36 rounded-xl overflow-hidden bg-zinc-800">
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
                className="w-full h-36 rounded-xl border-2 border-dashed border-zinc-700 hover:border-orange-500 text-zinc-500 hover:text-orange-400 transition-colors flex flex-col items-center justify-center gap-2 text-base"
              >
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <span>Add flyer</span>
              </button>
            )}
          <input ref={flyerRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFlyerSelect} />
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">{error}</p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting || !type || !title.trim() || !startsAt || !address.trim() || !zipCode.trim()}
        className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-bold py-4 rounded-xl transition-colors text-lg"
      >
        {submitting ? 'Creating...' : isRide ? 'Create Ride' : 'Create Event'}
      </button>
      </>}
    </form>
  )
}
