'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getImageUrl } from '@/lib/supabase/image'
import type { BirthdayFriend } from '@/app/actions/friends'

interface Props {
  birthdays: BirthdayFriend[]
}

function getDismissKey(birthdays: BirthdayFriend[]) {
  const today = new Date().toISOString().slice(0, 10)
  const ids = birthdays.map((b) => b.id).sort().join(',')
  return `birthdayCard:dismissed:${today}:${ids}`
}

export default function BirthdayCard({ birthdays }: Props) {
  const dismissKey = useMemo(() => getDismissKey(birthdays), [birthdays])
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    if (birthdays.length === 0) return
    setDismissed(localStorage.getItem(dismissKey) === '1')
  }, [dismissKey, birthdays.length])

  const handleDismiss = () => {
    try {
      localStorage.setItem(dismissKey, '1')
    } catch {}
    setDismissed(true)
  }

  if (birthdays.length === 0 || dismissed) return null

  return (
    <div className="bg-zinc-900 sm:rounded-xl sm:border sm:border-zinc-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎂</span>
          <p className="text-white text-sm font-semibold">
            {birthdays.length === 1
              ? 'A friend has a birthday today!'
              : `${birthdays.length} friends have birthdays today!`}
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="space-y-3">
        {birthdays.map((friend) => {
          const photo = friend.profile_photo_url
            ? getImageUrl('avatars', friend.profile_photo_url)
            : null

          return (
            <div key={friend.id} className="flex items-center gap-3">
              <Link href={`/profile/${friend.username}`} className="flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden">
                  {photo ? (
                    <Image
                      src={photo}
                      alt=""
                      width={40}
                      height={40}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold text-sm">
                      {(friend.username?.[0] ?? '?').toUpperCase()}
                    </div>
                  )}
                </div>
              </Link>
              <div className="flex-1 min-w-0">
                <Link href={`/profile/${friend.username}`} className="hover:underline">
                  <span className="text-white text-sm font-medium">@{friend.username}</span>
                </Link>
                <p className="text-zinc-500 text-sm">Wish them a happy birthday!</p>
              </div>
              <Link
                href={`/profile/${friend.username}`}
                className="flex-shrink-0 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                View Profile
              </Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}
