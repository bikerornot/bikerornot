'use client'

import { useState } from 'react'
import Link from 'next/link'
import { markRead } from '@/app/actions/notifications'

interface TakedownNotification {
  id: string
  content_url: string | null
}

export default function DmcaBanner({
  takedowns,
}: {
  takedowns: TakedownNotification[]
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const visible = takedowns.filter((n) => !dismissed.has(n.id))
  if (visible.length === 0) return null

  async function dismiss(id: string) {
    setDismissed((prev) => new Set([...prev, id]))
    markRead(id)
  }

  return (
    <div className="space-y-2 mb-4">
      {visible.map((n) => (
        <div
          key={n.id}
          className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3"
        >
          {/* Icon */}
          <svg
            className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-amber-300 text-sm font-semibold leading-snug">
              Content removed — copyright complaint
            </p>
            <p className="text-amber-400/80 text-xs mt-0.5 leading-relaxed">
              A piece of content you posted was removed following a DMCA takedown notice.
              {' '}If you believe this was a mistake, you have the right to submit a counter-notice.
            </p>
            {n.content_url && (
              <p className="text-amber-500/60 text-xs mt-1 font-mono truncate">
                {n.content_url}
              </p>
            )}
            <Link
              href="/dmca/counter-notice"
              className="inline-block mt-2 text-xs font-semibold text-amber-300 hover:text-amber-200 underline underline-offset-2 transition-colors"
            >
              Learn about your rights &amp; submit a counter-notice →
            </Link>
          </div>

          {/* Dismiss */}
          <button
            onClick={() => dismiss(n.id)}
            className="flex-shrink-0 p-1 text-amber-500/60 hover:text-amber-300 transition-colors"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
