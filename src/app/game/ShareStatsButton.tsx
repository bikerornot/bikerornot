'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { shareGameResult } from '@/app/actions/game-share'

interface Props {
  disabled?: boolean
}

export default function ShareStatsButton({ disabled }: Props) {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const router = useRouter()

  async function handleShare() {
    if (loading || disabled) return
    setLoading(true)
    setStatus('idle')
    setErrorMsg('')
    try {
      const res = await shareGameResult()
      if ('error' in res) {
        setStatus('error')
        setErrorMsg(res.error)
        return
      }
      setStatus('success')
      setTimeout(() => router.push('/feed'), 700)
    } catch (e: unknown) {
      setStatus('error')
      setErrorMsg(e instanceof Error ? e.message : 'Could not share')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleShare}
        disabled={loading || disabled || status === 'success'}
        className={`w-full text-sm font-semibold py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 ${
          status === 'success'
            ? 'bg-emerald-500/20 text-emerald-400 cursor-default'
            : 'bg-orange-500 hover:bg-orange-600 text-white disabled:bg-zinc-700 disabled:text-zinc-500'
        }`}
      >
        {status === 'success' ? (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Shared to feed
          </>
        ) : loading ? (
          <>Sharing…</>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
            </svg>
            Share My Stats to Feed
          </>
        )}
      </button>
      {status === 'error' && (
        <p className="text-red-400 text-xs text-center">{errorMsg}</p>
      )}
    </div>
  )
}
