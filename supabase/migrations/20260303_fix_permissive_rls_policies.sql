-- Fix overly permissive INSERT RLS policies (WITH CHECK = true)

-- dmca_counter_notices: restrict to user's own rows
DROP POLICY IF EXISTS "Anyone can submit counter notice" ON public.dmca_counter_notices;
CREATE POLICY "Users can submit their own counter notice"
  ON public.dmca_counter_notices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- dmca_notices: require authentication (inserts go through service role anyway)
DROP POLICY IF EXISTS "Anyone can submit DMCA notice" ON public.dmca_notices;
CREATE POLICY "Authenticated users can submit DMCA notice"
  ON public.dmca_notices FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
