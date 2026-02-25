'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { findNearbyUsers, type NearbyUser, type SearchFilters } from '@/app/actions/people'
import { sendFriendRequest, cancelFriendRequest, acceptFriendRequest } from '@/app/actions/friends'
import { getImageUrl } from '@/lib/supabase/image'

const RADIUS_OPTIONS = [
  { label: '25 mi', value: 25 },
  { label: '50 mi', value: 50 },
  { label: '100 mi', value: 100 },
  { label: '200 mi', value: 200 },
]

function Avatar({ profile }: { profile: NearbyUser['profile'] }) {
  const url = profile.profile_photo_url ? getImageUrl('avatars', profile.profile_photo_url) : null
  const initials = (profile.first_name?.[0] ?? profile.display_name?.[0] ?? '?').toUpperCase()
  return (
    <div className="w-16 h-16 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
      {url ? (
        <Image src={url} alt={profile.display_name ?? ''} width={64} height={64} className="object-cover w-full h-full" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-zinc-300 text-xl font-bold">
          {initials}
        </div>
      )}
    </div>
  )
}

function FriendAction({
  user,
  onStatusChange,
}: {
  user: NearbyUser
  onStatusChange: (id: string, status: NearbyUser['friendshipStatus']) => void
}) {
  const [pending, startTransition] = useTransition()
  const { friendshipStatus, profile } = user

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
        onClick={() =>
          startTransition(async () => {
            await cancelFriendRequest(profile.id)
            onStatusChange(profile.id, 'none')
          })
        }
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
        onClick={() =>
          startTransition(async () => {
            await acceptFriendRequest(profile.id)
            onStatusChange(profile.id, 'accepted')
          })
        }
        className="text-xs font-medium text-orange-400 border border-orange-400/50 rounded-full px-3 py-1 hover:bg-orange-400/10 transition-colors disabled:opacity-50"
      >
        {pending ? 'Accepting…' : 'Accept Request'}
      </button>
    )
  }

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await sendFriendRequest(profile.id)
          onStatusChange(profile.id, 'pending_sent')
        })
      }
      className="text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-full px-3 py-1 transition-colors disabled:opacity-50"
    >
      {pending ? 'Sending…' : 'Friend Request'}
    </button>
  )
}

const RELATIONSHIP_LABEL: Record<string, string> = {
  single: 'Single',
  in_a_relationship: 'In a Relationship',
  its_complicated: "It's Complicated",
}

function calcAge(dob: string): number {
  const today = new Date()
  const birth = new Date(dob)
  let age = today.getFullYear() - birth.getFullYear()
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) age--
  return age
}

function UserCard({
  user,
  onStatusChange,
}: {
  user: NearbyUser
  onStatusChange: (id: string, status: NearbyUser['friendshipStatus']) => void
}) {
  const { profile, distanceMiles } = user

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
          <span className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-full px-2 py-0.5 flex-shrink-0">
            {distanceMiles < 1 ? '< 1 mi' : `${distanceMiles} mi`}
          </span>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-base text-zinc-400">
          {(profile.city || profile.state) && (
            <span>📍 {[profile.city, profile.state].filter(Boolean).join(', ')}</span>
          )}
          {profile.gender && (
            <span>{profile.gender === 'male' ? 'Male' : 'Female'}{profile.date_of_birth ? `, ${calcAge(profile.date_of_birth)}` : ''}</span>
          )}
          {!profile.gender && profile.date_of_birth && (
            <span>{calcAge(profile.date_of_birth)}</span>
          )}
          {profile.relationship_status && (
            <span>{RELATIONSHIP_LABEL[profile.relationship_status] ?? profile.relationship_status}</span>
          )}
        </div>

        <div className="mt-3">
          <FriendAction user={user} onStatusChange={onStatusChange} />
        </div>
      </div>
    </div>
  )
}

const GENDER_FILTERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
]

const RELATIONSHIP_FILTERS = [
  { value: 'single', label: 'Single' },
  { value: 'in_a_relationship', label: 'In a Relationship' },
  { value: 'its_complicated', label: "It's Complicated" },
]

function FilterCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-base ${
      checked ? 'border-orange-500 bg-orange-500/10 text-white' : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500'
    }`}>
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
        checked ? 'bg-orange-500 border-orange-500' : 'border-zinc-500'
      }`}>
        {checked && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {label}
    </label>
  )
}

export default function PeopleSearch({ defaultZip }: { defaultZip: string }) {
  const [zip, setZip] = useState(defaultZip)
  const [radius, setRadius] = useState(50)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [genderFilter, setGenderFilter] = useState<string[]>([])
  const [relationshipFilter, setRelationshipFilter] = useState<string[]>([])
  const [results, setResults] = useState<NearbyUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searching, startSearch] = useTransition()

  // Local optimistic friendship status updates
  const [statusOverrides, setStatusOverrides] = useState<
    Record<string, NearbyUser['friendshipStatus']>
  >({})

  function toggleFilter(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  }

  function handleStatusChange(id: string, status: NearbyUser['friendshipStatus']) {
    setStatusOverrides((prev) => ({ ...prev, [id]: status }))
  }

  const activeFilterCount = genderFilter.length + relationshipFilter.length

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const filters: SearchFilters = {}
    if (genderFilter.length) filters.gender = genderFilter
    if (relationshipFilter.length) filters.relationshipStatus = relationshipFilter
    startSearch(async () => {
      const { users, error } = await findNearbyUsers(zip.trim(), radius, filters)
      if (error) {
        setError(error)
        setResults(null)
      } else {
        setResults(users)
        setStatusOverrides({})
      }
    })
  }

  return (
    <div>
      {/* Search form */}
      <form onSubmit={handleSearch} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-zinc-400 mb-1">Zip code</label>
            <input
              type="text"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              placeholder="e.g. 90210"
              maxLength={10}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-base"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Radius</label>
            <select
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-base"
            >
              {RADIUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={searching || !zip.trim()}
              className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-2 rounded-lg transition-colors text-base"
            >
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
        </div>

        {/* Advanced search toggle */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs text-zinc-500 hover:text-orange-400 transition-colors flex items-center gap-1"
          >
            <span>{showAdvanced ? '▾' : '▸'}</span>
            Advanced Search
            {activeFilterCount > 0 && (
              <span className="ml-1 bg-orange-500 text-white rounded-full px-1.5 py-0.5 text-xs leading-none">
                {activeFilterCount}
              </span>
            )}
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-3 pt-3 border-t border-zinc-800">
              <div>
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Gender</p>
                <div className="flex flex-wrap gap-2">
                  {GENDER_FILTERS.map((f) => (
                    <FilterCheckbox
                      key={f.value}
                      label={f.label}
                      checked={genderFilter.includes(f.value)}
                      onChange={() => toggleFilter(genderFilter, setGenderFilter, f.value)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Relationship Status</p>
                <div className="flex flex-wrap gap-2">
                  {RELATIONSHIP_FILTERS.map((f) => (
                    <FilterCheckbox
                      key={f.value}
                      label={f.label}
                      checked={relationshipFilter.includes(f.value)}
                      onChange={() => toggleFilter(relationshipFilter, setRelationshipFilter, f.value)}
                    />
                  ))}
                </div>
              </div>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => { setGenderFilter([]); setRelationshipFilter([]) }}
                  className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-base mb-4">
          {error}
        </div>
      )}

      {/* Results */}
      {results !== null && (
        <>
          <p className="text-zinc-500 text-base mb-4">
            {results.length === 0
              ? `No riders found within ${radius} miles of ${zip}.`
              : `${results.length} rider${results.length === 1 ? '' : 's'} found within ${radius} miles`}
          </p>
          <div className="space-y-3">
            {results.map((user) => (
              <UserCard
                key={user.profile.id}
                user={{ ...user, friendshipStatus: statusOverrides[user.profile.id] ?? user.friendshipStatus }}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        </>
      )}

      {/* Initial state */}
      {results === null && !error && !searching && (
        <div className="text-center py-16 text-zinc-600">
          <p className="text-4xl mb-3">🏍️</p>
          <p className="text-base">Enter a zip code to find riders near you</p>
        </div>
      )}
    </div>
  )
}
