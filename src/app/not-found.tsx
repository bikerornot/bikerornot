import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-5xl font-bold text-white mb-2">404</h1>
        <p className="text-zinc-400 text-lg mb-6">
          This page could not be found. It may have been moved or no longer exists.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/signup"
            className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
          >
            Join BikerOrNot
          </Link>
          <Link
            href="/login"
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  )
}
