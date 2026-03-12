-- Add admin/service role policies for investor portal tables
-- The app uses the anon key with authenticated users (dealer owners)
-- These policies allow authenticated users (dealers) to manage investor data

-- Investment Pools: Allow authenticated users full access
DROP POLICY IF EXISTS "Dealers can manage investment pools" ON investment_pools;
CREATE POLICY "Dealers can manage investment pools" ON investment_pools
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Investors: Allow authenticated users full access
DROP POLICY IF EXISTS "Dealers can manage investors" ON investors;
CREATE POLICY "Dealers can manage investors" ON investors
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Investor Pool Shares: Allow authenticated users full access
DROP POLICY IF EXISTS "Dealers can manage pool shares" ON investor_pool_shares;
CREATE POLICY "Dealers can manage pool shares" ON investor_pool_shares
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Investor Capital: Allow authenticated users full access
DROP POLICY IF EXISTS "Dealers can manage investor capital" ON investor_capital;
CREATE POLICY "Dealers can manage investor capital" ON investor_capital
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Investor Vehicles: Allow authenticated users full access
DROP POLICY IF EXISTS "Dealers can manage investor vehicles" ON investor_vehicles;
CREATE POLICY "Dealers can manage investor vehicles" ON investor_vehicles
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Investor Distributions: Allow authenticated users full access
DROP POLICY IF EXISTS "Dealers can manage investor distributions" ON investor_distributions;
CREATE POLICY "Dealers can manage investor distributions" ON investor_distributions
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Investor Reports: Allow authenticated users full access
DROP POLICY IF EXISTS "Dealers can manage investor reports" ON investor_reports;
CREATE POLICY "Dealers can manage investor reports" ON investor_reports
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Pool Transactions: Allow authenticated users full access
DROP POLICY IF EXISTS "Dealers can manage pool transactions" ON pool_transactions;
CREATE POLICY "Dealers can manage pool transactions" ON pool_transactions
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Service role full access on all investor tables
DROP POLICY IF EXISTS "Service role full access on investment_pools" ON investment_pools;
CREATE POLICY "Service role full access on investment_pools" ON investment_pools
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on investors" ON investors;
CREATE POLICY "Service role full access on investors" ON investors
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on investor_pool_shares" ON investor_pool_shares;
CREATE POLICY "Service role full access on investor_pool_shares" ON investor_pool_shares
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on investor_capital" ON investor_capital;
CREATE POLICY "Service role full access on investor_capital" ON investor_capital
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on investor_vehicles" ON investor_vehicles;
CREATE POLICY "Service role full access on investor_vehicles" ON investor_vehicles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on investor_distributions" ON investor_distributions;
CREATE POLICY "Service role full access on investor_distributions" ON investor_distributions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on investor_reports" ON investor_reports;
CREATE POLICY "Service role full access on investor_reports" ON investor_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on pool_transactions" ON pool_transactions;
CREATE POLICY "Service role full access on pool_transactions" ON pool_transactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
