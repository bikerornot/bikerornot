'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getGameRound, submitGameAnswer, getLeaderboard, type GameRound, type LeaderboardEntry } from '@/app/actions/game'
import { getImageUrl } from '@/lib/supabase/image'
import GameReportModal from './GameReportModal'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const TOTAL_ROUNDS = 10

function bikePhotoUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/bikes/${path}`
}

interface Props {
  currentUserId: string
}

type CardState =
  | { status: 'loading' }
  | { status: 'playing'; round: GameRound; startTime: number }
  | { status: 'answered'; round: GameRound; selectedIndex: number; isCorrect: boolean }
  | { status: 'finished' }
  | { status: 'empty' }

export default function GuessTheHarleyCard({ currentUserId }: Props) {
  const [state, setState] = useState<CardState>({ status: 'loading' })
  const [dismissed, setDismissed] = useState(false)
  const [totalPlayed, setTotalPlayed] = useState(0)
  const [totalCorrect, setTotalCorrect] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([])
  const [reportingPhotoId, setReportingPhotoId] = useState<string | null>(null)
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set())
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    loadRound()
  }, [])

  async function loadRound() {
    setState({ status: 'loading' })
    try {
      const round = await getGameRound()
      if (!round) {
        setState({ status: 'empty' })
        return
      }
      setState({ status: 'playing', round, startTime: Date.now() })
    } catch {
      setState({ status: 'empty' })
    }
  }

  async function handleAnswer(index: number) {
    if (state.status !== 'playing' || submitting) return
    setSubmitting(true)

    const { round, startTime } = state
    const isCorrect = index === round.correctIndex
    const timeTakenMs = Date.now() - startTime
    const newPlayed = totalPlayed + 1
    const newCorrect = totalCorrect + (isCorrect ? 1 : 0)

    setState({ status: 'answered', round, selectedIndex: index, isCorrect })
    setTotalPlayed(newPlayed)
    if (isCorrect) setTotalCorrect(newCorrect)

    try {
      await submitGameAnswer(round.photoId, round.options[index], isCorrect, timeTakenMs)
    } catch {
      // Answer still shown even if save fails
    } finally {
      setSubmitting(false)
    }
  }

  async function handleNext() {
    if (totalPlayed >= TOTAL_ROUNDS) {
      // Game over — show leaderboard preview
      setState({ status: 'loading' })
      try {
        const lb = await getLeaderboard(10)
        setLeaders(lb)
      } catch {
        // Show finished state even without leaderboard
      }
      setState({ status: 'finished' })
      return
    }
    fetchedRef.current = false
    await loadRound()
  }

  function handlePlayNewGame() {
    setTotalPlayed(0)
    setTotalCorrect(0)
    setLeaders([])
    fetchedRef.current = false
    loadRound()
  }

  if (dismissed || state.status === 'empty') return null

  const remaining = TOTAL_ROUNDS - totalPlayed

  return (
    <div className="bg-zinc-900 sm:border sm:border-zinc-800 overflow-hidden rounded-2xl">
      {reportingPhotoId && (
        <GameReportModal
          bikePhotoId={reportingPhotoId}
          onClose={() => setReportingPhotoId(null)}
          onSubmitted={() => {
            setReportedIds((prev) => new Set(prev).add(reportingPhotoId))
            setReportingPhotoId(null)
          }}
        />
      )}
      {/* Header — orange background */}
      <div className="flex items-center justify-between px-4 py-3 bg-orange-500">
        <div className="flex items-center gap-2.5">
          <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.44 9.03L15.41 5H11v2h3.59l2 2H5c-2.8 0-5 2.2-5 5s2.2 5 5 5c2.46 0 4.45-1.69 4.9-4h1.65l2.77-2.77c-.21.54-.32 1.14-.32 1.77 0 2.8 2.2 5 5 5s5-2.2 5-5c0-2.8-2.2-5-5-5-1.09 0-2.09.35-2.91.93L14.4 9.03h5.04zM5 17c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3zm14 0c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z" />
          </svg>
          <span className="text-lg font-bold text-white">What's That Bike?</span>
          {totalPlayed > 0 && state.status !== 'finished' && (
            <span className="text-xs font-bold text-white/80 bg-white/20 px-2 py-0.5 rounded-full">
              {totalCorrect}/{totalPlayed}
            </span>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-white/60 hover:text-white transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Loading */}
      {state.status === 'loading' && (
        <div className="aspect-video bg-zinc-800 flex items-center justify-center">
          <p className="text-zinc-500 text-sm">Loading...</p>
        </div>
      )}

      {/* Playing or Answered */}
      {(state.status === 'playing' || state.status === 'answered') && (
        <>
          {/* Bike photo */}
          <div className="relative aspect-video bg-zinc-800">
            <Image
              src={bikePhotoUrl(state.round.storagePath)}
              alt="Guess this bike"
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 640px"
            />
            {state.status === 'answered' && (
              <div className={`absolute inset-x-0 bottom-0 px-4 pb-3 pt-8 bg-gradient-to-t ${
                state.isCorrect ? 'from-emerald-900/80' : 'from-red-900/80'
              } to-transparent`}>
                <p className="text-white text-lg font-bold">
                  {state.isCorrect ? 'Correct!' : 'Not quite!'}
                </p>
                {!state.isCorrect && (
                  <p className="text-zinc-200 text-sm mt-0.5">
                    It's a {state.round.options[state.round.correctIndex]}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Answer buttons */}
          <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {state.round.options.map((option, idx) => {
              let btnClass = 'w-full text-left px-4 py-3 rounded-xl text-base font-medium transition-colors border '

              if (state.status === 'playing') {
                btnClass += 'border-zinc-700 bg-zinc-800 text-white hover:border-orange-500 hover:bg-orange-500/10 hover:shadow-[0_0_12px_rgba(249,115,22,0.25)] cursor-pointer'
              } else {
                const isCorrect = idx === state.round.correctIndex
                const isSelected = idx === state.selectedIndex

                if (isCorrect) {
                  btnClass += 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                } else if (isSelected && !isCorrect) {
                  btnClass += 'border-red-500 bg-red-500/15 text-red-400'
                } else {
                  btnClass += 'border-zinc-800 bg-zinc-800/50 text-zinc-600'
                }
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleAnswer(idx)}
                  disabled={state.status === 'answered'}
                  className={btnClass}
                >
                  {option}
                </button>
              )
            })}
          </div>

          {/* Next button */}
          {state.status === 'answered' && (
            <div className="px-4 pb-4">
              <button
                onClick={handleNext}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
              >
                {remaining > 0
                  ? `Next \u203A ${remaining} remaining`
                  : 'See Results \u203A'}
              </button>
              {!reportedIds.has(state.round.photoId) ? (
                <button
                  onClick={() => setReportingPhotoId(state.round.photoId)}
                  className="w-full text-xs text-zinc-500 hover:text-zinc-300 mt-3 transition-colors"
                >
                  Report this bike
                </button>
              ) : (
                <p className="text-center text-xs text-zinc-500 mt-3">Thanks — we&rsquo;ll take a look.</p>
              )}
            </div>
          )}
        </>
      )}

      {/* Finished — results + leaderboard preview */}
      {state.status === 'finished' && (
        <div className="px-4 py-6">
          {/* Score summary */}
          <div className="text-center mb-5">
            <p className="text-3xl font-bold text-white">{totalCorrect}/{TOTAL_ROUNDS}</p>
            <p className="text-zinc-400 text-sm mt-1">
              {totalCorrect >= 8 ? 'Impressive! You know your bikes.' :
               totalCorrect >= 5 ? 'Not bad! Keep playing to improve.' :
               'Keep at it — you\'ll get better!'}
            </p>
          </div>

          {/* Leaderboard preview */}
          {leaders.length > 0 && (
            <div className="mb-5">
              <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-3 text-center">Top Players</p>
              <div className="flex justify-center gap-3 flex-wrap">
                {leaders.slice(0, 8).map((entry, idx) => {
                  const avatarUrl = entry.profilePhotoUrl
                    ? getImageUrl('avatars', entry.profilePhotoUrl)
                    : null
                  return (
                    <Link key={entry.userId} href={`/profile/${entry.username}`} className="flex flex-col items-center gap-1 group">
                      <div className={`w-10 h-10 rounded-full overflow-hidden flex-shrink-0 ${
                        idx === 0 ? 'ring-2 ring-yellow-400' : idx === 1 ? 'ring-2 ring-zinc-400' : idx === 2 ? 'ring-2 ring-amber-600' : 'ring-1 ring-zinc-700'
                      }`}>
                        {avatarUrl ? (
                          <Image src={avatarUrl} alt={entry.username ?? ''} width={40} height={40} className="object-cover w-full h-full" />
                        ) : (
                          <div className="w-full h-full bg-zinc-700 flex items-center justify-center text-zinc-400 text-xs font-bold">
                            {entry.username?.[0]?.toUpperCase() ?? '?'}
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-zinc-500 group-hover:text-orange-400 transition-colors truncate max-w-[60px]">
                        {entry.username ?? '?'}
                      </span>
                    </Link>
                  )
                })}
              </div>
              <div className="text-center mt-6 mb-4">
                <Link
                  href="/game"
                  className="inline-block text-base text-orange-400 hover:text-orange-300 font-semibold transition-colors py-2 px-4"
                >
                  See Full Leaderboard &rsaquo;
                </Link>
              </div>
            </div>
          )}

          {/* Play again */}
          <button
            onClick={handlePlayNewGame}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-xl transition-colors text-base"
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  )
}
