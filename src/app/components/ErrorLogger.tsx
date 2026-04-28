'use client'

import { useEffect } from 'react'
import { logError } from '@/app/actions/errors'

// Ring buffers of recent context, packed into metadata when an error fires.
// Live at module scope so they survive React re-renders within the same tab.
// Bounded so a long-running tab doesn't bloat memory.
const NAV_BUFFER: string[] = []
const CLICK_BUFFER: string[] = []
const NAV_LIMIT = 8
const CLICK_LIMIT = 8

function pushBounded(buf: string[], val: string, limit: number) {
  buf.push(val)
  if (buf.length > limit) buf.shift()
}

function describeElement(el: Element | null): string {
  if (!el) return ''
  const tag = el.tagName.toLowerCase()
  const id = el.id ? `#${el.id}` : ''
  // Take only the first className token (Tailwind chains are noisy)
  const classes = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).map((c) => `.${c}`).join('') : ''
  // Trim and grab visible text snippet — useful for "which button"
  const text = (el.textContent ?? '').trim().slice(0, 40).replace(/\s+/g, ' ')
  return `${tag}${id}${classes}${text ? `[${text}]` : ''}`
}

/**
 * Global error logger — catches unhandled JS errors and promise rejections
 * that aren't caught by React error boundaries.
 * Mount once in the root layout.
 */
export default function ErrorLogger() {
  useEffect(() => {
    // Seed with the current URL so the first error has at least one breadcrumb.
    pushBounded(NAV_BUFFER, window.location.pathname + window.location.search, NAV_LIMIT)

    // Track navigation breadcrumbs. Next.js uses History API for client-side
    // routing; popstate fires on back/forward, and pushState/replaceState are
    // monkey-patched here so soft pushes get tracked too.
    const onPopstate = () => pushBounded(NAV_BUFFER, window.location.pathname + window.location.search, NAV_LIMIT)
    const origPush = history.pushState
    const origReplace = history.replaceState
    history.pushState = function (...args) {
      const r = origPush.apply(this, args as Parameters<History['pushState']>)
      pushBounded(NAV_BUFFER, window.location.pathname + window.location.search, NAV_LIMIT)
      return r
    }
    history.replaceState = function (...args) {
      const r = origReplace.apply(this, args as Parameters<History['replaceState']>)
      pushBounded(NAV_BUFFER, window.location.pathname + window.location.search, NAV_LIMIT)
      return r
    }
    window.addEventListener('popstate', onPopstate)

    // Click breadcrumbs — capture the element the user just interacted with.
    // Selectors only, no input values, so we don't accidentally log secrets.
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      const desc = describeElement(target)
      if (desc) pushBounded(CLICK_BUFFER, desc, CLICK_LIMIT)
    }
    document.addEventListener('click', onClick, true)

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
      'webkit.messageHandlers',
      'messageHandlers',
      'unexpected response was received from the server',
      'Java object is gone',
      'Navigator LockManager',
      'invalid origin',
      'DuckDuckGo',
      'The request was denied',
      // Firefox internal module loader timeouts — one flaky Firefox user produced 20k+ of these
      'Module load timeout',
      // Stale deployment — user's cached HTML references a chunk that no longer exists
      'Failed to load chunk',
      // Stale deployment — user submits a server action ID from a previous build
      'was not found on the server',
      // Firefox private mode / storage access denied — not actionable
      'The operation is insecure',
      // Generic network noise (Safari, mobile), no stack, not actionable
      'network error',
      // Firefox-specific network failure wording
      'NetworkError when attempting to fetch resource',
      // React DOM race during unmount — not actionable, usually benign
      "Failed to execute 'removeChild' on 'Node'",
      "reading 'removeChild'",
      // Next.js production wrapper — real error is scrubbed, zero signal.
      // The actual issue (when there is one) shows up in Vercel runtime logs.
      'An error occurred in the Server Components render',
      // MetaMask browser extension failing to connect — not our code
      'Failed to connect to MetaMask',
    ]

    // Bare rejection with no real info — Safari often swallows the details
    const IGNORE_EXACT = ['Unhandled promise rejection', 'undefined', '[object Object]', '{}']

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
          pathname: window.location.pathname,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          navHistory: NAV_BUFFER.slice(),
          clickHistory: CLICK_BUFFER.slice(),
        },
      }).catch(() => {})
    }

    function handleRejection(event: PromiseRejectionEvent) {
      const err = event.reason
      if (shouldIgnore(err?.message) || shouldIgnore(err?.stack)) return

      let message = 'Unhandled promise rejection'
      let stack: string | null = null
      const metadata: Record<string, unknown> = {
        type: 'unhandledrejection',
        pathname: window.location.pathname,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        navHistory: NAV_BUFFER.slice(),
        clickHistory: CLICK_BUFFER.slice(),
      }

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
      // Skip rejections where the reason is an empty object (in-app browser noise)
      const reasonStr = typeof metadata.reason === 'string' ? metadata.reason : ''
      if (reasonStr === '{}' && !stack) return
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
      window.removeEventListener('popstate', onPopstate)
      document.removeEventListener('click', onClick, true)
      history.pushState = origPush
      history.replaceState = origReplace
    }
  }, [])

  return null
}
