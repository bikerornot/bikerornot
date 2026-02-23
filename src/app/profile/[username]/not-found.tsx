import Link from 'next/link'

export default function ProfileNotFound() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">🏍️</div>
        <h1 className="text-2xl font-bold text-white mb-2">Rider not found</h1>
        <p className="text-zinc-400 mb-6">
          We couldn&apos;t find anyone with that username.
        </p>
        <Link
          href="/"
          className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          Back to home
        </Link>
      </div>
    </div>
  )
}
