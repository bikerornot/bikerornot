'use client'

import { useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { findBikeOwners, type BikeOwner, type FriendshipStatus } from '@/app/actions/bikes'
import { sendFriendRequest, cancelFriendRequest, acceptFriendRequest } from '@/app/actions/friends'
import { getImageUrl } from '@/lib/supabase/image'

// ── Shared bike make data ────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: CURRENT_YEAR - 1979 }, (_, i) => CURRENT_YEAR - i)

const MAKES_BY_COUNTRY: Record<string, string[]> = {
  'American':  ['Buell', 'Harley-Davidson', 'Indian', 'Victory', 'Zero'],
  'British':   ['BSA', 'Norton', 'Triumph'],
  'German':    ['BMW'],
  'Italian':   ['Aprilia', 'Ducati', 'Moto Guzzi'],
  'Japanese':  ['Honda', 'Kawasaki', 'Suzuki', 'Yamaha'],
}

const ALL_MAKES = Object.values(MAKES_BY_COUNTRY).flat()

const selectClass =
  'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 text-base disabled:opacity-50'
const inputClass =
  'w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 text-base'

// ── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ profile }: { profile: BikeOwner['profile'] }) {
  const url = profile.profile_photo_url ? getImageUrl('avatars', profile.profile_photo_url) : null
  const initial = (profile.first_name?.[0] ?? profile.display_name?.[0] ?? '?').toUpperCase()
  return (
    <div className="w-16 h-16 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
      {url ? (
        <Image src={url} alt={profile.username ?? ''} width={64} height={64} className="object-cover w-full h-full" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-zinc-300 text-xl font-bold">
          {initial}
        </div>
      )}
    </div>
  )
}

// ── Friend action button ─────────────────────────────────────────────────────

function FriendAction({
  owner,
  onStatusChange,
}: {
  owner: BikeOwner
  onStatusChange: (id: string, status: FriendshipStatus) => void
}) {
  const [pending, startTransition] = useTransition()
  const { friendshipStatus, profile } = owner

  if (friendshipStatus === 'accepted') {
    return (
      <span className="text-xs font-medium text-green-400 border border-green-400/30 rounded-full px-3 py-1">
        Friends
      </span>
    )
  }
  if (friendshipStatus === 'pending_sent') {
    return (
      <button
        disabled={pending}
        onClick={() => startTransition(async () => { await cancelFriendRequest(profile.id); onStatusChange(profile.id, 'none') })}
        className="text-xs font-medium text-zinc-400 border border-zinc-600 rounded-full px-3 py-1 hover:border-zinc-400 transition-colors disabled:opacity-50"
      >
        {pending ? 'Cancelling…' : 'Pending'}
      </button>
    )
  }
  if (friendshipStatus === 'pending_received') {
    return (
      <button
        disabled={pending}
        onClick={() => startTransition(async () => { await acceptFriendRequest(profile.id); onStatusChange(profile.id, 'accepted') })}
        className="text-xs font-medium text-orange-400 border border-orange-400/50 rounded-full px-3 py-1 hover:bg-orange-400/10 transition-colors disabled:opacity-50"
      >
        {pending ? 'Accepting…' : 'Accept Request'}
      </button>
    )
  }
  return (
    <button
      disabled={pending}
      onClick={() => startTransition(async () => { await sendFriendRequest(profile.id); onStatusChange(profile.id, 'pending_sent') })}
      className="text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-full px-3 py-1 transition-colors disabled:opacity-50"
    >
      {pending ? 'Sending…' : 'Friend Request'}
    </button>
  )
}

// ── Owner card ───────────────────────────────────────────────────────────────

