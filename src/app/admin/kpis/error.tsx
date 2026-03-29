'use client'

export default function KpisError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-xl font-bold text-red-400 mb-2">KPI Dashboard Error</h1>
      <p className="text-zinc-400 text-sm mb-4">{error.message}</p>
      <button onClick={reset} className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
        Retry
      </button>
    </div>
  )
}
