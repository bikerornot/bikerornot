import { getReports } from '@/app/actions/reports'
import ReportQueue from './ReportQueue'

export const metadata = { title: 'Reports — BikerOrNot Admin' }

export default async function AdminReportsPage() {
  const reports = await getReports()

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Pending Reports</h1>
        <p className="text-zinc-500 text-sm mt-0.5">
          {reports.length === 0
            ? 'Nothing to review — all clear'
            : `${reports.length} report${reports.length === 1 ? '' : 's'} awaiting review`}
        </p>
      </div>

      <ReportQueue initialReports={reports} />
    </div>
  )
}
