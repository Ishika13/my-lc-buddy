
-- Prevent self-requests + duplicate friendships in either direction
ALTER TABLE public.friendships
  ADD CONSTRAINT friendships_no_self CHECK (requester_id <> addressee_id);

CREATE UNIQUE INDEX friendships_pair_unique
  ON public.friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));

-- Privacy helper: can the current auth user view stats for _target?
CREATE OR REPLACE FUNCTION public.can_view_user_stats(_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _target = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.friendships
      WHERE status = 'accepted'
        AND (
          (requester_id = auth.uid() AND addressee_id = _target)
          OR (addressee_id = auth.uid() AND requester_id = _target)
        )
    );
$$;

REVOKE ALL ON FUNCTION public.can_view_user_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_user_stats(uuid) TO authenticated;

-- friend_stats: ONLY user_id, current_streak, total_solved
CREATE OR REPLACE VIEW public.friend_stats
WITH (security_barrier = true, security_invoker = false) AS
WITH distinct_days AS (
  SELECT DISTINCT user_id, solved_at FROM public.solves
),
grouped AS (
  SELECT
    user_id,
    solved_at,
    solved_at + (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY solved_at DESC))::int AS anchor
  FROM distinct_days
),
current_run AS (
  SELECT user_id, COUNT(*)::int AS current_streak
  FROM grouped
  WHERE anchor = (CURRENT_DATE + 1)
  GROUP BY user_id
),
totals AS (
  SELECT user_id, COUNT(DISTINCT problem_id)::int AS total_solved
  FROM public.solves
  GROUP BY user_id
)
SELECT
  t.user_id,
  COALESCE(c.current_streak, 0) AS current_streak,
  t.total_solved
FROM totals t
LEFT JOIN current_run c USING (user_id)
WHERE public.can_view_user_stats(t.user_id);

GRANT SELECT ON public.friend_stats TO authenticated;

-- friend_recent_titles: ONLY user_id, title, last_solved_at (top 5 per user)
CREATE OR REPLACE VIEW public.friend_recent_titles
WITH (security_barrier = true, security_invoker = false) AS
SELECT user_id, title, last_solved_at
FROM (
  SELECT
    p.user_id,
    p.title,
    p.last_solved_at,
    ROW_NUMBER() OVER (PARTITION BY p.user_id ORDER BY p.last_solved_at DESC NULLS LAST) AS rn
  FROM public.problems p
  WHERE p.last_solved_at IS NOT NULL
    AND p.title IS NOT NULL
) ranked
WHERE rn <= 5
  AND public.can_view_user_stats(user_id);

GRANT SELECT ON public.friend_recent_titles TO authenticated;
