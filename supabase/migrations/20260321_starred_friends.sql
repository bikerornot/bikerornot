-- Add starred_at to friendships for "Top Friends" sorting
-- NULL = not starred, timestamp = starred (private to the user who starred)
ALTER TABLE friendships ADD COLUMN IF NOT EXISTS starred_by_requester timestamptz;
ALTER TABLE friendships ADD COLUMN IF NOT EXISTS starred_by_addressee timestamptz;
