'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rate-limit'

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function createComment(postId: string, content: string, parentCommentId?: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  checkRateLimit(`createComment:${user.id}`, 20, 60_000)

  const admin = getServiceClient()

  // Verify the post exists and user has access to it
  const { data: post } = await admin
    .from('posts')
    .select('group_id, deleted_at')
    .eq('id', postId)
    .single()

  if (!post || post.deleted_at) throw new Error('Post not found')
  if (content.trim().length > 1000) throw new Error('Comment too long (max 1000 characters)')

  // If post is in a private group, require active membership
  if (post.group_id) {
    const { data: membership } = await admin
      .from('group_members')
      .select('id')
      .eq('group_id', post.group_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!membership) throw new Error('Not authorized')
  }

  const { data: comment, error } = await admin
    .from('comments')
    .insert({
      post_id: postId,
      author_id: user.id,
      content: content.trim(),
      ...(parentCommentId ? { parent_comment_id: parentCommentId } : {}),
    })
    .select('*, author:profiles(*)')
    .single()

  if (error) throw new Error(error.message)

  // Send notification
  if (parentCommentId) {
    // Reply: notify parent comment author
    const { data: parent } = await admin
      .from('comments')
      .select('author_id')
      .eq('id', parentCommentId)
      .single()
    if (parent && parent.author_id !== user.id) {
      await admin.from('notifications').insert({
        user_id: parent.author_id,
        type: 'comment_reply',
        actor_id: user.id,
        post_id: postId,
        comment_id: comment.id,
      })
    }
  } else {
    // Top-level comment: notify post author
    const { data: post } = await admin
      .from('posts')
      .select('author_id')
      .eq('id', postId)
      .single()
    if (post && post.author_id !== user.id) {
      await admin.from('notifications').insert({
        user_id: post.author_id,
        type: 'post_comment',
        actor_id: user.id,
        post_id: postId,
        comment_id: comment.id,
      })
    }
  }

  return comment
}

export async function deleteComment(commentId: string): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  const { data: comment } = await admin
    .from('comments')
    .select('author_id')
    .eq('id', commentId)
    .single()

  if (!comment || comment.author_id !== user.id) throw new Error('Not authorized')

  const { error } = await admin
    .from('comments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', commentId)

  if (error) throw new Error(error.message)
}

export async function likeComment(commentId: string): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { error } = await admin
    .from('comment_likes')
    .insert({ comment_id: commentId, user_id: user.id })

  if (error) {
    if (error.code !== '23505') throw new Error(error.message)
    return // already liked — skip notification
  }

  const { data: comment } = await admin
    .from('comments')
    .select('author_id')
    .eq('id', commentId)
    .single()

  if (comment && comment.author_id !== user.id) {
    await admin.from('notifications').insert({
      user_id: comment.author_id,
      type: 'comment_like',
      actor_id: user.id,
      comment_id: commentId,
    })
  }
}

export async function unlikeComment(commentId: string): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()
  const { error } = await admin
    .from('comment_likes')
    .delete()
    .eq('comment_id', commentId)
    .eq('user_id', user.id)

  if (error) throw new Error(error.message)
}
