-- Error logging table for tracking client and server errors
CREATE TABLE error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('client', 'server', 'server_action', 'api')),
  message text NOT NULL,
  stack text,
  url text,
  user_id uuid REFERENCES profiles(id),
  user_agent text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for admin queries
CREATE INDEX idx_error_logs_created_at ON error_logs(created_at DESC);
CREATE INDEX idx_error_logs_source ON error_logs(source, created_at DESC);

-- RLS — service role only
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
