'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Profile, UserBike, RELATIONSHIP_OPTIONS, GENDER_OPTIONS } from '@/lib/supabase/types'
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

  const [bio, setBio] = useState(profile.bio ?? '')
  const [location, setLocation] = useState(profile.location ?? '')
  const [zipCode, setZipCode] = useState(profile.zip_code ?? '')
  const [gender, setGender] = useState(profile.gender ?? '')
  const [relationshipStatus, setRelationshipStatus] = useState(
    profile.relationship_status ?? ''
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
          bio: bio.trim() || null,
          location: location.trim() || null,
          zip_code: zipCode.trim(),
          gender: gender || null,
          relationship_status: relationshipStatus || null,
          riding_style: null,
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
      {/* Username (read-only) */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">Username</label>
        <div className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-zinc-400 text-sm cursor-not-allowed">
          @{profile.username}
        </div>
        <p className="text-zinc-600 text-xs mt-1">Username cannot be changed.</p>
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

      {/* Gender */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-2">Gender</label>
        <div className="grid grid-cols-2 gap-2">
          {GENDER_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                gender === opt.value
                  ? 'border-orange-500 bg-orange-500/10 text-white'
                  : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500'
              }`}
            >
              <input
                type="radio"
                name="gender"
                value={opt.value}
                checked={gender === opt.value}
                onChange={(e) => setGender(e.target.value)}
                className="sr-only"
              />
              <span className="text-sm font-medium">{opt.label}</span>
            </label>
          ))}
        </div>
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
