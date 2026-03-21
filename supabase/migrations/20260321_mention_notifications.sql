-- Add 'mention' to the notifications type CHECK constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('friend_request', 'friend_accepted', 'post_like', 'post_comment', 'comment_reply', 'comment_like', 'group_invite', 'wall_post', 'dmca_takedown', 'mention'));
