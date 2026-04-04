'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getImageUrl } from '@/lib/supabase/image'
import type { GameStats, LeaderboardEntry } from '@/app/actions/game'

interface Props {
  myStats: GameStats
  leaderboard: LeaderboardEntry[]
  currentUserId: string
}

export default function LeaderboardClient({ myStats, leaderboard, currentUserId }: Props) {
  const [tab, setTab] = useState<'all' | 'accuracy'>('all')

  const sorted = tab === 'accuracy'
    ? [...leaderboard].filter((e) => e.totalGames >= 10).sort((a, b) => b.accuracyPercent - a.accuracyPercent)
    : leaderboard

  const myRank = sorted.findIndex((e) => e.userId === currentUserId) + 1

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <svg className="w-6 h-6 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.44 9.03L15.41 5H11v2h3.59l2 2H5c-2.8 0-5 2.2-5 5s2.2 5 5 5c2.46 0 4.45-1.69 4.9-4h1.65l2.77-2.77c-.21.54-.32 1.14-.32 1.77 0 2.8 2.2 5 5 5s5-2.2 5-5c0-2.8-2.2-5-5-5-1.09 0-2.09.35-2.91.93L14.4 9.03h5.04zM5 17c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3zm14 0c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z" />
            </svg>
            Guess the Harley
          </h1>
          <p className="text-zinc-400 text-sm mt-0.5">How well do you know your Harleys?</p>
        </div>
        <Link
          href="/feed"
          className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          Play
        </Link>
      </div>

      {/* My Stats */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Your Stats</h2>
        {myStats.totalPlayed === 0 ? (
          <p className="text-zinc-500 text-sm">You haven't played yet. Find the game in your feed!</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-2xl font-bold text-white">{myStats.totalPlayed}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Games Played</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-400">{myStats.accuracyPercent}%</p>
              <p className="text-xs text-zinc-500 mt-0.5">Accuracy</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-orange-400">{myStats.currentStreak}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Current Streak</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-300">{myStats.bestStreak}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Best Streak</p>
            </div>
          </div>
        )}
        {myRank > 0 && (
          <p className="text-sm text-zinc-400 mt-3 border-t border-zinc-800 pt-3">
            You're ranked <span className="text-orange-400 font-semibold">#{myRank}</span> on the leaderboard
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5">
        <button
          onClick={() => setTab('all')}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
            tab === 'all' ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          Most Correct
        </button>
        <button
          onClick={() => setTab('accuracy')}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
            tab === 'accuracy' ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          Best Accuracy
        </button>
      </div>

      {/* Top 3 podium */}
      {sorted.length >= 3 && (
        <div className="flex items-end justify-center gap-3 py-2">
          {/* 2nd place */}
          <PodiumCard entry={sorted[1]} rank={2} />
          {/* 1st place */}
          <PodiumCard entry={sorted[0]} rank={1} />
          {/* 3rd place */}
          <PodiumCard entry={sorted[2]} rank={3} />
        </div>
      )}

      {/* Leaderboard list */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {sorted.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-zinc-500 text-sm">No scores yet. Be the first to play!</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {sorted.map((entry, idx) => {
              const rank = idx + 1
              const isMe = entry.userId === currentUserId
              const avatarUrl = entry.profilePhotoUrl
                ? getImageUrl('avatars', entry.profilePhotoUrl)
                : null

              return (
                <div
                  key={entry.userId}
                  className={`flex items-center gap-3 px-4 py-3 ${isMe ? 'bg-orange-500/5' : ''}`}
                >
                  {/* Rank */}
                  <div className={`w-7 text-center font-bold text-sm flex-shrink-0 ${
                    rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-zinc-400' : rank === 3 ? 'text-amber-600' : 'text-zinc-600'
                  }`}>
                    {rank}
                  </div>

                  {/* Avatar */}
                  <Link href={`/profile/${entry.username}`} className="flex-shrink-0">
                    <div className="w-9 h-9 rounded-full bg-zinc-700 overflow-hidden">
                      {avatarUrl ? (
                        <Image src={avatarUrl} alt="" width={36} height={36} className="object-cover w-full h-full" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold text-sm">
                          {entry.username?.[0]?.toUpperCase() ?? '?'}
                        </div>
                      )}
                    </div>
                  </Link>

                  {/* Name + games */}
                  <div className="flex-1 min-w-0">
                    <Link href={`/profile/${entry.username}`} className="text-sm font-semibold text-white hover:text-orange-400 transition-colors truncate block">
                      @{entry.username ?? 'unknown'}
                      {isMe && <span className="text-orange-400 ml-1">(you)</span>}
                    </Link>
                    <p className="text-xs text-zinc-500">{entry.totalGames} games</p>
                  </div>

                  {/* Score */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-white">{entry.correctCount}</p>
                    <p className="text-xs text-zinc-500">{entry.accuracyPercent}%</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {tab === 'accuracy' && sorted.length > 0 && (
        <p className="text-xs text-zinc-600 text-center">Minimum 10 games to qualify for accuracy ranking</p>
      )}
    </div>
  )
}

function PodiumCard({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  const avatarUrl = entry.profilePhotoUrl
    ? getImageUrl('avatars', entry.profilePhotoUrl)
    : null

  const ringColor = rank === 1 ? 'ring-yellow-400' : rank === 2 ? 'ring-zinc-400' : 'ring-amber-600'
  const size = rank === 1 ? 'w-16 h-16' : 'w-12 h-12'
  const medalSize = rank === 1 ? 'text-2xl' : 'text-lg'

  return (
    <Link href={`/profile/${entry.username}`} className="flex flex-col items-center gap-1 group">
      <div className="text-center mb-0.5">
        <span className={medalSize}>
          {rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}
        </span>
      </div>
      <div className={`${size} rounded-full overflow-hidden ring-2 ${ringColor} flex-shrink-0`}>
        {avatarUrl ? (
          <Image src={avatarUrl} alt="" width={64} height={64} className="object-cover w-full h-full" />
        ) : (
          <div className="w-full h-full bg-zinc-700 flex items-center justify-center text-zinc-400 font-bold">
            {entry.username?.[0]?.toUpperCase() ?? '?'}
          </div>
        )}
      </div>
      <p className="text-xs text-zinc-400 group-hover:text-orange-400 transition-colors truncate max-w-[80px] text-center">
        @{entry.username ?? '?'}
      </p>
      <p className="text-sm font-bold text-white">{entry.correctCount}</p>
      <p className="text-xs text-zinc-500">{entry.accuracyPercent}%</p>
    </Link>
  )
}
