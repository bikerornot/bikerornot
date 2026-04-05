'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useCallback } from 'react'

interface Props {
  children: React.ReactNode
}

export default function ModalOverlay({ children }: Props) {
  const router = useRouter()

  const close = useCallback(() => {
    router.back()
  }, [router])

  // Close on Escape key
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [close])

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Backdrop — click to close */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={close}
      />

      {/* Modal content */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Close button */}
        <div className="flex justify-end px-4 py-3">
          <button
            onClick={close}
            className="bg-zinc-800/80 hover:bg-zinc-700 text-white rounded-full w-10 h-10 flex items-center justify-center shadow-lg transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto">
          <div className="min-h-full bg-zinc-950 rounded-t-2xl sm:rounded-2xl sm:mx-auto sm:max-w-2xl sm:my-4 sm:mb-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