function OwnerCard({
  owner,
  showBike,
  onStatusChange,
}: {
  owner: BikeOwner
  showBike: boolean
  onStatusChange: (id: string, status: FriendshipStatus) => void
}) {
  const { profile, bike, distanceMiles } = owner
  const bikeLabel = [bike.year, bike.make, bike.model].filter(Boolean).join(' ')

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-4 items-start">
      <Link href={`/profile/${profile.username}`}>
        <Avatar profile={profile} />
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/profile/${profile.username}`}
            className="font-semibold text-white hover:text-orange-400 transition-colors truncate"
          >
            @{profile.username}
          </Link>
          {distanceMiles !== null && (
            <span className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-full px-2 py-0.5 flex-shrink-0">
              {distanceMiles < 1 ? '< 1 mi' : `${distanceMiles} mi`}
            </span>
          )}
        </div>

        {showBike && bikeLabel && (
          <p className="text-sm text-zinc-400 mt-0.5">🏍️ {bikeLabel}</p>
        )}

        {(profile.city || profile.state) && (
          <p className="text-sm text-zinc-400 mt-0.5">
            📍 {[profile.city, profile.state].filter(Boolean).join(', ')}
          </p>
        )}

        <div className="mt-3">
          <FriendAction owner={owner} onStatusChange={onStatusChange} />
        </div>
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

interface SearchState {
  year: string
  make: string
  model: string
}

interface Props {
  defaultSearch: SearchState
  initialOwners: BikeOwner[]
  initialError: string | null
  initialLimited: boolean
}

export default function BikeSearch({ defaultSearch, initialOwners, initialError, initialLimited }: Props) {
  const [year, setYear] = useState(defaultSearch.year)
  const [make, setMake] = useState(defaultSearch.make)
  const [model, setModel] = useState(defaultSearch.model)
  const [isOtherMake, setIsOtherMake] = useState(
    !!defaultSearch.make && !ALL_MAKES.includes(defaultSearch.make)
  )
  const [nhtsakModels, setNhtsaModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [owners, setOwners] = useState<BikeOwner[]>(initialOwners)
  const [error, setError] = useState<string | null>(initialError)
  const [limited, setLimited] = useState(initialLimited)
  const [hasSearched, setHasSearched] = useState(initialOwners.length > 0 || !!initialError)
  const [statusOverrides, setStatusOverrides] = useState<Record<string, FriendshipStatus>>({})
  const [searching, startSearch] = useTransition()

  // Fetch NHTSA models when year AND make are both set
  useEffect(() => {
    if (!year || !make || isOtherMake) {
      setNhtsaModels([])
      return
    }
    setLoadingModels(true)
    fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}/vehicleType/Motorcycle?format=json`
    )
      .then((r) => r.json())
      .then((data) => {
        const names: string[] = data.Results.map((r: { Model_Name: string }) => r.Model_Name).sort()
        setNhtsaModels(names)
      })
      .catch(() => setNhtsaModels([]))
      .finally(() => setLoadingModels(false))
  }, [year, make, isOtherMake])

  function handleMakeChange(value: string) {
    if (value === '__other__') {
      setIsOtherMake(true)
      setMake('')
    } else {
      setIsOtherMake(false)
      setMake(value)
    }
    setModel('')
    setNhtsaModels([])
  }

  function handleStatusChange(id: string, status: FriendshipStatus) {
    setStatusOverrides((prev) => ({ ...prev, [id]: status }))
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!make) return
    setError(null)
    startSearch(async () => {
      const { owners: results, error: err, limited: lim } = await findBikeOwners(
        make,
        year ? parseInt(year) : null,
        model || null
      )
      setOwners(results)
      setError(err)
      setLimited(lim)
      setStatusOverrides({})
      setHasSearched(true)
    })
  }

  // Show bike label in results when search is broader than exact match
  const showBikeInResults = !year || !model

  const makeSelectValue = isOtherMake ? '__other__' : make

  return (
    <div>
      {/* Search form */}
      <form onSubmit={handleSearch} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6 space-y-3">
        {/* Year */}
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Year</label>
          <select value={year} onChange={(e) => { setYear(e.target.value); setModel('') }} className={selectClass}>
            <option value="">All Years</option>
            {YEARS.map((y) => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
        </div>

        {/* Make */}
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">
            Make <span className="text-orange-400">*</span>
          </label>
          <select value={makeSelectValue} onChange={(e) => handleMakeChange(e.target.value)} className={selectClass}>
            <option value="">Select a make</option>
            {Object.entries(MAKES_BY_COUNTRY).map(([country, makes]) => (
              <optgroup key={country} label={country}>
                {makes.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </optgroup>
            ))}
            <optgroup label="──────────">
              <option value="__other__">Other…</option>
            </optgroup>
          </select>
          {isOtherMake && (
            <input
              type="text"
              value={make}
              onChange={(e) => setMake(e.target.value)}
              placeholder="Enter make"
              autoFocus
              className={`${inputClass} mt-2`}
            />
          )}
        </div>

        {/* Model */}
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">Model</label>
          {nhtsakModels.length > 0 ? (
            <select value={model} onChange={(e) => setModel(e.target.value)} disabled={loadingModels} className={selectClass}>
              <option value="">Any Model</option>
              {nhtsakModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={loadingModels ? 'Loading models…' : 'Any model (optional)'}
              disabled={loadingModels}
              className={inputClass}
            />
          )}
        </div>

        <button
          type="submit"
          disabled={searching || !make}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors text-base"
        >
          {searching ? 'Searching…' : 'Find Owners'}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-base mb-4">
          {error}
        </div>
      )}

      {/* Results */}
      {hasSearched && !error && (
        <>
          <p className="text-zinc-500 text-base mb-4">
            {owners.length === 0
              ? 'No owners found matching that search.'
              : (
                <>
                  {limited && 'Showing first 100 of many results. '}
                  {owners.length} rider{owners.length === 1 ? '' : 's'} found
                </>
              )}
          </p>
          <div className="space-y-3">
            {owners.map((owner) => (
              <OwnerCard
                key={owner.profile.id}
                owner={{ ...owner, friendshipStatus: statusOverrides[owner.profile.id] ?? owner.friendshipStatus }}
                showBike={showBikeInResults}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        </>
      )}

      {/* Initial empty state */}
      {!hasSearched && !error && (
        <div className="text-center py-16 text-zinc-600">
          <p className="text-4xl mb-3">🏍️</p>
          <p className="text-base">Select a make to find other owners</p>
          <p className="text-sm mt-1">Year and model are optional</p>
        </div>
      )}
    </div>
  )
}
