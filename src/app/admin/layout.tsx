import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import AdminSidebar from './AdminSidebar'
import { getPendingFlagsCount } from '@/app/actions/scam-scan'

const ADMIN_ROLES = ['moderator', 'admin', 'super_admin']

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, username')
    .eq('id', user.id)
    .single()

  if (!profile || !ADMIN_ROLES.includes(profile.role)) redirect('/feed')

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [{ count: pendingReports }, { count: pendingDmca }, pendingFlags] = await Promise.all([
    admin.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('dmca_notices').select('*', { count: 'exact', head: true }).eq('status', 'received'),
    getPendingFlagsCount(),
  ])

  return (
    <div className="min-h-screen bg-zinc-950 md:flex">
      <AdminSidebar
        username={profile.username ?? user.email ?? 'admin'}
        role={profile.role}
        pendingReports={pendingReports ?? 0}
        pendingDmca={pendingDmca ?? 0}
        pendingFlags={pendingFlags}
      />
      <main className="flex-1 min-w-0 min-h-screen">
        {children}
      </main>
    </div>
  )
}
