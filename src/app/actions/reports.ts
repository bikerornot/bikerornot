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

export interface ContentReport {
  content_id: string
  content_type: 'post' | 'comment' | 'profile'
  report_count: number
  report_ids: string[]
  reasons: string[]
  reporters: Array<{ username: string | null }>
  first_reported_at: string
  latest_reported_at: string
  content_preview: string | null
  content_images: string[]
  content_author_id: string | null
  content_author_username: string | null
}

export async function getContentReports(
  filterType?: 'post' | 'comment' | 'profile'
): Promise<ContentReport[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'moderator', 'super_admin'].includes(profile.role)) return []

  const admin = getServiceClient()
  let query = admin
    .from('reports')
    .select('id, reported_type, reported_id, reason, created_at, reporter:profiles!reporter_id(username)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (filterType) query = query.eq('reported_type', filterType)

  const { data: reports } = await query
  if (!reports || reports.length === 0) return []

  // Group by reported_id
  const groupMap = new Map<string, ContentReport>()
  for (const r of reports) {
    const key = r.reported_id
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        content_id: r.reported_id,
        content_type: r.reported_type,
        report_count: 0,
        report_ids: [],
        reasons: [],
        reporters: [],
        first_reported_at: r.created_at,
        latest_reported_at: r.created_at,
        content_preview: null,
        content_images: [],
        content_author_id: null,
        content_author_username: null,
      })
    }
    const group = groupMap.get(key)!
    group.report_count++
    group.report_ids.push(r.id)
    if (!group.reasons.includes(r.reason)) group.reasons.push(r.reason)
    const reporter = r.reporter as { username: string | null } | null
    if (reporter) group.reporters.push(reporter)
    if (r.created_at < group.first_reported_at) group.first_reported_at = r.created_at
    if (r.created_at > group.latest_reported_at) group.latest_reported_at = r.created_at
  }

  const groups = Array.from(groupMap.values())
  groups.sort((a, b) => b.report_count - a.report_count || b.latest_reported_at.localeCompare(a.latest_reported_at))

  // Batch-fetch content details
  const postIds = groups.filter((g) => g.content_type === 'post').map((g) => g.content_id)
  const commentIds = groups.filter((g) => g.content_type === 'comment').map((g) => g.content_id)
  const profileIds = groups.filter((g) => g.content_type === 'profile').map((g) => g.content_id)

  const [postsResult, commentsResult, profilesResult] = await Promise.all([
    postIds.length > 0
      ? admin.from('posts').select('id, content, author_id, author:profiles!author_id(username)').in('id', postIds)
      : Promise.resolve({ data: [] as any[] }),
    commentIds.length > 0
      ? admin.from('comments').select('id, content, author_id, author:profiles!author_id(username)').in('id', commentIds)
      : Promise.resolve({ data: [] as any[] }),
    profileIds.length > 0
      ? admin.from('profiles').select('id, username').in('id', profileIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const imageMap = new Map<string, string[]>()
  if (postIds.length > 0) {
    const { data: images } = await admin
      .from('post_images')
      .select('post_id, storage_path')
      .in('post_id', postIds)
      .order('order_index')
    for (const img of images ?? []) {
      if (!imageMap.has(img.post_id)) imageMap.set(img.post_id, [])
      imageMap.get(img.post_id)!.push(img.storage_path)
    }
  }

  const postMap = new Map((postsResult.data ?? []).map((p: any) => [p.id, p]))
  const commentMap = new Map((commentsResult.data ?? []).map((c: any) => [c.id, c]))
  const profileMap = new Map((profilesResult.data ?? []).map((p: any) => [p.id, p]))

  for (const group of groups) {
    if (group.content_type === 'post') {
      const post = postMap.get(group.content_id)
      if (post) {
        group.content_preview = post.content?.slice(0, 500) ?? null
        group.content_author_id = post.author_id
        group.content_author_username = (post.author as any)?.username ?? null
        group.content_images = imageMap.get(group.content_id) ?? []
      }
    } else if (group.content_type === 'comment') {
      const comment = commentMap.get(group.content_id)
      if (comment) {
        group.content_preview = comment.content?.slice(0, 300) ?? null
        group.content_author_id = comment.author_id
        group.content_author_username = (comment.author as any)?.username ?? null
      }
    } else if (group.content_type === 'profile') {
      const p = profileMap.get(group.content_id)
      if (p) {
        group.content_preview = `@${p.username}`
        group.content_author_id = p.id
        group.content_author_username = p.username ?? null
      }
    }
  }

  return groups
}

export async function bulkDismissReports(reportIds: string[]): Promise<void> {
  if (!reportIds.length) return
  const userId = await requireAdminOrMod()
  const admin = getServiceClient()
  await admin
    .from('reports')
    .update({ status: 'dismissed', reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .in('id', reportIds)
}

export async function bulkRemoveContent(
  items: Array<{ type: 'post' | 'comment' | 'profile'; contentId: string; reportIds: string[] }>
): Promise<void> {
  if (!items.length) return
  const userId = await requireAdminOrMod()
  const admin = getServiceClient()
  const now = new Date().toISOString()
  const allReportIds = items.flatMap((i) => i.reportIds)

  await Promise.all([
    ...items.map((item) => {
      if (item.type === 'post') {
        return admin.from('posts').update({ deleted_at: now }).eq('id', item.contentId)
      } else if (item.type === 'comment') {
        return admin.from('comments').update({ deleted_at: now }).eq('id', item.contentId)
      }
      return Promise.resolve()
    }),
    admin
      .from('reports')
      .update({ status: 'actioned', reviewed_by: userId, reviewed_at: now })
      .in('id', allReportIds),
  ])
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
