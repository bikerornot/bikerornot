'use client'

import { useEffect } from 'react'
import { logError } from '@/app/actions/errors'

/**
 * Global error logger — catches unhandled JS errors and promise rejections
 * that aren't caught by React error boundaries.
 * Mount once in the root layout.
 */
export default function ErrorLogger() {
  useEffect(() => {
    function handleError(event: ErrorEvent) {
      logError({
        source: 'client',
        message: event.message || 'Unhandled error',
        stack: event.error?.stack ?? null,
        url: window.location.href,
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      }).catch(() => {})
    }

    function handleRejection(event: PromiseRejectionEvent) {
      const err = event.reason
      logError({
        source: 'client',
        message: err?.message ?? String(err) ?? 'Unhandled promise rejection',
        stack: err?.stack ?? null,
        url: window.location.href,
        metadata: { type: 'unhandledrejection' },
      }).catch(() => {})
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)
    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  return null
}
