'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

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

  const admin = getServiceClient()
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
      }).catch(() => {})
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
      }).catch(() => {})
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
    }).catch(() => {})
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
