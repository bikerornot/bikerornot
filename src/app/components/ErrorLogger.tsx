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
    // Browser extension / autofill noise — not our code
    const IGNORE = [
      'setContactAutofillValuesFromBridge',
      'AutofillValuesFromBridge',
      'ResizeObserver loop',
    ]

    function shouldIgnore(msg: string | undefined) {
      if (!msg) return false
      return IGNORE.some((pattern) => msg.includes(pattern))
    }

    function handleError(event: ErrorEvent) {
      if (shouldIgnore(event.message) || shouldIgnore(event.error?.stack)) return
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
      if (shouldIgnore(err?.message) || shouldIgnore(err?.stack)) return
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
