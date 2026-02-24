'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function createPost(formData: FormData): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  const content = formData.get('content') as string | null
  const wallOwnerId = formData.get('wallOwnerId') as string | null
  const groupId = formData.get('groupId') as string | null
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

  const { data: post, error: postError } = await admin
    .from('posts')
    .insert({
      author_id: user.id,
      wall_owner_id: wallOwnerId || null,
      group_id: groupId || null,
      content: content?.trim() || null,
    })
    .select()
    .single()

  if (postError) throw new Error(postError.message)

  // Notify wall owner when someone else posts on their wall
  if (wallOwnerId && wallOwnerId !== user.id) {
    await admin.from('notifications').insert({
      user_id: wallOwnerId,
      type: 'wall_post',
      actor_id: user.id,
      post_id: post.id,
    })
  }

  const validFiles = files.filter((f) => f && f.size > 0)
  if (validFiles.length > 0) {
    const imageRows: { post_id: string; storage_path: string; order_index: number }[] = []

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i]
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/${post.id}/${i}.${ext}`

      const bytes = await file.arrayBuffer()
      const { error: uploadError } = await admin.storage
        .from('posts')
        .upload(path, bytes, { contentType: file.type })

      if (uploadError) throw new Error(uploadError.message)
      imageRows.push({ post_id: post.id, storage_path: path, order_index: i })
    }

    const { error: imgError } = await admin.from('post_images').insert(imageRows)
    if (imgError) throw new Error(imgError.message)
  }

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
    .select('author_id')
    .eq('id', postId)
    .single()

  if (!post || post.author_id !== user.id) throw new Error('Not authorized')

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
    await admin.from('notifications').insert({
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
