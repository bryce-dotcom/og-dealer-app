-- Fix infinite recursion in RLS policies between dealer_settings and employees
-- The problem: dealer_settings policy queries employees, employees policy queries dealer_settings
-- Both use inline subqueries (NOT SECURITY DEFINER), so they trigger each other's RLS = infinite loop
-- The fix: use a SECURITY DEFINER function that bypasses RLS to get dealer IDs

-- Step 1: Create a SECURITY DEFINER function that returns all dealer IDs the user can access
CREATE OR REPLACE FUNCTION get_user_dealer_ids()
RETURNS SETOF bigint AS $$
  SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid()
  UNION
  SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Step 2: Fix dealer_settings policies (remove direct employees subquery)
DROP POLICY IF EXISTS "Users can view their own dealer" ON dealer_settings;
CREATE POLICY "Users can view their own dealer" ON dealer_settings
  FOR SELECT TO authenticated
  USING (id IN (SELECT get_user_dealer_ids()));

DROP POLICY IF EXISTS "Users can update their own dealer" ON dealer_settings;
CREATE POLICY "Users can update their own dealer" ON dealer_settings
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert dealer settings" ON dealer_settings;
CREATE POLICY "Users can insert dealer settings" ON dealer_settings
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

-- Step 3: Fix employees policies (remove direct dealer_settings subquery)
DROP POLICY IF EXISTS "Users can view their dealer employees" ON employees;
CREATE POLICY "Users can view their dealer employees" ON employees
  FOR SELECT TO authenticated
  USING (dealer_id IN (SELECT get_user_dealer_ids()));

DROP POLICY IF EXISTS "Owners can manage employees" ON employees;
CREATE POLICY "Owners can manage employees" ON employees
  FOR ALL TO authenticated
  USING (dealer_id IN (SELECT get_user_dealer_ids()));

DROP POLICY IF EXISTS "Service role full access on dealer_settings" ON dealer_settings;
CREATE POLICY "Service role full access on dealer_settings" ON dealer_settings
  FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "Service role full access on employees" ON employees;
CREATE POLICY "Service role full access on employees" ON employees
  FOR ALL TO service_role USING (true);
