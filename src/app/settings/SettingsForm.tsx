'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Profile, UserBike, RIDING_STYLES, RELATIONSHIP_OPTIONS } from '@/lib/supabase/types'
import { saveProfileSettings } from './actions'

interface BikeRow {
  id?: string
  year: string
  make: string
  model: string
}

interface Props {
  profile: Profile
  initialBikes: UserBike[]
}

const inputClass =
  'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm'

export default function SettingsForm({ profile, initialBikes }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [displayName, setDisplayName] = useState(profile.display_name ?? '')
  const [bio, setBio] = useState(profile.bio ?? '')
  const [location, setLocation] = useState(profile.location ?? '')
  const [zipCode, setZipCode] = useState(profile.zip_code ?? '')
  const [relationshipStatus, setRelationshipStatus] = useState(
    profile.relationship_status ?? ''
  )
  const [ridingStyle, setRidingStyle] = useState<string[]>(
    profile.riding_style ?? []
  )
  const [bikes, setBikes] = useState<BikeRow[]>(
    initialBikes.map((b) => ({
      id: b.id,
      year: String(b.year ?? ''),
      make: b.make ?? '',
      model: b.model ?? '',
    }))
  )
  const [deletedBikeIds, setDeletedBikeIds] = useState<string[]>([])

  function toggleRidingStyle(style: string) {
    setRidingStyle((prev) =>
      prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style]
    )
  }

  function addBike() {
    setBikes((prev) => [...prev, { year: '', make: '', model: '' }])
  }

  function removeBike(index: number) {
    const bike = bikes[index]
    if (bike.id) setDeletedBikeIds((prev) => [...prev, bike.id!])
    setBikes((prev) => prev.filter((_, i) => i !== index))
  }

  function updateBike(index: number, field: 'year' | 'make' | 'model', value: string) {
    setBikes((prev) =>
      prev.map((b, i) => (i === index ? { ...b, [field]: value } : b))
    )
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError(null)

    try {
      await saveProfileSettings(
        {
          display_name: displayName.trim() || null,
          bio: bio.trim() || null,
          location: location.trim() || null,
          zip_code: zipCode.trim(),
          relationship_status: relationshipStatus || null,
          riding_style: ridingStyle.length > 0 ? ridingStyle : null,
        },
        bikes
          .filter((b) => !b.id && b.year.trim() && b.make.trim() && b.model.trim())
          .map((b) => ({ year: parseInt(b.year), make: b.make.trim(), model: b.model.trim() })),
        deletedBikeIds
      )

      setDeletedBikeIds([])
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Display name */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">
          Display name
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={60}
          placeholder="Your display name"
          className={inputClass}
        />
      </div>

      {/* Bio */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-zinc-300">Bio</label>
          <span className="text-xs text-zinc-500">{bio.length}/300</span>
        </div>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, 300))}
          maxLength={300}
          rows={3}
          placeholder="Tell other riders about yourself…"
          className={`${inputClass} resize-none`}
        />
      </div>

      {/* Location */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">
          Location
        </label>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="City, State"
          className={inputClass}
        />
      </div>

      {/* Zip code */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">
          Zip / Postal code
        </label>
        <input
          type="text"
          value={zipCode}
          onChange={(e) => setZipCode(e.target.value)}
          placeholder="90210"
          className={inputClass}
        />
      </div>

      {/* Relationship status */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          Relationship status
        </label>
        <div className="space-y-2">
          {RELATIONSHIP_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                relationshipStatus === opt.value
                  ? 'border-orange-500 bg-orange-500/10 text-white'
                  : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500'
              }`}
            >
              <input
                type="radio"
                name="relationshipStatus"
                value={opt.value}
                checked={relationshipStatus === opt.value}
                onChange={(e) => setRelationshipStatus(e.target.value)}
                className="sr-only"
              />
              <span className="text-sm">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Riding styles */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          Riding styles
        </label>
        <div className="grid grid-cols-2 gap-2">
          {RIDING_STYLES.map((style) => (
            <label
              key={style}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                ridingStyle.includes(style)
                  ? 'border-orange-500 bg-orange-500/10 text-white'
                  : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500'
              }`}
            >
              <input
                type="checkbox"
                checked={ridingStyle.includes(style)}
                onChange={() => toggleRidingStyle(style)}
                className="sr-only"
              />
              <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                ridingStyle.includes(style)
                  ? 'bg-orange-500 border-orange-500'
                  : 'border-zinc-500'
              }`}>
                {ridingStyle.includes(style) && (
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 12 12">
                    <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                )}
              </span>
              {style}
            </label>
          ))}
        </div>
      </div>

      {/* Bikes */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          Your garage
        </label>
        <div className="space-y-2">
          {bikes.map((bike, index) => (
            <div key={index} className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-500 text-xs font-medium uppercase tracking-wider">
                  Bike {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeBike(index)}
                  className="text-zinc-500 hover:text-red-400 text-xs transition-colors"
                >
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  value={bike.year}
                  onChange={(e) => updateBike(index, 'year', e.target.value)}
                  placeholder="Year"
                  min={1900}
                  max={new Date().getFullYear() + 1}
                  className="bg-zinc-900 border border-zinc-600 rounded-md px-2 py-1.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500 text-sm"
                />
                <input
                  type="text"
                  value={bike.make}
                  onChange={(e) => updateBike(index, 'make', e.target.value)}
                  placeholder="Make"
                  className="bg-zinc-900 border border-zinc-600 rounded-md px-2 py-1.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500 text-sm"
                />
                <input
                  type="text"
                  value={bike.model}
                  onChange={(e) => updateBike(index, 'model', e.target.value)}
                  placeholder="Model"
                  className="bg-zinc-900 border border-zinc-600 rounded-md px-2 py-1.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500 text-sm"
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addBike}
            className="text-orange-400 hover:text-orange-300 text-sm font-medium flex items-center gap-1 transition-colors"
          >
            + Add a bike
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
      >
        {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save changes'}
      </button>
    </form>
  )
}
