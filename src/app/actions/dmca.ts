'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export interface DmcaNoticeInput {
  fullName: string
  email: string
  address: string
  phone?: string
  relationship: 'owner' | 'authorized_rep'
  workDescription: string
  infringingUrls: string
  goodFaithBelief: boolean
  accuracyStatement: boolean
  electronicSignature: string
}

export async function submitDmcaNotice(data: DmcaNoticeInput): Promise<void> {
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await admin.from('dmca_notices').insert({
    full_name: data.fullName,
    email: data.email,
    address: data.address,
    phone: data.phone || null,
    relationship: data.relationship,
    work_description: data.workDescription,
    infringing_urls: data.infringingUrls,
    good_faith_belief: data.goodFaithBelief,
    accuracy_statement: data.accuracyStatement,
    electronic_signature: data.electronicSignature,
    status: 'received',
  })

  if (error) throw new Error('Failed to submit DMCA notice')
}

export type RemoveResult =
  | { type: 'post'; id: string; authorId: string }
  | { type: 'profile'; username: string; userId: string }
  | { type: 'unknown' }

export async function removeContentForDmca(url: string): Promise<RemoveResult> {
  // Service client bypasses RLS — used for all actual DB writes
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get current admin user for notification actor_id (non-blocking)
  let actorId: string | null = null
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    actorId = user?.id ?? null
  } catch {
    // Session unavailable — still proceed with removal
  }

  // Resolve post ID — handles both post page URLs and Supabase storage image URLs
  async function resolvePostId(): Promise<string | null> {
    const trimmed = url.trim()

    // Supabase storage URL: /storage/v1/object/public/posts/[user-id]/[post-id]/[file]
    const storageMatch = trimmed.match(/\/storage\/v1\/object\/public\/posts\/(.+)/)
    if (storageMatch) {
      const storagePath = storageMatch[1].trim()
      const { data: img } = await admin
        .from('post_images')
        .select('post_id')
        .eq('storage_path', storagePath)
        .single()
      return img?.post_id ?? null
    }

    // BikerOrNot post page URL: /posts/[uuid]
    const postPageMatch = trimmed.match(/\/posts\/([0-9a-f-]{36})(?:[/?#]|$)/i)
    return postPageMatch?.[1] ?? null
  }

  const postId = await resolvePostId()
  const profileMatch = url.match(/\/profile\/([a-zA-Z0-9_.-]+)/)

  if (postId) {
    // Get author before deleting so we can notify them
    const { data: post } = await admin
      .from('posts')
      .select('author_id')
      .eq('id', postId)
      .single()

    if (!post) throw new Error(`Post not found: ${postId}`)

    const { error } = await admin
      .from('posts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', postId)
    if (error) throw new Error(`Failed to remove post: ${error.message}`)

    // Notify the post author (non-fatal)
    if (post.author_id && actorId && post.author_id !== actorId) {
      admin.from('notifications').insert({
        user_id: post.author_id,
        type: 'dmca_takedown',
        actor_id: actorId,
        post_id: postId,
        comment_id: null,
        group_id: null,
        content_url: url.trim(),
      }).then(({ error: nErr }) => {
        if (nErr) console.error('DMCA notification failed:', nErr.message)
      })
    }

    return { type: 'post', id: postId, authorId: post.author_id ?? '' }
  }

  if (profileMatch) {
    const username = profileMatch[1]
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('username', username)
      .single()
    if (!profile) throw new Error('Profile not found')

    const { error } = await admin
      .from('profiles')
      .update({
        status: 'suspended',
        suspension_reason: 'DMCA copyright infringement',
        suspended_until: null,
      })
      .eq('id', profile.id)
    if (error) throw new Error(`Failed to suspend profile: ${error.message}`)

    // Notify the profile owner (non-fatal)
    if (actorId && profile.id !== actorId) {
      admin.from('notifications').insert({
        user_id: profile.id,
        type: 'dmca_takedown',
        actor_id: actorId,
        post_id: null,
        comment_id: null,
        group_id: null,
        content_url: url.trim(),
      }).then(({ error: nErr }) => {
        if (nErr) console.error('DMCA notification failed:', nErr.message)
      })
    }

    return { type: 'profile', username, userId: profile.id }
  }

  return { type: 'unknown' }
}

export async function updateDmcaStatus(
  id: string,
  status: 'reviewing' | 'actioned' | 'dismissed',
  notes?: string
): Promise<void> {
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await admin
    .from('dmca_notices')
    .update({
      status,
      notes: notes ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) throw new Error('Failed to update DMCA notice')
}

// ── Counter-notice actions ──────────────────────────────────────────────────

export interface CounterNoticeInput {
  originalNoticeId?: string
  fullName: string
  email: string
  address: string
  phone?: string
  removedContentDescription: string
  originalUrl: string
  goodFaithStatement: boolean
  jurisdictionConsent: boolean
  electronicSignature: string
}

export async function submitCounterNotice(data: CounterNoticeInput): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await admin.from('dmca_counter_notices').insert({
    original_notice_id: data.originalNoticeId || null,
    user_id: user?.id ?? null,
    full_name: data.fullName,
    email: data.email,
    address: data.address,
    phone: data.phone || null,
    removed_content_description: data.removedContentDescription,
    original_url: data.originalUrl,
    good_faith_statement: data.goodFaithStatement,
    jurisdiction_consent: data.jurisdictionConsent,
    electronic_signature: data.electronicSignature,
    status: 'received',
  })

  if (error) throw new Error('Failed to submit counter-notice')
}

export async function forwardAndRestoreCounterNotice(
  counterNoticeId: string,
  originalUrl: string,
  noticeAdminNotes?: string
): Promise<void> {
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Restore the content
  const postMatch = originalUrl.match(/\/posts\/([0-9a-f-]{36})/i)
  const profileMatch = originalUrl.match(/\/profile\/([a-zA-Z0-9_.-]+)/)

  if (postMatch) {
    const postId = postMatch[1]
    const { error } = await admin
      .from('posts')
      .update({ deleted_at: null })
      .eq('id', postId)
    if (error) throw new Error('Failed to restore post')
  } else if (profileMatch) {
    const username = profileMatch[1]
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('username', username)
      .single()
    if (!profile) throw new Error('Profile not found')
    const { error } = await admin
      .from('profiles')
      .update({ status: 'active', suspension_reason: null })
      .eq('id', profile.id)
    if (error) throw new Error('Failed to reinstate profile')
  }

  // Mark counter-notice as forwarded + restored
  const { error: cnError } = await admin
    .from('dmca_counter_notices')
    .update({ status: 'restored', reviewed_at: new Date().toISOString() })
    .eq('id', counterNoticeId)
  if (cnError) throw new Error('Failed to update counter-notice status')

  // Update the linked original notice notes if provided
  if (noticeAdminNotes) {
    const { data: cn } = await admin
      .from('dmca_counter_notices')
      .select('original_notice_id')
      .eq('id', counterNoticeId)
      .single()
    if (cn?.original_notice_id) {
      await admin
        .from('dmca_notices')
        .update({
          notes: noticeAdminNotes,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', cn.original_notice_id)
    }
  }
}

export async function dismissCounterNotice(counterNoticeId: string): Promise<void> {
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { error } = await admin
    .from('dmca_counter_notices')
    .update({ status: 'dismissed', reviewed_at: new Date().toISOString() })
    .eq('id', counterNoticeId)
  if (error) throw new Error('Failed to dismiss counter-notice')
}
