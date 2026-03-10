import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPendingFriendRequests, getMyFriends } from '@/app/actions/friends'
import FriendsClient from './FriendsClient'

export default async function FriendsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [requests, friends] = await Promise.all([
    getPendingFriendRequests(),
    getMyFriends(),
  ])

  return (
    <div className="min-h-screen bg-black pb-20 sm:pb-0">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-white mb-6">Friends</h1>
        <FriendsClient initialRequests={requests} initialFriends={friends} />
      </div>
    </div>
  )
}
