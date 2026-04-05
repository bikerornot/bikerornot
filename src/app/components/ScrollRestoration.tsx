'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

const SCROLL_KEY = 'bon_scroll_positions'

function getScrollMap(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(SCROLL_KEY) ?? '{}')
  } catch { return {} }
}

function saveScrollMap(map: Record<string, number>) {
  try {
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify(map))
  } catch { /* ignore */ }
}

export default function ScrollRestoration() {
  const pathname = usePathname()
  const isRestoring = useRef(false)

  // Set manual scroll restoration once on mount
  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }
  }, [])

  useEffect(() => {
    const map = getScrollMap()
    const saved = map[pathname]

    if (saved && saved > 0) {
      isRestoring.current = true

      // Override scrollTo to block Next.js scroll-to-top during restoration
      const original = window.scrollTo
      const override = function(...args: any[]) {
        if (isRestoring.current) {
          // Check if this is a scroll-to-top call — block it
          const y = typeof args[0] === 'number' ? (args[1] ?? 0) : (args[0]?.top ?? 0)
          if (y === 0) return
        }
        return original.apply(window, args as any)
      } as typeof window.scrollTo
      window.scrollTo = override

      // Restore at multiple intervals to beat Next.js timing
      const timers = [0, 50, 150, 300, 500].map((delay) =>
        setTimeout(() => {
          original.call(window, 0, saved)
        }, delay)
      )

      // Stop blocking after restoration window
      const cleanup = setTimeout(() => {
        isRestoring.current = false
        window.scrollTo = original
      }, 600)

      return () => {
        timers.forEach(clearTimeout)
        clearTimeout(cleanup)
        isRestoring.current = false
        window.scrollTo = original
      }
    }
  }, [pathname])

  useEffect(() => {
    // Continuously save scroll position for current path
    let timer: ReturnType<typeof setTimeout>
    function onScroll() {
      if (isRestoring.current) return // Don't save during restoration
      clearTimeout(timer)
      timer = setTimeout(() => {
        const map = getScrollMap()
        map[pathname] = window.scrollY
        saveScrollMap(map)
      }, 200)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (!isRestoring.current) {
        const map = getScrollMap()
        map[pathname] = window.scrollY
        saveScrollMap(map)
      }
    }
  }, [pathname])

  return null
}
