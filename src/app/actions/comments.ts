'use server'

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rate-limit'
import { scanCommentForScam } from '@/app/actions/scam-scan'
import { notifyIfActive } from '@/lib/notify'
import { notifyMentions } from '@/lib/mentions'
import { sendCommentEmail } from '@/lib/email'

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
  if (!content.trim()) throw new Error('Comment cannot be empty')
  if (content.trim().length > 1000) throw new Error('Comment too long (max 1000 characters)')

  // If post is in a private group, require active membership
  if (post.group_id) {
    const { data: group } = await admin
      .from('groups')
      .select('privacy')
      .eq('id', post.group_id)
      .single()

    if (group?.privacy === 'private') {
      const { data: membership } = await admin
        .from('group_members')
        .select('id')
        .eq('group_id', post.group_id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single()

      if (!membership) throw new Error('Not authorized')
    }
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

  // Async AI scam scan (non-blocking)
  after(async () => {
    try {
      await scanCommentForScam(comment.id, postId, user.id, content.trim())
    } catch { /* best-effort */ }
  })

  // Notify mentioned friends
  await notifyMentions({
    authorId: user.id,
    content: content.trim(),
    postId,
    commentId: comment.id,
    admin,
  })

  // Send notification (skipped for banned/suspended users via notifyIfActive)
  const postUrl = `https://www.bikerornot.com/post/${postId}`

  if (parentCommentId) {
    const { data: parent } = await admin
      .from('comments')
      .select('author_id')
      .eq('id', parentCommentId)
      .single()
    if (parent && parent.author_id !== user.id) {
      await notifyIfActive(user.id, {
        user_id: parent.author_id,
        type: 'comment_reply',
        actor_id: user.id,
        post_id: postId,
        comment_id: comment.id,
      })

      // Send reply email
      try {
        const [{ data: commenterProfile }, { data: parentAuth }, { data: parentProfile }] = await Promise.all([
          admin.from('profiles').select('username').eq('id', user.id).single(),
          admin.auth.admin.getUserById(parent.author_id),
          admin.from('profiles').select('first_name, email_comments').eq('id', parent.author_id).single(),
        ])
        const parentEmail = parentAuth.user?.email
        if (parentEmail && commenterProfile?.username && parentProfile?.email_comments !== false) {
          await sendCommentEmail({
            toEmail: parentEmail,
            toName: parentProfile?.first_name ?? 'there',
            fromUsername: commenterProfile.username,
            commentSnippet: content.trim(),
            postUrl,
            isReply: true,
          })
        }
      } catch { /* best-effort */ }
    }
  } else {
    const { data: postData } = await admin
      .from('posts')
      .select('author_id')
      .eq('id', postId)
      .single()
    if (postData && postData.author_id !== user.id) {
      await notifyIfActive(user.id, {
        user_id: postData.author_id,
        type: 'post_comment',
        actor_id: user.id,
        post_id: postId,
        comment_id: comment.id,
      })

      // Send comment email
      try {
        const [{ data: commenterProfile }, { data: postAuthorAuth }, { data: postAuthorProfile }] = await Promise.all([
          admin.from('profiles').select('username').eq('id', user.id).single(),
          admin.auth.admin.getUserById(postData.author_id),
          admin.from('profiles').select('first_name, email_comments').eq('id', postData.author_id).single(),
        ])
        const authorEmail = postAuthorAuth.user?.email
        if (authorEmail && commenterProfile?.username && postAuthorProfile?.email_comments !== false) {
          await sendCommentEmail({
            toEmail: authorEmail,
            toName: postAuthorProfile?.first_name ?? 'there',
            fromUsername: commenterProfile.username,
            commentSnippet: content.trim(),
            postUrl,
            isReply: false,
          })
        }
      } catch { /* best-effort */ }
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

  // Clean up notifications that reference this deleted comment
  await admin
    .from('notifications')
    .delete()
    .eq('comment_id', commentId)
}

export async function hideComment(commentId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  // Verify the current user is the post author (only post author can hide comments)
  const { data: comment } = await admin
    .from('comments')
    .select('post_id')
    .eq('id', commentId)
    .single()
  if (!comment) throw new Error('Comment not found')

  const { data: post } = await admin
    .from('posts')
    .select('author_id')
    .eq('id', comment.post_id)
    .single()
  if (!post || post.author_id !== user.id) throw new Error('Not authorized')

  await admin
    .from('comments')
    .update({ hidden_at: new Date().toISOString() })
    .eq('id', commentId)
}

export async function unhideComment(commentId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = getServiceClient()

  const { data: comment } = await admin
    .from('comments')
    .select('post_id')
    .eq('id', commentId)
    .single()
  if (!comment) throw new Error('Comment not found')

  const { data: post } = await admin
    .from('posts')
    .select('author_id')
    .eq('id', comment.post_id)
    .single()
  if (!post || post.author_id !== user.id) throw new Error('Not authorized')

  await admin
    .from('comments')
    .update({ hidden_at: null })
    .eq('id', commentId)
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
    .select('author_id, post_id')
    .eq('id', commentId)
    .single()

  if (comment && comment.author_id !== user.id) {
    await notifyIfActive(user.id, {
      user_id: comment.author_id,
      type: 'comment_like',
      actor_id: user.id,
      comment_id: commentId,
      post_id: comment.post_id,
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
