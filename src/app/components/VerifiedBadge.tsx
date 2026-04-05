'use client'

import { useState } from 'react'

export default function VerifiedBadge({ className }: { className?: string }) {
  const [showPopup, setShowPopup] = useState(false)

  return (
    <span className="relative inline-flex items-center" title="Verified">
      <svg
        className={`inline-block w-4 h-4 text-orange-500 flex-shrink-0 cursor-pointer ${className ?? ''}`}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-label="Verified"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setShowPopup((v) => !v)
        }}
      >
        <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
      {showPopup && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPopup(false)} />
          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-50 bg-zinc-800 border border-zinc-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
            Verified
          </div>
        </>
      )}
    </span>
  )
}
