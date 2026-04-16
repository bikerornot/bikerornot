-- Message requests: decouple messaging from friendship graph.
-- Non-friends can send one intro message that lands in a "Requests" bucket;
-- recipient can Accept, Ignore, or Block. See docs/message-requests-plan.md.

-- 1. Conversation status + origin tracking
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('request', 'active', 'ignored')),
  ADD COLUMN IF NOT EXISTS initiated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ignored_at timestamptz;

-- Existing conversations backfilled to 'active' by the DEFAULT.

-- 2. Per-user privacy preference for who can send the first message
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS message_privacy text NOT NULL DEFAULT 'everyone'
    CHECK (message_privacy IN ('everyone', 'friends_only'));

-- 3. Inbox query indexes (partial — status='ignored' rarely queried)
CREATE INDEX IF NOT EXISTS idx_conversations_p1_status
  ON conversations(participant1_id, status) WHERE status IN ('request', 'active');
CREATE INDEX IF NOT EXISTS idx_conversations_p2_status
  ON conversations(participant2_id, status) WHERE status IN ('request', 'active');

-- 4. Cooldown lookup: "has this sender been ignored by this recipient in last 30 days?"
CREATE INDEX IF NOT EXISTS idx_conversations_cooldown
  ON conversations(initiated_by, ignored_at) WHERE ignored_at IS NOT NULL;
