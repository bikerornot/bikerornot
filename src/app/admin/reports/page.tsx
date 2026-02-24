import { getContentReports } from '@/app/actions/reports'
import ReportQueue from './ReportQueue'

export const metadata = { title: 'Reports — BikerOrNot Admin' }

export default async function AdminReportsPage() {
  const reports = await getContentReports()

  const totalReports = reports.reduce((sum, r) => sum + r.report_count, 0)

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Pending Reports</h1>
        <p className="text-zinc-500 text-sm mt-0.5">
          {reports.length === 0
            ? 'Nothing to review — all clear'
            : `${reports.length} item${reports.length === 1 ? '' : 's'} · ${totalReports} report${totalReports === 1 ? '' : 's'} total`}
        </p>
      </div>

      <ReportQueue initialReports={reports} />
    </div>
  )
}
