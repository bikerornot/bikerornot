import { createClient as createServiceClient } from '@supabase/supabase-js'
import DmcaQueue from './DmcaQueue'

export const metadata = { title: 'DMCA Notices — Admin' }

export default async function AdminDmcaPage() {
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [{ data: notices }, { data: counterNotices }] = await Promise.all([
    admin
      .from('dmca_notices')
      .select('*')
      .order('created_at', { ascending: false }),
    admin
      .from('dmca_counter_notices')
      .select('*, profile:profiles!user_id(id, username, first_name, last_name, profile_photo_url)')
      .order('created_at', { ascending: false }),
  ])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">DMCA Notices</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Copyright takedown notices submitted by rights holders.
        </p>
      </div>

      {/* Status summary */}
      {notices && notices.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {(['received', 'reviewing', 'actioned', 'dismissed'] as const).map((status) => {
            const count = notices.filter((n) => n.status === status).length
            const colors: Record<string, string> = {
              received:  'border-blue-500/30 text-blue-400',
              reviewing: 'border-yellow-500/30 text-yellow-400',
              actioned:  'border-green-500/30 text-green-400',
              dismissed: 'border-zinc-700 text-zinc-500',
            }
            return (
              <div key={status} className={`bg-zinc-900 rounded-xl border p-4 text-center ${colors[status]}`}>
                <p className="text-2xl font-black">{count}</p>
                <p className="text-xs capitalize mt-0.5">{status}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Counter-notice summary badge */}
      {counterNotices && counterNotices.filter((cn) => cn.status === 'received').length > 0 && (
        <div className="mb-4 flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-amber-300 text-sm">
            <span className="font-bold">{counterNotices.filter((cn) => cn.status === 'received').length}</span>
            {' '}counter-notice{counterNotices.filter((cn) => cn.status === 'received').length !== 1 ? 's' : ''} awaiting review
          </p>
        </div>
      )}

      <DmcaQueue initialNotices={notices ?? []} initialCounterNotices={counterNotices ?? []} />
    </div>
  )
}
