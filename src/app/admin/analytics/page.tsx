import AnalyticsClient from './AnalyticsClient'

export const metadata = { title: 'Analytics — BikerOrNot Admin' }
export const dynamic = 'force-dynamic'

export default function AnalyticsPage() {
  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Growth Analytics</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Members, posts, and signups over time</p>
      </div>
      <AnalyticsClient />
    </div>
  )
}
