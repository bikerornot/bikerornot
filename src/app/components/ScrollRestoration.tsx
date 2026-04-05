'use client'

import { useEffect } from 'react'
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

  useEffect(() => {
    // On mount / route change: restore saved scroll for this path
    const map = getScrollMap()
    const saved = map[pathname]

    if (saved && saved > 0) {
      // Disable browser auto-scroll
      if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual'
      }

      // Wait for content to render, then restore
      const timer = setTimeout(() => {
        window.scrollTo(0, saved)
      }, 0)

      // Also retry after images load
      const timer2 = setTimeout(() => {
        if (window.scrollY < saved - 100) {
          window.scrollTo(0, saved)
        }
      }, 300)

      return () => {
        clearTimeout(timer)
        clearTimeout(timer2)
      }
    }
  }, [pathname])

  useEffect(() => {
    // Continuously save scroll position for current path
    let timer: ReturnType<typeof setTimeout>
    function onScroll() {
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
      // Save final position on unmount
      const map = getScrollMap()
      map[pathname] = window.scrollY
      saveScrollMap(map)
    }
  }, [pathname])

  return null
}
