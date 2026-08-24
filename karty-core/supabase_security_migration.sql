-- Apply once to the existing Supabase project. Run in Supabase SQL Editor.
-- The old policies were permissive and must be removed before the secure ones.

DROP POLICY IF EXISTS "Anon can do all platform_sessions matching user_id" ON platform_sessions;
DROP POLICY IF EXISTS "Anon can do all listings matching user_id" ON listings;
DROP POLICY IF EXISTS "Anon can do all presentations matching user_id" ON presentations;
DROP POLICY IF EXISTS "Anon can do all planner_notes matching user_id" ON planner_notes;
DROP POLICY IF EXISTS "Anon can do all planner_tasks matching user_id" ON planner_tasks;

CREATE POLICY "Users own platform sessions" ON platform_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users own listings" ON listings
  FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users own presentations" ON presentations
  FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users own planner notes" ON planner_notes
  FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users own planner tasks" ON planner_tasks
  FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);
