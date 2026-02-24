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
  if (!profile || !['admin', 'moderator', 'super_admin'].includes(profile.role)) {
    throw new Error('Not authorized')
  }
}

export interface AdminImage {
  id: string
  type: 'post' | 'avatar'
  storage_path: string
  post_id: string | null
  author_id: string | null
  author_username: string | null
  author_name: string | null
  created_at: string
}

const IMAGES_PAGE_SIZE = 40

export async function getPostImages(page = 1): Promise<{ images: AdminImage[]; hasMore: boolean; queueTotal: number }> {
  await requireAdminOrMod()
  const admin = getServiceClient()

  const from = (page - 1) * IMAGES_PAGE_SIZE

  // Get all post IDs with unreviewed images
  const { data: unreviewedPostIds } = await admin
    .from('post_images')
    .select('post_id')
    .is('reviewed_at', null)

  const postIdSet = [...new Set((unreviewedPostIds ?? []).map((r: any) => r.post_id))]

  if (!postIdSet.length) return { images: [], hasMore: false, queueTotal: 0 }

  // Filter to non-deleted posts only, then count images from those posts
  const { data: validPostRows } = await admin
    .from('posts')
    .select('id')
    .is('deleted_at', null)
    .in('id', postIdSet)

  const validPostIds = (validPostRows ?? []).map((p: any) => p.id)

  if (!validPostIds.length) return { images: [], hasMore: false, queueTotal: 0 }

  // Accurate count: only images attached to live posts
  const { count: queueTotal } = await admin
    .from('post_images')
    .select('*', { count: 'exact', head: true })
    .is('reviewed_at', null)
    .in('post_id', validPostIds)

  const { data: posts } = await admin
    .from('posts')
    .select('id, created_at, author_id, author:profiles!author_id(id, username, first_name, last_name)')
    .is('deleted_at', null)
    .in('id', validPostIds)
    .order('created_at', { ascending: false })
    .range(from, from + IMAGES_PAGE_SIZE - 1)

  if (!posts?.length) return { images: [], hasMore: false, queueTotal: queueTotal ?? 0 }

  const postIds = (posts as any[]).map((p) => p.id)
  const { data: postImages } = await admin
    .from('post_images')
    .select('id, post_id, storage_path')
    .in('post_id', postIds)
    .is('reviewed_at', null)
    .order('order_index')

  const postMap = new Map((posts as any[]).map((p) => [p.id, p]))
  const images: AdminImage[] = (postImages ?? []).map((img: any) => {
    const post = postMap.get(img.post_id) as any
    const author = post?.author as any
    return {
      id: img.id,
      type: 'post',
      storage_path: img.storage_path,
      post_id: img.post_id,
      author_id: post?.author_id ?? null,
      author_username: author?.username ?? null,
      author_name: [author?.first_name, author?.last_name].filter(Boolean).join(' ') || null,
      created_at: post?.created_at ?? '',
    }
  })

  return { images, hasMore: (posts as any[]).length === IMAGES_PAGE_SIZE, queueTotal: queueTotal ?? 0 }
}

export async function getAvatarImages(page = 1): Promise<{ images: AdminImage[]; hasMore: boolean; queueTotal: number }> {
  await requireAdminOrMod()
  const admin = getServiceClient()

  const from = (page - 1) * IMAGES_PAGE_SIZE

  const { count: queueTotal } = await admin
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .not('profile_photo_url', 'is', null)
    .is('avatar_reviewed_at', null)

  // Fetch one extra to detect hasMore
  const { data } = await admin
    .from('profiles')
    .select('id, username, first_name, last_name, profile_photo_url, updated_at')
    .not('profile_photo_url', 'is', null)
    .is('avatar_reviewed_at', null)
    .order('updated_at', { ascending: false })
    .range(from, from + IMAGES_PAGE_SIZE)

  const hasMore = (data?.length ?? 0) > IMAGES_PAGE_SIZE
  const images: AdminImage[] = ((data ?? []) as any[]).slice(0, IMAGES_PAGE_SIZE).map((p) => ({
    id: p.id,
    type: 'avatar',
    storage_path: p.profile_photo_url,
    post_id: null,
    author_id: p.id,
    author_username: p.username ?? null,
    author_name: [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
    created_at: p.updated_at,
  }))

  return { images, hasMore, queueTotal: queueTotal ?? 0 }
}

export async function approvePostImages(imageIds: string[]): Promise<void> {
  if (!imageIds.length) return
  await requireAdminOrMod()
  const admin = getServiceClient()
  await admin
    .from('post_images')
    .update({ reviewed_at: new Date().toISOString() })
    .in('id', imageIds)
}

export async function approveAvatars(userIds: string[]): Promise<void> {
  if (!userIds.length) return
  await requireAdminOrMod()
  const admin = getServiceClient()
  await admin
    .from('profiles')
    .update({ avatar_reviewed_at: new Date().toISOString() })
    .in('id', userIds)
}

export async function removePostImages(
  items: Array<{ imageId: string; storagePath: string }>
): Promise<void> {
  if (!items.length) return
  await requireAdminOrMod()
  const admin = getServiceClient()
  await Promise.all([
    admin.from('post_images').delete().in('id', items.map((i) => i.imageId)),
    admin.storage.from('posts').remove(items.map((i) => i.storagePath)),
  ])
}

export async function removeAvatars(
  items: Array<{ userId: string; storagePath: string }>
): Promise<void> {
  if (!items.length) return
  await requireAdminOrMod()
  const admin = getServiceClient()
  await Promise.all([
    admin.from('profiles').update({ profile_photo_url: null, avatar_reviewed_at: null }).in('id', items.map((i) => i.userId)),
    admin.storage.from('avatars').remove(items.map((i) => i.storagePath)),
  ])
}
