-- Error issues table — groups duplicate errors by message fingerprint
CREATE TABLE error_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  source text NOT NULL CHECK (source IN ('client', 'server', 'server_action', 'api')),
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  occurrence_count int NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_error_issues_status ON error_issues(status, last_seen_at DESC);
CREATE INDEX idx_error_issues_fingerprint ON error_issues(fingerprint);

-- Link error_logs to their issue group
ALTER TABLE error_logs ADD COLUMN IF NOT EXISTS issue_id uuid REFERENCES error_issues(id);
CREATE INDEX idx_error_logs_issue_id ON error_logs(issue_id);

-- RLS — service role only
ALTER TABLE error_issues ENABLE ROW LEVEL SECURITY;
