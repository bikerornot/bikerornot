'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'
import { logError } from '@/app/actions/errors'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('App error:', error)
    Sentry.captureException(error)
    logError({
      source: 'client',
      message: error.message || 'Unknown error',
      stack: error.stack ?? null,
      url: typeof window !== 'undefined' ? window.location.href : null,
      metadata: error.digest ? { digest: error.digest } : {},
    }).catch(() => {})
  }, [error])

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-5">
          <svg className="w-6 h-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="text-white text-xl font-bold mb-2">Something went wrong</h1>
        <p className="text-zinc-400 text-sm mb-5 leading-relaxed">
          An unexpected error occurred. Please try again.
        </p>
        {error.digest && (
          <p className="text-zinc-600 text-xs mb-5 font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <button
            onClick={reset}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
          >
            Try again
          </button>
          <Link
            href="/feed"
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium py-2.5 rounded-xl transition-colors block"
          >
            Go to feed
          </Link>
        </div>
      </div>
    </div>
  )
}
