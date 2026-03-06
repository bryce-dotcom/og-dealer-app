-- ============================================
-- Fix Marketplace RLS Policies
-- ============================================
-- Use the same pattern as other tables (user_has_dealer_access function)

-- Drop old policies
DROP POLICY IF EXISTS marketplace_settings_dealer_isolation ON marketplace_settings;
DROP POLICY IF EXISTS marketplace_listings_dealer_isolation ON marketplace_listings;
DROP POLICY IF EXISTS marketplace_sync_log_dealer_isolation ON marketplace_sync_log;

-- Create correct policies using user_has_dealer_access function

-- marketplace_settings
CREATE POLICY "Users can view their dealer marketplace settings" ON marketplace_settings
  FOR SELECT TO authenticated
  USING (user_has_dealer_access(dealer_id));

CREATE POLICY "Users can insert their dealer marketplace settings" ON marketplace_settings
  FOR INSERT TO authenticated
  WITH CHECK (user_has_dealer_access(dealer_id));

CREATE POLICY "Users can update their dealer marketplace settings" ON marketplace_settings
  FOR UPDATE TO authenticated
  USING (user_has_dealer_access(dealer_id))
  WITH CHECK (user_has_dealer_access(dealer_id));

CREATE POLICY "Users can delete their dealer marketplace settings" ON marketplace_settings
  FOR DELETE TO authenticated
  USING (user_has_dealer_access(dealer_id));

-- marketplace_listings
CREATE POLICY "Users can view their dealer marketplace listings" ON marketplace_listings
  FOR SELECT TO authenticated
  USING (user_has_dealer_access(dealer_id));

CREATE POLICY "Users can insert their dealer marketplace listings" ON marketplace_listings
  FOR INSERT TO authenticated
  WITH CHECK (user_has_dealer_access(dealer_id));

CREATE POLICY "Users can update their dealer marketplace listings" ON marketplace_listings
  FOR UPDATE TO authenticated
  USING (user_has_dealer_access(dealer_id))
  WITH CHECK (user_has_dealer_access(dealer_id));

CREATE POLICY "Users can delete their dealer marketplace listings" ON marketplace_listings
  FOR DELETE TO authenticated
  USING (user_has_dealer_access(dealer_id));

-- marketplace_sync_log
CREATE POLICY "Users can view their dealer marketplace sync log" ON marketplace_sync_log
  FOR SELECT TO authenticated
  USING (user_has_dealer_access(dealer_id));

CREATE POLICY "Users can insert their dealer marketplace sync log" ON marketplace_sync_log
  FOR INSERT TO authenticated
  WITH CHECK (user_has_dealer_access(dealer_id));

CREATE POLICY "Users can update their dealer marketplace sync log" ON marketplace_sync_log
  FOR UPDATE TO authenticated
  USING (user_has_dealer_access(dealer_id))
  WITH CHECK (user_has_dealer_access(dealer_id));

CREATE POLICY "Users can delete their dealer marketplace sync log" ON marketplace_sync_log
  FOR DELETE TO authenticated
  USING (user_has_dealer_access(dealer_id));
