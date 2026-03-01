import { getOnlineUsers } from '@/app/actions/admin'
import OnlineClient from './OnlineClient'

export const metadata = { title: 'Online Now — BikerOrNot Admin' }
export const dynamic = 'force-dynamic'

export default async function OnlinePage() {
  const users = await getOnlineUsers()

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <h1 className="text-2xl font-bold text-white">Online Now</h1>
        </div>
        <p className="text-zinc-500 text-sm mt-0.5 ml-5">
          Users active in the last 5 minutes · refreshes every 30s
        </p>
      </div>
      <OnlineClient initialUsers={users} />
    </div>
  )
}
