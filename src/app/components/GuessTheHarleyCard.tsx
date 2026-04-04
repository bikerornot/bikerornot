'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getGameRound, submitGameAnswer, type GameRound } from '@/app/actions/game'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

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
  | { status: 'empty' }

export default function GuessTheHarleyCard({ currentUserId }: Props) {
  const [state, setState] = useState<CardState>({ status: 'loading' })
  const [dismissed, setDismissed] = useState(false)
  const [streak, setStreak] = useState(0)
  const [totalPlayed, setTotalPlayed] = useState(0)
  const [totalCorrect, setTotalCorrect] = useState(0)
  const [submitting, setSubmitting] = useState(false)
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

    setState({ status: 'answered', round, selectedIndex: index, isCorrect })
    setTotalPlayed((n) => n + 1)

    if (isCorrect) {
      setTotalCorrect((n) => n + 1)
      setStreak((s) => s + 1)
    } else {
      setStreak(0)
    }

    try {
      await submitGameAnswer(
        round.photoId,
        round.options[index],
        isCorrect,
        timeTakenMs
      )
    } catch {
      // Answer still shown even if save fails
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePlayAgain() {
    fetchedRef.current = false
    await loadRound()
  }

  if (dismissed || state.status === 'empty') return null

  return (
    <div className="bg-zinc-900 sm:border sm:border-zinc-800 overflow-hidden rounded-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.44 9.03L15.41 5H11v2h3.59l2 2H5c-2.8 0-5 2.2-5 5s2.2 5 5 5c2.46 0 4.45-1.69 4.9-4h1.65l2.77-2.77c-.21.54-.32 1.14-.32 1.77 0 2.8 2.2 5 5 5s5-2.2 5-5c0-2.8-2.2-5-5-5-1.09 0-2.09.35-2.91.93L14.4 9.03h5.04zM5 17c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3zm14 0c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z" />
          </svg>
          <span className="text-sm font-semibold text-white">Guess the Harley</span>
          {totalPlayed > 0 && (
            <span className="text-xs font-bold text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded-full">
              {totalCorrect}/{totalPlayed} correct
            </span>
          )}
          {streak > 1 && (
            <span className="text-xs font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">
              {streak} streak
            </span>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-zinc-600 hover:text-zinc-400 transition-colors"
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
              alt="Guess this Harley-Davidson"
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
                btnClass += 'border-zinc-700 bg-zinc-800 text-white hover:border-orange-500 hover:bg-orange-500/10'
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

          {/* After answering — play again + leaderboard */}
          {state.status === 'answered' && (
            <div className="px-4 pb-4 flex gap-3">
              <button
                onClick={handlePlayAgain}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
              >
                Next &rsaquo;
              </button>
              <Link
                href="/game"
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold py-2.5 rounded-xl transition-colors text-sm text-center border border-zinc-700"
              >
                Leaderboard
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}
