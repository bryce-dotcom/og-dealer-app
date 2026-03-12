-- Fix RLS policies for AI research tables
-- Changes from current_setting('app.current_dealer_id') to auth.uid() pattern

-- Drop old policies
DROP POLICY IF EXISTS dealer_vehicle_preferences_policy ON dealer_vehicle_preferences;
DROP POLICY IF EXISTS vehicle_ai_analysis_policy ON vehicle_ai_analysis;
DROP POLICY IF EXISTS market_intelligence_cache_policy ON market_intelligence_cache;

-- Create new policies using auth.uid()
DROP POLICY IF EXISTS dealer_vehicle_preferences_policy ON dealer_vehicle_preferences;
CREATE POLICY dealer_vehicle_preferences_policy ON dealer_vehicle_preferences
  FOR ALL USING (
    dealer_id IN (
      SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS vehicle_ai_analysis_policy ON vehicle_ai_analysis;
CREATE POLICY vehicle_ai_analysis_policy ON vehicle_ai_analysis
  FOR ALL USING (
    dealer_id IN (
      SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS market_intelligence_cache_policy ON market_intelligence_cache;
CREATE POLICY market_intelligence_cache_policy ON market_intelligence_cache
  FOR ALL USING (
    dealer_id IN (
      SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid()
    )
  );
