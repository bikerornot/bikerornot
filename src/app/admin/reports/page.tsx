import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getReports } from '@/app/actions/reports'
import ReportQueue from './ReportQueue'

export const metadata = { title: 'Reports — BikerOrNot Admin' }

export default async function AdminReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, username')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'moderator'].includes(profile.role)) {
    redirect('/feed')
  }

  const reports = await getReports()

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/feed" className="text-xl font-bold text-white tracking-tight">
              BikerOrNot
            </Link>
            <span className="text-zinc-700">·</span>
            <span className="text-sm text-orange-400 font-semibold">Admin</span>
          </div>
          <Link
            href="/feed"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Back to feed
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Pending Reports</h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              {reports.length === 0
                ? 'Nothing to review'
                : `${reports.length} report${reports.length === 1 ? '' : 's'} awaiting review`}
            </p>
          </div>
        </div>

        <ReportQueue initialReports={reports} />
      </div>
    </div>
  )
}
