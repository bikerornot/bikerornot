'use client'

export default function AnalyticsError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-2xl font-bold text-white mb-4">Growth Analytics</h1>
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
        <p className="text-red-400 font-semibold mb-2">Something went wrong</p>
        <p className="text-zinc-400 text-sm mb-4">{error.message}</p>
        <button
          onClick={reset}
          className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
