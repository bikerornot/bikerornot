'use client'

import { useState } from 'react'
import { Profile } from '@/lib/supabase/types'
import WallTab from './WallTab'
import FriendsTab from './FriendsTab'

const TABS = ['Wall', 'Photos', 'Friends'] as const
type Tab = (typeof TABS)[number]

interface Props {
  profileId: string
  isOwnProfile: boolean
  isFriend: boolean
  currentUserId?: string
  currentUserProfile?: Profile | null
}

export default function ProfileTabs({
  profileId,
  isOwnProfile,
  isFriend,
  currentUserId,
  currentUserProfile,
}: Props) {
  const [active, setActive] = useState<Tab>('Wall')

  return (
    <div>
      <div className="flex border-b border-zinc-800 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              active === tab
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {active === 'Wall' && (
        <WallTab
          profileId={profileId}
          isOwnProfile={isOwnProfile}
          isFriend={isFriend}
          currentUserId={currentUserId}
          currentUserProfile={currentUserProfile}
        />
      )}

      {active === 'Friends' && (
        <FriendsTab profileId={profileId} isOwnProfile={isOwnProfile} />
      )}

      {active !== 'Wall' && active !== 'Friends' && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-10 text-center">
          <p className="text-zinc-500 text-sm">{active} coming soon.</p>
        </div>
      )}
    </div>
  )
}
