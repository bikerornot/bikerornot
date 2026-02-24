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

export const IMAGES_PAGE_SIZE = 40

export async function getPostImages(page = 1): Promise<{ images: AdminImage[]; hasMore: boolean }> {
  await requireAdminOrMod()
  const admin = getServiceClient()

  const from = (page - 1) * IMAGES_PAGE_SIZE

  // Fetch posts ordered by created_at, then batch-fetch their images
  const { data: posts } = await admin
    .from('posts')
    .select('id, created_at, author_id, author:profiles!author_id(id, username, first_name, last_name)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, from + IMAGES_PAGE_SIZE - 1)

  if (!posts?.length) return { images: [], hasMore: false }

  const postIds = (posts as any[]).map((p) => p.id)
  const { data: postImages } = await admin
    .from('post_images')
    .select('id, post_id, storage_path')
    .in('post_id', postIds)
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

  return { images, hasMore: (posts as any[]).length === IMAGES_PAGE_SIZE }
}

export async function getAvatarImages(page = 1): Promise<{ images: AdminImage[]; hasMore: boolean }> {
  await requireAdminOrMod()
  const admin = getServiceClient()

  const from = (page - 1) * IMAGES_PAGE_SIZE

  // Fetch one extra to detect hasMore
  const { data } = await admin
    .from('profiles')
    .select('id, username, first_name, last_name, profile_photo_url, updated_at')
    .not('profile_photo_url', 'is', null)
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

  return { images, hasMore }
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
    admin.from('profiles').update({ profile_photo_url: null }).in('id', items.map((i) => i.userId)),
    admin.storage.from('avatars').remove(items.map((i) => i.storagePath)),
  ])
}
