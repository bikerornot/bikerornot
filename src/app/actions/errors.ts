'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface ErrorLogInput {
  source: 'client' | 'server' | 'server_action' | 'api'
  message: string
  stack?: string | null
  url?: string | null
  metadata?: Record<string, unknown>
}

/** Log an error to the error_logs table. Fire-and-forget safe. */
export async function logError(input: ErrorLogInput): Promise<void> {
  try {
    const admin = getServiceClient()

    // Try to get current user (may fail if not authenticated — that's fine)
    let userId: string | null = null
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      userId = user?.id ?? null
    } catch {
      // Not authenticated — that's OK
    }

    let userAgent: string | null = null
    try {
      const h = await headers()
      userAgent = h.get('user-agent')
    } catch {
      // Headers not available outside request context
    }

    await admin.from('error_logs').insert({
      source: input.source,
      message: input.message.slice(0, 2000),
      stack: input.stack?.slice(0, 5000) ?? null,
      url: input.url?.slice(0, 500) ?? null,
      user_id: userId,
      user_agent: userAgent?.slice(0, 500) ?? null,
      metadata: input.metadata ?? {},
    })
  } catch {
    // Never let error logging crash the app
    console.error('Failed to log error:', input.message)
  }
}

/** Get error logs for admin viewing */
export async function getErrorLogs(options?: {
  source?: string
  limit?: number
  offset?: number
}): Promise<{ errors: ErrorLog[]; total: number }> {
  const admin = getServiceClient()
  const limit = options?.limit ?? 50
  const offset = options?.offset ?? 0

  let query = admin
    .from('error_logs')
    .select('*, user:profiles(username)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (options?.source) {
    query = query.eq('source', options.source)
  }

  const { data, count, error } = await query
  if (error) throw new Error(error.message)

  return {
    errors: (data ?? []) as ErrorLog[],
    total: count ?? 0,
  }
}

/** Clear old error logs (older than given days) */
export async function clearOldErrors(olderThanDays: number = 30): Promise<number> {
  const admin = getServiceClient()
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString()

  const { data, error } = await admin
    .from('error_logs')
    .delete()
    .lt('created_at', cutoff)
    .select('id')

  if (error) throw new Error(error.message)
  return data?.length ?? 0
}

export interface ErrorLog {
  id: string
  source: 'client' | 'server' | 'server_action' | 'api'
  message: string
  stack: string | null
  url: string | null
  user_id: string | null
  user_agent: string | null
  metadata: Record<string, unknown>
  created_at: string
  user: { username: string | null } | null
}
