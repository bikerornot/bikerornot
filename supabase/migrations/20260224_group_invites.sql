-- Add group_id to notifications for group invite linking
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES groups(id) ON DELETE CASCADE;

-- Extend the type CHECK constraint to include group_invite
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('friend_request', 'friend_accepted', 'post_like', 'post_comment', 'comment_reply', 'comment_like', 'group_invite'));
