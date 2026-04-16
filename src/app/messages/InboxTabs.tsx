'use client'

import { useState } from 'react'
import ConversationList from './ConversationList'
import type { ConversationSummary } from '@/lib/supabase/types'

interface Props {
  initialConversations: ConversationSummary[]
  initialRequests: ConversationSummary[]
  currentUserId: string
}

export default function InboxTabs({ initialConversations, initialRequests, currentUserId }: Props) {
  const [tab, setTab] = useState<'messages' | 'requests'>('messages')
  const requestCount = initialRequests.length

  return (
    <div>
      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 mb-4">
        <button
          onClick={() => setTab('messages')}
          className={`flex-1 py-2 px-4 text-sm font-semibold rounded-lg transition-colors ${
            tab === 'messages' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Messages
        </button>
        <button
          onClick={() => setTab('requests')}
          className={`flex-1 py-2 px-4 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 ${
            tab === 'requests' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Requests
          {requestCount > 0 && (
            <span className="bg-orange-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">
              {requestCount}
            </span>
          )}
        </button>
      </div>

      {tab === 'messages' ? (
        <ConversationList initialConversations={initialConversations} currentUserId={currentUserId} mode="inbox" />
      ) : (
        <ConversationList initialConversations={initialRequests} currentUserId={currentUserId} mode="requests" />
      )}
    </div>
  )
}
