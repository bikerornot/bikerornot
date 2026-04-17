import { listDealers, listDealerStates, getDealerStats } from '@/app/actions/hd-dealers'
import DealersClient from './DealersClient'

export const metadata = { title: 'HD Dealers – Admin' }

export default async function DealersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string; country?: string; page?: string }>
}) {
  const sp = await searchParams
  const page = Math.max(parseInt(sp.page ?? '1', 10) || 1, 1)
  const limit = 50
  const offset = (page - 1) * limit

  const [initial, states, stats] = await Promise.all([
    listDealers({
      search: sp.q,
      state: sp.state || null,
      country: sp.country || 'USA',
      limit,
      offset,
    }),
    listDealerStates('USA'),
    getDealerStats(),
  ])

  return (
    <div className="p-6 max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Harley-Davidson Dealers</h1>
        <p className="text-zinc-400 text-sm mt-1">
          {stats.us} US dealers · {stats.total} worldwide · {stats.contacts} contacts · {stats.active} active
        </p>
      </div>
      <DealersClient
        initialRows={initial.rows}
        initialTotal={initial.total}
        initialContactCounts={initial.contactCounts}
        states={states}
        pageSize={limit}
        initialPage={page}
        initialFilters={{
          search: sp.q ?? '',
          state: sp.state ?? '',
          country: sp.country ?? 'USA',
        }}
      />
    </div>
  )
}
