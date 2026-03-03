-- Pin search_path on all public functions to prevent mutable search_path attacks.
-- get_user_activity_counts already has search_path set, so it's skipped here.

ALTER FUNCTION public.get_friendship_status(uuid, uuid) SET search_path = '';
ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.set_updated_at() SET search_path = '';
