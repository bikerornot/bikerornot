-- Drop any existing CHECK constraint on notifications.type (regardless of name)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'notifications'
      AND nsp.nspname = 'public'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%type%'
  LOOP
    EXECUTE 'ALTER TABLE notifications DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

-- Add fresh constraint with all current types
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'friend_request',
    'friend_accepted',
    'post_like',
    'post_comment',
    'comment_reply',
    'comment_like',
    'group_invite',
    'wall_post'
  ));
