'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { moderateImage, type ModerationResult } from '@/lib/sightengine'
import { checkRateLimit, validateImageFile } from '@/lib/rate-limit'
import { notifyIfActive } from '@/lib/notify'
import { notifyMentions } from '@/lib/mentions'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function createPost(formData: FormData): Promise<{ postId: string } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  checkRateLimit(`createPost:${user.id}`, 5, 60_000)

  const admin = getServiceClient()

  const content = formData.get('content') as string | null
  if (content && content.trim().length > 5000) throw new Error('Post too long (max 5000 characters)')
  const wallOwnerId = formData.get('wallOwnerId') as string | null
  const groupId = formData.get('groupId') as string | null
  const bikeId = formData.get('bikeId') as string | null
  const files = formData.getAll('images') as File[]

  // If posting on someone else's wall, require an accepted friendship
  if (wallOwnerId && wallOwnerId !== user.id) {
    const { data: friendship } = await admin
      .from('friendships')
      .select('id')
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${wallOwnerId}),and(requester_id.eq.${wallOwnerId},addressee_id.eq.${user.id})`
      )
      .eq('status', 'accepted')
      .single()

    if (!friendship) throw new Error('You must be friends to post on this wall')
  }

  // If posting in a group, verify active membership
  if (groupId) {
    const { data: membership } = await admin
      .from('group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!membership) throw new Error('You must be an active group member to post here')
  }

  // If posting on a bike, verify ownership or friendship with bike owner
  if (bikeId) {
    const { data: bike } = await admin
      .from('user_bikes')
      .select('id, user_id')
      .eq('id', bikeId)
      .single()
    if (!bike) throw new Error('Bike not found')

    if (bike.user_id !== user.id) {
      // Must be friends with the bike owner
      const { data: friendship } = await admin
        .from('friendships')
        .select('id')
        .or(
          `and(requester_id.eq.${user.id},addressee_id.eq.${bike.user_id}),and(requester_id.eq.${bike.user_id},addressee_id.eq.${user.id})`
        )
        .eq('status', 'accepted')
        .single()

      if (!friendship) throw new Error('You must be friends to post on this bike wall')
    }
  }

  // Validate and moderate images BEFORE creating the post so a rejection never leaves an orphaned post
  const validFiles = files.filter((f) => f && f.size > 0)
  for (const file of validFiles) validateImageFile(file)
  type CheckedFile = { file: File; bytes: ArrayBuffer; moderation: ModerationResult }
  const checkedFiles: CheckedFile[] = []

  for (const file of validFiles) {
    const bytes = await file.arrayBuffer()
    const moderation = await moderateImage(bytes, file.type)
    if (moderation === 'rejected') {
      return { error: 'One or more images were rejected by our content filter. Please review our community guidelines.' }
    }
    checkedFiles.push({ file, bytes, moderation })
  }

  const { data: post, error: postError } = await admin
    .from('posts')
    .insert({
      author_id: user.id,
      wall_owner_id: wallOwnerId || null,
      group_id: groupId || null,
      bike_id: bikeId || null,
      content: content?.trim() || null,
    })
    .select()
    .single()

  if (postError) throw new Error(postError.message)

  // Notify wall owner when someone else posts on their wall
  if (wallOwnerId && wallOwnerId !== user.id) {
    await notifyIfActive(user.id, {
      user_id: wallOwnerId,
      type: 'wall_post',
      actor_id: user.id,
      post_id: post.id,
    })
  }

  let firstImagePath: string | null = null

  if (checkedFiles.length > 0) {
    const now = new Date().toISOString()
    const imageRows: { post_id: string; storage_path: string; order_index: number; reviewed_at: string | null }[] = []

    for (let i = 0; i < checkedFiles.length; i++) {
      const { file, bytes, moderation } = checkedFiles[i]
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/${post.id}/${i}.${ext}`

      const { error: uploadError } = await admin.storage
        .from('posts')
        .upload(path, bytes, { contentType: file.type })

      if (uploadError) throw new Error(uploadError.message)
      imageRows.push({
        post_id: post.id,
        storage_path: path,
        order_index: i,
        reviewed_at: moderation === 'approved' ? now : null,
      })
    }

    firstImagePath = imageRows[0].storage_path
    const { error: imgError } = await admin.from('post_images').insert(imageRows)
    if (imgError) throw new Error(imgError.message)
  }

  // Notify mentioned friends (after images so we can include the first image in the email)
  if (content?.trim()) {
    await notifyMentions({
      authorId: user.id,
      content: content.trim(),
      postId: post.id,
      postImageUrl: firstImagePath,
      admin,
    })
  }

  return { postId: post.id }
}

export async function sharePost(postId: string, caption?: string): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  // Verify the original post exists and isn't deleted
  const { data: original } = await admin
    .from('posts')
    .select('id, deleted_at')
    .eq('id', postId)
    .single()

  if (!original || original.deleted_at) throw new Error('Post not found')

  const { data: post, error } = await admin
    .from('posts')
    .insert({
      author_id: user.id,
      shared_post_id: postId,
      content: caption?.trim() || null,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return post.id
}

export async function deletePost(postId: string): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  const { data: post } = await admin
    .from('posts')
    .select('author_id, bike_id')
    .eq('id', postId)
    .single()

  if (!post) throw new Error('Not authorized')

  // Allow if post author OR bike wall owner
  let authorized = post.author_id === user.id
  if (!authorized && post.bike_id) {
    const { data: bike } = await admin
      .from('user_bikes')
      .select('id')
      .eq('id', post.bike_id)
      .eq('user_id', user.id)
      .single()
    if (bike) authorized = true
  }
  if (!authorized) throw new Error('Not authorized')

  const { error } = await admin
    .from('posts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', postId)

  if (error) throw new Error(error.message)
}

export async function likePost(postId: string): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { error } = await admin
    .from('post_likes')
    .insert({ post_id: postId, user_id: user.id })

  if (error) {
    if (error.code !== '23505') throw new Error(error.message)
    return // already liked — skip notification
  }

  const { data: post } = await admin
    .from('posts')
    .select('author_id')
    .eq('id', postId)
    .single()

  if (post && post.author_id !== user.id) {
    await notifyIfActive(user.id, {
      user_id: post.author_id,
      type: 'post_like',
      actor_id: user.id,
      post_id: postId,
    })
  }
}

export async function unlikePost(postId: string): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { error } = await admin
    .from('post_likes')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', user.id)

  if (error) throw new Error(error.message)
}
