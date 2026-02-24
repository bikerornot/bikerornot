'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireAdminOrMod() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'moderator', 'super_admin'].includes(profile.role)) throw new Error('Not authorized')
  return user.id
}

export async function submitReport(
  reportedType: 'post' | 'comment' | 'profile',
  reportedId: string,
  reason: string,
  details?: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = getServiceClient()
  const { error } = await admin.from('reports').insert({
    reporter_id: user.id,
    reported_type: reportedType,
    reported_id: reportedId,
    reason,
    details: details?.trim() || null,
  })

  if (error) {
    if (error.code === '23505') return { error: 'already_reported' }
    return { error: error.message }
  }
  return {}
}

export interface ReportRow {
  id: string
  reported_type: 'post' | 'comment' | 'profile'
  reported_id: string
  reason: string
  details: string | null
  status: string
  created_at: string
  reporter: { username: string | null } | null
  content_preview: string | null
  content_author_id: string | null
  content_author_username: string | null
  content_images: string[]
}

export async function getReports(): Promise<ReportRow[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'moderator', 'super_admin'].includes(profile.role)) return []

  const admin = getServiceClient()
  const { data: reports } = await admin
    .from('reports')
    .select('*, reporter:profiles!reporter_id(username)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (!reports || reports.length === 0) return []

  const enriched = await Promise.all(
    reports.map(async (r) => {
      const row: ReportRow = {
        id: r.id,
        reported_type: r.reported_type,
        reported_id: r.reported_id,
        reason: r.reason,
        details: r.details,
        status: r.status,
        created_at: r.created_at,
        reporter: r.reporter as { username: string | null } | null,
        content_preview: null,
        content_author_id: null,
        content_author_username: null,
        content_images: [],
      }

      if (r.reported_type === 'post') {
        const [{ data }, { data: images }] = await Promise.all([
          admin
            .from('posts')
            .select('content, author_id, author:profiles!author_id(username)')
            .eq('id', r.reported_id)
            .single(),
          admin
            .from('post_images')
            .select('storage_path')
            .eq('post_id', r.reported_id)
            .order('order_index'),
        ])
        if (data) {
          row.content_preview = data.content?.slice(0, 500) ?? null
          row.content_author_id = data.author_id
          row.content_author_username = (data.author as unknown as { username: string | null } | null)?.username ?? null
          row.content_images = (images ?? []).map((img) => img.storage_path)
        }
      } else if (r.reported_type === 'comment') {
        const { data } = await admin
          .from('comments')
          .select('content, author_id, author:profiles!author_id(username)')
          .eq('id', r.reported_id)
          .single()
        if (data) {
          row.content_preview = data.content?.slice(0, 120) ?? null
          row.content_author_id = data.author_id
          row.content_author_username = (data.author as unknown as { username: string | null } | null)?.username ?? null
        }
      } else if (r.reported_type === 'profile') {
        const { data } = await admin
          .from('profiles')
          .select('id, username')
          .eq('id', r.reported_id)
          .single()
        if (data) {
          row.content_preview = `@${data.username}`
          row.content_author_id = data.id
          row.content_author_username = data.username ?? null
        }
      }

      return row
    })
  )

  return enriched
}

export async function dismissReport(reportId: string): Promise<void> {
  const userId = await requireAdminOrMod()
  const admin = getServiceClient()
  await admin
    .from('reports')
    .update({ status: 'dismissed', reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq('id', reportId)
}

export async function actionReport(
  reportId: string,
  action: 'remove_content' | 'suspend_user' | 'ban_user'
): Promise<void> {
  const userId = await requireAdminOrMod()
  const admin = getServiceClient()

  const { data: report } = await admin.from('reports').select('*').eq('id', reportId).single()
  if (!report) throw new Error('Report not found')

  if (action === 'remove_content') {
    if (report.reported_type === 'post') {
      await admin.from('posts').update({ deleted_at: new Date().toISOString() }).eq('id', report.reported_id)
    } else if (report.reported_type === 'comment') {
      await admin.from('comments').update({ deleted_at: new Date().toISOString() }).eq('id', report.reported_id)
    }
  }

  if (action === 'suspend_user' || action === 'ban_user') {
    let targetUserId: string | null = null
    if (report.reported_type === 'profile') {
      targetUserId = report.reported_id
    } else if (report.reported_type === 'post') {
      const { data } = await admin.from('posts').select('author_id').eq('id', report.reported_id).single()
      targetUserId = data?.author_id ?? null
    } else if (report.reported_type === 'comment') {
      const { data } = await admin.from('comments').select('author_id').eq('id', report.reported_id).single()
      targetUserId = data?.author_id ?? null
    }
    if (targetUserId) {
      await admin
        .from('profiles')
        .update({ status: action === 'ban_user' ? 'banned' : 'suspended' })
        .eq('id', targetUserId)
    }
  }

  await admin
    .from('reports')
    .update({ status: 'actioned', reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq('id', reportId)
}
