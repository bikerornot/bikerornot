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
      'Script error',
      'Failed to fetch',
      'ChunkLoadError',
      'Load failed',
      'WebKit.MessageHandlers',
      'Java object is gone',
    ]

    // Bare rejection with no real info — Safari often swallows the details
    const IGNORE_EXACT = ['Unhandled promise rejection']

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

      let message = 'Unhandled promise rejection'
      let stack: string | null = null
      const metadata: Record<string, unknown> = { type: 'unhandledrejection' }

      if (err instanceof Error) {
        message = err.message || message
        stack = err.stack ?? null
      } else if (typeof err === 'string') {
        message = err
      } else if (err != null) {
        // Capture non-Error rejection reasons (Response objects, plain objects, etc.)
        try {
          message = String(err)
          metadata.reason = JSON.stringify(err, null, 2).slice(0, 2000)
        } catch {
          message = typeof err + ': ' + String(err)
        }
        if (err.status) metadata.status = err.status
        if (err.statusText) metadata.statusText = err.statusText
        if (err.url) metadata.responseUrl = err.url
      }

      // Skip bare rejections with no useful info
      if (IGNORE_EXACT.includes(message) && !stack) return
      // Also check metadata.reason for ignored patterns (e.g. wrapped Failed to fetch)
      const reasonStr = typeof metadata.reason === 'string' ? metadata.reason : ''
      if (shouldIgnore(message) || shouldIgnore(reasonStr)) return

      logError({
        source: 'client',
        message,
        stack,
        url: window.location.href,
        metadata,
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
