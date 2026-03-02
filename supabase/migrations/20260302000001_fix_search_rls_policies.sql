-- Fix RLS policies for saved_vehicle_searches and deal_alerts
-- Issue: current_setting('app.current_dealer_id') doesn't work from frontend
-- Solution: Use auth.uid() to get user, join to dealer_settings to get dealer_id

-- Drop existing policies
DROP POLICY IF EXISTS saved_searches_select ON saved_vehicle_searches;
DROP POLICY IF EXISTS saved_searches_insert ON saved_vehicle_searches;
DROP POLICY IF EXISTS saved_searches_update ON saved_vehicle_searches;
DROP POLICY IF EXISTS saved_searches_delete ON saved_vehicle_searches;

DROP POLICY IF EXISTS deal_alerts_select ON deal_alerts;
DROP POLICY IF EXISTS deal_alerts_insert ON deal_alerts;
DROP POLICY IF EXISTS deal_alerts_update ON deal_alerts;
DROP POLICY IF EXISTS deal_alerts_delete ON deal_alerts;

-- Create new policies that work with auth.uid()
-- saved_vehicle_searches policies
CREATE POLICY saved_searches_select ON saved_vehicle_searches
  FOR SELECT USING (
    dealer_id IN (
      SELECT id FROM dealer_settings WHERE user_id = auth.uid()
    )
  );

CREATE POLICY saved_searches_insert ON saved_vehicle_searches
  FOR INSERT WITH CHECK (
    dealer_id IN (
      SELECT id FROM dealer_settings WHERE user_id = auth.uid()
    )
  );

CREATE POLICY saved_searches_update ON saved_vehicle_searches
  FOR UPDATE USING (
    dealer_id IN (
      SELECT id FROM dealer_settings WHERE user_id = auth.uid()
    )
  );

CREATE POLICY saved_searches_delete ON saved_vehicle_searches
  FOR DELETE USING (
    dealer_id IN (
      SELECT id FROM dealer_settings WHERE user_id = auth.uid()
    )
  );

-- deal_alerts policies
CREATE POLICY deal_alerts_select ON deal_alerts
  FOR SELECT USING (
    dealer_id IN (
      SELECT id FROM dealer_settings WHERE user_id = auth.uid()
    )
  );

CREATE POLICY deal_alerts_insert ON deal_alerts
  FOR INSERT WITH CHECK (true); -- Service role inserts from Edge Functions

CREATE POLICY deal_alerts_update ON deal_alerts
  FOR UPDATE USING (
    dealer_id IN (
      SELECT id FROM dealer_settings WHERE user_id = auth.uid()
    )
  );

CREATE POLICY deal_alerts_delete ON deal_alerts
  FOR DELETE USING (
    dealer_id IN (
      SELECT id FROM dealer_settings WHERE user_id = auth.uid()
    )
  );

-- Verify
SELECT tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('saved_vehicle_searches', 'deal_alerts')
ORDER BY tablename, policyname;
