'use client'

import { useState } from 'react'
import type { UserBike, BikePhoto, Profile } from '@/lib/supabase/types'
import BikePhotoGallery from './BikePhotoGallery'
import BikeWall from './BikeWall'
import OwnersSection from './OwnersSection'

export interface BikeOwnerSummary {
  id: string
  username: string | null
  first_name: string
  last_name: string
  profile_photo_url: string | null
  city: string | null
  state: string | null
  updated_at: string
}

interface Props {
  bikes: UserBike[]
  bikePhotosMap: Record<string, BikePhoto[]>
  ownerCountsMap: Record<string, number>
  initialOwnersMap: Record<string, BikeOwnerSummary[]>
  isOwnGarage: boolean
  isFriend: boolean
  currentUserId?: string
  currentUserProfile?: Profile | null
  username: string
  profileId: string
  defaultBikeId?: string
}

export default function GaragePage({
  bikes,
  bikePhotosMap,
  ownerCountsMap,
  initialOwnersMap,
  isOwnGarage,
  isFriend,
  currentUserId,
  currentUserProfile,
  username,
  profileId,
  defaultBikeId,
}: Props) {
  const [activeBikeId, setActiveBikeId] = useState(defaultBikeId ?? bikes[0]?.id)
  const activeBike = bikes.find((b) => b.id === activeBikeId)

  if (!activeBike) return null

  function bikeName(b: UserBike) {
    return [b.year, b.make, b.model].filter(Boolean).join(' ')
  }

  return (
    <div className="space-y-6">
      {/* Bike tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {bikes.map((bike) => (
          <button
            key={bike.id}
            onClick={() => setActiveBikeId(bike.id)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left truncate ${
              bike.id === activeBikeId
                ? 'bg-orange-500 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
            }`}
            title={bikeName(bike)}
          >
            {bikeName(bike)}
          </button>
        ))}
      </div>

      {/* Key forces remount when switching bikes */}
      <div key={activeBikeId} className="space-y-6">
        {/* Photo gallery */}
        <BikePhotoGallery
          bikeId={activeBikeId}
          initialPhotos={bikePhotosMap[activeBikeId] ?? []}
          isOwnGarage={isOwnGarage}
        />

        {/* Bike Wall */}
        <BikeWall
          bikeId={activeBikeId}
          isOwnGarage={isOwnGarage}
          isFriend={isFriend}
          garageOwnerId={profileId}
          currentUserId={currentUserId}
          currentUserProfile={currentUserProfile}
        />

        {/* Other owners section */}
        {activeBike.year && activeBike.make && activeBike.model && (() => {
          const allOwners = initialOwnersMap[activeBikeId] ?? []
          const otherOwners = allOwners.filter((o) => o.id !== profileId)
          const totalOthers = Math.max(0, (ownerCountsMap[activeBikeId] ?? 0) - (allOwners.some((o) => o.id === profileId) ? 1 : 0))
          return (
            <OwnersSection
              year={activeBike.year}
              make={activeBike.make}
              model={activeBike.model}
              initialOwners={otherOwners}
              totalCount={totalOthers}
              currentUserId={currentUserId}
              profileId={profileId}
              username={username}
            />
          )
        })()}
      </div>
    </div>
  )
}
