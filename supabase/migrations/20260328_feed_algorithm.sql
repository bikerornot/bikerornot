-- Scored feed algorithm: friends/groups first, then engagement-ranked discovery
-- Returns post IDs with scores, like counts, and comment counts for display

CREATE OR REPLACE FUNCTION get_feed_post_ids(
  p_user_id uuid,
  p_friend_ids uuid[],
  p_group_ids uuid[],
  p_blocked_ids uuid[],
  p_page_size int DEFAULT 10,
  p_offset int DEFAULT 0
) RETURNS TABLE (
  post_id uuid,
  feed_score double precision,
  like_count bigint,
  comment_count bigint
)
LANGUAGE sql STABLE
AS $$
  WITH eligible AS (
    SELECT p.id, p.author_id, p.group_id, p.created_at
    FROM posts p
    JOIN profiles a ON a.id = p.author_id AND a.status = 'active'
    WHERE p.deleted_at IS NULL
      AND p.wall_owner_id IS NULL
      AND p.bike_id IS NULL
      AND (p.group_id IS NULL OR p.group_id = ANY(p_group_ids))
      AND (cardinality(p_blocked_ids) = 0 OR NOT (p.author_id = ANY(p_blocked_ids)))
      AND p.created_at > now() - interval '14 days'
  ),
  like_agg AS (
    SELECT pl.post_id, count(*) as cnt
    FROM post_likes pl
    WHERE pl.post_id IN (SELECT id FROM eligible)
    GROUP BY pl.post_id
  ),
  comment_agg AS (
    SELECT c.post_id, count(*) as cnt
    FROM comments c
    JOIN profiles pr ON pr.id = c.author_id AND pr.status = 'active'
    WHERE c.post_id IN (SELECT id FROM eligible)
      AND c.deleted_at IS NULL
    GROUP BY c.post_id
  ),
  share_agg AS (
    SELECT sp.shared_post_id as post_id, count(*) as cnt
    FROM posts sp
    WHERE sp.shared_post_id IN (SELECT id FROM eligible)
      AND sp.deleted_at IS NULL
    GROUP BY sp.shared_post_id
  )
  SELECT
    e.id as post_id,
    CASE
      -- Tier 1: Own posts, friend posts, and group posts — scored high with recency ordering
      WHEN e.author_id = p_user_id
           OR e.author_id = ANY(p_friend_ids)
           OR (e.group_id IS NOT NULL AND e.group_id = ANY(p_group_ids))
      THEN 10000.0 - EXTRACT(EPOCH FROM now() - e.created_at) / 3600.0
      -- Tier 2: Discovery — engagement-weighted with time decay
      ELSE (COALESCE(lc.cnt, 0) + COALESCE(cc.cnt, 0) * 3 + COALESCE(sc.cnt, 0) * 5 + 1)::double precision
           / POWER(EXTRACT(EPOCH FROM now() - e.created_at) / 3600.0 + 2.0, 1.2)
    END as feed_score,
    COALESCE(lc.cnt, 0) as like_count,
    COALESCE(cc.cnt, 0) as comment_count
  FROM eligible e
  LEFT JOIN like_agg lc ON lc.post_id = e.id
  LEFT JOIN comment_agg cc ON cc.post_id = e.id
  LEFT JOIN share_agg sc ON sc.post_id = e.id
  ORDER BY feed_score DESC, e.created_at DESC
  LIMIT p_page_size
  OFFSET p_offset;
$$;
