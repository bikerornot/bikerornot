import { getWatchlist } from '@/app/actions/admin'
import WatchlistClient from './WatchlistClient'

export const metadata = { title: 'Watchlist — BikerOrNot Admin' }

export default async function WatchlistPage() {
  const entries = await getWatchlist()

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Watchlist</h1>
        <p className="text-zinc-500 text-sm mt-0.5">
          Users under suspicion — monitor their activity before taking action.
        </p>
      </div>
      <WatchlistClient initialEntries={entries} />
    </div>
  )
}
