'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { checkRateLimit } from '@/lib/rate-limit'

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

/**
 * Create a fingerprint for grouping duplicate errors.
 * Uses source + first line of message (stripped of dynamic values).
 */
function fingerprint(source: string, message: string): string {
  // Normalize: strip UUIDs, numbers, and quotes to group similar errors
  const normalized = message
    .slice(0, 200)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\b\d+\b/g, '<n>')
    .replace(/["'`][^"'`]*["'`]/g, '<str>')
  return `${source}:${normalized}`
}

/** Log an error to the error_logs table, grouped by issue. Fire-and-forget safe. */
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
    let clientIp: string | null = null
    try {
      const h = await headers()
      userAgent = h.get('user-agent')
      clientIp = h.get('x-forwarded-for')?.split(',')[0].trim() ?? h.get('x-real-ip') ?? null
    } catch {
      // Headers not available outside request context
    }

    // Rate limit to prevent error-log table spam. Key by user if authenticated,
    // else by client IP, else by a shared bucket so one bad actor can't knock
    // out legit error reporting. Silently drop on overflow (never throw from
    // the error logger — it would defeat the purpose).
    try {
      const key = `logError:${userId ?? clientIp ?? 'anon'}`
      checkRateLimit(key, 60, 60_000) // 60 errors/minute per user or IP
    } catch {
      return
    }

    const fp = fingerprint(input.source, input.message)
    const now = new Date().toISOString()

    // Find or create the issue group
    const { data: existing } = await admin
      .from('error_issues')
      .select('id, status')
      .eq('fingerprint', fp)
      .single()

    let issueId: string

    if (existing) {
      issueId = existing.id
      // Read current count, then update with incremented value + reopen if resolved
      const { data: current } = await admin
        .from('error_issues')
        .select('occurrence_count')
        .eq('id', existing.id)
        .single()

      await admin
        .from('error_issues')
        .update({
          occurrence_count: (current?.occurrence_count ?? 0) + 1,
          last_seen_at: now,
          ...(existing.status === 'resolved' ? { status: 'open', resolved_at: null, resolved_by: null } : {}),
        })
        .eq('id', existing.id)
    } else {
      const { data: newIssue, error: issueErr } = await admin
        .from('error_issues')
        .insert({
          fingerprint: fp,
          source: input.source,
          message: input.message.slice(0, 2000),
          first_seen_at: now,
          last_seen_at: now,
          occurrence_count: 1,
        })
        .select('id')
        .single()

      if (issueErr) {
        // Race condition: another request created it simultaneously
        const { data: retry } = await admin
          .from('error_issues')
          .select('id')
          .eq('fingerprint', fp)
          .single()
        issueId = retry?.id
        if (!issueId) {
          console.error('Failed to create error issue:', issueErr.message)
          return
        }
      } else {
        issueId = newIssue.id
      }
    }

    // Insert the individual log entry
    await admin.from('error_logs').insert({
      issue_id: issueId,
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

// ── Admin queries ──────────────────────────────────────────────────────────────

/** Get grouped error issues for admin viewing */
export async function getErrorIssues(options?: {
  source?: string
  status?: 'open' | 'resolved'
  limit?: number
  offset?: number
}): Promise<{ issues: ErrorIssue[]; total: number }> {
  const admin = getServiceClient()
  const limit = options?.limit ?? 50
  const offset = options?.offset ?? 0

  let query = admin
    .from('error_issues')
    .select('*, resolved_by_user:profiles!error_issues_resolved_by_fkey(username)', { count: 'exact' })
    .order('last_seen_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (options?.source) {
    query = query.eq('source', options.source)
  }
  if (options?.status) {
    query = query.eq('status', options.status)
  }

  const { data, count, error } = await query
  if (error) throw new Error(error.message)

  return {
    issues: (data ?? []) as ErrorIssue[],
    total: count ?? 0,
  }
}

/** Get individual log entries for an issue */
export async function getIssueOccurrences(issueId: string, limit: number = 20): Promise<ErrorLog[]> {
  const admin = getServiceClient()

  const { data, error } = await admin
    .from('error_logs')
    .select('*, user:profiles(username)')
    .eq('issue_id', issueId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data ?? []) as ErrorLog[]
}

/** Resolve an error issue */
export async function resolveIssue(issueId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { error } = await admin
    .from('error_issues')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
    })
    .eq('id', issueId)

  if (error) throw new Error(error.message)
}

/** Reopen a resolved error issue */
export async function reopenIssue(issueId: string): Promise<void> {
  const admin = getServiceClient()
  const { error } = await admin
    .from('error_issues')
    .update({
      status: 'open',
      resolved_at: null,
      resolved_by: null,
    })
    .eq('id', issueId)

  if (error) throw new Error(error.message)
}

/** Clear old resolved issues and their logs */
export async function clearResolvedErrors(olderThanDays: number = 30): Promise<number> {
  const admin = getServiceClient()
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString()

  // Get resolved issues older than cutoff
  const { data: oldIssues } = await admin
    .from('error_issues')
    .select('id')
    .eq('status', 'resolved')
    .lt('resolved_at', cutoff)

  if (!oldIssues || oldIssues.length === 0) return 0

  const issueIds = oldIssues.map((i) => i.id)

  // Delete logs first (FK constraint)
  await admin.from('error_logs').delete().in('issue_id', issueIds)

  // Delete issues
  const { error } = await admin.from('error_issues').delete().in('id', issueIds)
  if (error) throw new Error(error.message)

  return issueIds.length
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ErrorIssue {
  id: string
  fingerprint: string
  source: 'client' | 'server' | 'server_action' | 'api'
  message: string
  status: 'open' | 'resolved'
  occurrence_count: number
  first_seen_at: string
  last_seen_at: string
  resolved_at: string | null
  resolved_by: string | null
  resolved_by_user: { username: string | null } | null
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
