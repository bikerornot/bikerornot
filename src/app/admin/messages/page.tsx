import { getAdminMessages } from '@/app/actions/admin'
import MessagesClient from './MessagesClient'

export default async function AdminMessagesPage() {
  const { messages, hasMore } = await getAdminMessages(0, 50)

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">All Messages</h1>
        <p className="text-zinc-400 text-sm mt-1">
          All direct messages sent on the platform, newest first.
        </p>
      </div>
      <MessagesClient initialMessages={messages} initialHasMore={hasMore} />
    </div>
  )
}
