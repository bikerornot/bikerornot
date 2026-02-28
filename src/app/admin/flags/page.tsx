import { getFlaggedContent } from '@/app/actions/scam-scan'
import FlagsClient from './FlagsClient'

export default async function FlagsPage() {
  const flags = await getFlaggedContent()

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">AI Scam Flags</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Messages flagged by AI scam detection. Scores ≥ 85% trigger auto-ban.
        </p>
      </div>
      <FlagsClient initialFlags={flags} />
    </div>
  )
}
