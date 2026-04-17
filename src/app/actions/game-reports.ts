'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rate-limit'

export type ReportReason = 'wrong_year' | 'wrong_make' | 'wrong_model' | 'bad_angle' | 'multiple_bikes'

const REASON_LABELS: Record<ReportReason, string> = {
  wrong_year: 'Wrong year',
  wrong_make: 'Wrong make',
  wrong_model: 'Wrong model',
  bad_angle: 'Photo is not a good angle',
  multiple_bikes: 'Multiple bikes in photo',
}

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return user
}

async function requireAdmin() {
  const user = await requireAuth()
  const admin = getServiceClient()
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    throw new Error('Not authorized')
  }
  return user
}

export async function reportGamePhoto(bikePhotoId: string, reason: ReportReason): Promise<{ ok: true } | { error: string }> {
  const user = await requireAuth()

  if (!Object.hasOwn(REASON_LABELS, reason)) {
    return { error: 'Invalid report reason' }
  }

  checkRateLimit(`reportGamePhoto:${user.id}`, 20, 86_400_000)

  const admin = getServiceClient()

  const { error: insertError } = await admin.from('bike_photo_reports').insert({
    reporter_id: user.id,
    bike_photo_id: bikePhotoId,
    reason,
  })

  if (insertError) {
    if (insertError.code === '23505') {
      // Unique violation — already reported by this user
      return { error: "You've already reported this photo." }
    }
    throw new Error(insertError.message)
  }

  // Auto-quarantine on first report. Only flip game_approved if it's currently true
  // so admins who explicitly Keep Out a photo aren't disturbed by later reports.
  await admin.from('bike_photos').update({ game_approved: false }).eq('id', bikePhotoId).eq('game_approved', true)

  return { ok: true }
}

export interface ReportedPhoto {
  bike_photo_id: string
  storage_path: string
  bike: { year: number | null; make: string | null; model: string | null } | null
  owner: { username: string | null; first_name: string | null } | null
  report_count: number
  reasons: { reason: ReportReason; count: number }[]
  first_reported_at: string
  latest_reported_at: string
  reporters: { username: string | null; reason: ReportReason; created_at: string }[]
}

export async function listGameReports(): Promise<ReportedPhoto[]> {
  await requireAdmin()
  const admin = getServiceClient()

  const { data: openReports } = await admin
    .from('bike_photo_reports')
    .select('bike_photo_id, reporter_id, reason, created_at, reporter:profiles!reporter_id(username)')
    .is('resolved_at', null)
    .order('created_at', { ascending: false })

  if (!openReports || openReports.length === 0) return []

  const photoIds = Array.from(new Set(openReports.map((r: any) => r.bike_photo_id)))

  const { data: photos } = await admin
    .from('bike_photos')
    .select('id, storage_path, bike:user_bikes!bike_id(year, make, model, user_id)')
    .in('id', photoIds)

  const ownerIds = Array.from(new Set((photos ?? []).map((p: any) => p.bike?.user_id).filter(Boolean)))
  const { data: owners } = ownerIds.length > 0
    ? await admin.from('profiles').select('id, username, first_name').in('id', ownerIds)
    : { data: [] }

  const ownerMap = new Map<string, { username: string | null; first_name: string | null }>()
  for (const o of owners ?? []) ownerMap.set(o.id, { username: o.username, first_name: o.first_name })

  const photoMap = new Map<string, any>()
  for (const p of photos ?? []) photoMap.set(p.id, p)

  const groups = new Map<string, ReportedPhoto>()
  for (const r of openReports as any[]) {
    const photoId = r.bike_photo_id
    const photo = photoMap.get(photoId)
    if (!photo) continue

    let group = groups.get(photoId)
    if (!group) {
      const ownerId = photo.bike?.user_id as string | undefined
      group = {
        bike_photo_id: photoId,
        storage_path: photo.storage_path,
        bike: photo.bike ? { year: photo.bike.year, make: photo.bike.make, model: photo.bike.model } : null,
        owner: ownerId ? (ownerMap.get(ownerId) ?? null) : null,
        report_count: 0,
        reasons: [],
        first_reported_at: r.created_at,
        latest_reported_at: r.created_at,
        reporters: [],
      }
      groups.set(photoId, group)
    }
    group.report_count++
    group.reporters.push({ username: r.reporter?.username ?? null, reason: r.reason, created_at: r.created_at })
    if (r.created_at < group.first_reported_at) group.first_reported_at = r.created_at
    if (r.created_at > group.latest_reported_at) group.latest_reported_at = r.created_at
    const existing = group.reasons.find((x) => x.reason === r.reason)
    if (existing) existing.count++
    else group.reasons.push({ reason: r.reason, count: 1 })
  }

  return Array.from(groups.values()).sort((a, b) => b.latest_reported_at.localeCompare(a.latest_reported_at))
}

async function resolveAllFor(bikePhotoId: string, resolution: 'kept_out' | 'restored', resolverId: string) {
  const admin = getServiceClient()
  await admin
    .from('bike_photo_reports')
    .update({ resolved_at: new Date().toISOString(), resolution, resolved_by: resolverId })
    .eq('bike_photo_id', bikePhotoId)
    .is('resolved_at', null)
}

export async function restoreGamePhoto(bikePhotoId: string): Promise<void> {
  const user = await requireAdmin()
  const admin = getServiceClient()
  await admin.from('bike_photos').update({ game_approved: true }).eq('id', bikePhotoId)
  await resolveAllFor(bikePhotoId, 'restored', user.id)
  // Un-void any answers we voided earlier for this photo. Only touches rows
  // we flagged as 'misclassified' so unrelated voids (future reasons) survive.
  await admin
    .from('game_answers')
    .update({ voided_at: null, voided_reason: null })
    .eq('bike_photo_id', bikePhotoId)
    .eq('voided_reason', 'misclassified')
}

export async function keepOutGamePhoto(bikePhotoId: string): Promise<void> {
  const user = await requireAdmin()
  const admin = getServiceClient()
  // game_approved is already false (auto-quarantine set it). Mark reports resolved.
  await resolveAllFor(bikePhotoId, 'kept_out', user.id)
  // Void every answer on this photo so stats and leaderboard rankings ignore
  // the bad data. Guarded by voided_at IS NULL so re-runs are idempotent.
  await admin
    .from('game_answers')
    .update({ voided_at: new Date().toISOString(), voided_reason: 'misclassified' })
    .eq('bike_photo_id', bikePhotoId)
    .is('voided_at', null)
}

