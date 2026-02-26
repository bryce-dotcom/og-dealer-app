-- RLS Security Fix - Owner Access Only (Production Safe)
-- Secures core tables immediately. Employee access can be added later.

-- ============ DEALER_SETTINGS ============
ALTER TABLE dealer_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view their dealer" ON dealer_settings;
CREATE POLICY "Owners can view their dealer" ON dealer_settings
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Owners can update their dealer" ON dealer_settings;
CREATE POLICY "Owners can update their dealer" ON dealer_settings
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Owners can insert dealer" ON dealer_settings;
CREATE POLICY "Owners can insert dealer" ON dealer_settings
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access dealer_settings" ON dealer_settings;
CREATE POLICY "Service role full access dealer_settings" ON dealer_settings
  FOR ALL TO service_role USING (true);

-- ============ INVENTORY ============
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can access inventory" ON inventory;
CREATE POLICY "Owners can access inventory" ON inventory
  FOR ALL TO authenticated
  USING (
    dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Service role full access inventory" ON inventory;
CREATE POLICY "Service role full access inventory" ON inventory
  FOR ALL TO service_role USING (true);

-- ============ DEALS ============
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can access deals" ON deals;
CREATE POLICY "Owners can access deals" ON deals
  FOR ALL TO authenticated
  USING (
    dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Service role full access deals" ON deals;
CREATE POLICY "Service role full access deals" ON deals
  FOR ALL TO service_role USING (true);

-- ============ CUSTOMERS ============
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can access customers" ON customers;
CREATE POLICY "Owners can access customers" ON customers
  FOR ALL TO authenticated
  USING (
    dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Service role full access customers" ON customers;
CREATE POLICY "Service role full access customers" ON customers
  FOR ALL TO service_role USING (true);

-- ============ EMPLOYEES ============
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can access employees" ON employees;
CREATE POLICY "Owners can access employees" ON employees
  FOR ALL TO authenticated
  USING (
    dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Service role full access employees" ON employees;
CREATE POLICY "Service role full access employees" ON employees
  FOR ALL TO service_role USING (true);

-- ============ BHPH_LOANS ============
ALTER TABLE bhph_loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can access bhph_loans" ON bhph_loans;
CREATE POLICY "Owners can access bhph_loans" ON bhph_loans
  FOR ALL TO authenticated
  USING (
    dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Service role full access bhph_loans" ON bhph_loans;
CREATE POLICY "Service role full access bhph_loans" ON bhph_loans
  FOR ALL TO service_role USING (true);

-- ============ BANK_ACCOUNTS ============
DROP POLICY IF EXISTS "Owners can access bank_accounts" ON bank_accounts;
CREATE POLICY "Owners can access bank_accounts" ON bank_accounts
  FOR ALL TO authenticated
  USING (
    dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Service role full access bank_accounts" ON bank_accounts;
CREATE POLICY "Service role full access bank_accounts" ON bank_accounts
  FOR ALL TO service_role USING (true);

-- ============ BANK_TRANSACTIONS ============
DROP POLICY IF EXISTS "Owners can access bank_transactions" ON bank_transactions;
CREATE POLICY "Owners can access bank_transactions" ON bank_transactions
  FOR ALL TO authenticated
  USING (
    dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Service role full access bank_transactions" ON bank_transactions;
CREATE POLICY "Service role full access bank_transactions" ON bank_transactions
  FOR ALL TO service_role USING (true);

-- ============ DEALER_AUTOMATION_RULES ============
DROP POLICY IF EXISTS "Owners can access dealer_automation_rules" ON dealer_automation_rules;
CREATE POLICY "Owners can access dealer_automation_rules" ON dealer_automation_rules
  FOR ALL TO authenticated
  USING (
    dealer_id::text IN (SELECT id::text FROM dealer_settings WHERE owner_user_id = auth.uid())
  );
