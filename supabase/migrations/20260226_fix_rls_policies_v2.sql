-- Comprehensive RLS Security Fix for Production (Safe Version)
-- This migration fixes insecure RLS policies and ensures proper data isolation between dealers

-- First, ensure employees table has user_id column
ALTER TABLE employees ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees(user_id) WHERE user_id IS NOT NULL;

-- Helper function to check if user has access to a dealer
CREATE OR REPLACE FUNCTION user_has_dealer_access(check_dealer_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM dealer_settings
    WHERE id = check_dealer_id
    AND (
      -- User is the owner
      owner_user_id = auth.uid()
      -- OR user is an employee of this dealer
      OR EXISTS (
        SELECT 1 FROM employees
        WHERE dealer_id = check_dealer_id
        AND user_id = auth.uid()
      )
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============ DEALER_SETTINGS ============
ALTER TABLE dealer_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own dealer" ON dealer_settings;
CREATE POLICY "Users can view their own dealer" ON dealer_settings
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM employees WHERE dealer_id = dealer_settings.id AND user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can update their own dealer" ON dealer_settings;
CREATE POLICY "Users can update their own dealer" ON dealer_settings
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert dealer settings" ON dealer_settings;
CREATE POLICY "Users can insert dealer settings" ON dealer_settings
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access on dealer_settings" ON dealer_settings;
CREATE POLICY "Service role full access on dealer_settings" ON dealer_settings
  FOR ALL TO service_role USING (true);

-- ============ INVENTORY ============
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their dealer inventory" ON inventory;
CREATE POLICY "Users can view their dealer inventory" ON inventory
  FOR SELECT TO authenticated
  USING (user_has_dealer_access(dealer_id));

DROP POLICY IF EXISTS "Users can insert their dealer inventory" ON inventory;
CREATE POLICY "Users can insert their dealer inventory" ON inventory
  FOR INSERT TO authenticated
  WITH CHECK (user_has_dealer_access(dealer_id));

DROP POLICY IF EXISTS "Users can update their dealer inventory" ON inventory;
CREATE POLICY "Users can update their dealer inventory" ON inventory
  FOR UPDATE TO authenticated
  USING (user_has_dealer_access(dealer_id));

DROP POLICY IF EXISTS "Users can delete their dealer inventory" ON inventory;
CREATE POLICY "Users can delete their dealer inventory" ON inventory
  FOR DELETE TO authenticated
  USING (user_has_dealer_access(dealer_id));

DROP POLICY IF EXISTS "Service role full access on inventory" ON inventory;
CREATE POLICY "Service role full access on inventory" ON inventory
  FOR ALL TO service_role USING (true);

-- ============ DEALS ============
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their dealer deals" ON deals;
CREATE POLICY "Users can view their dealer deals" ON deals
  FOR SELECT TO authenticated
  USING (user_has_dealer_access(dealer_id));

DROP POLICY IF EXISTS "Users can insert their dealer deals" ON deals;
CREATE POLICY "Users can insert their dealer deals" ON deals
  FOR INSERT TO authenticated
  WITH CHECK (user_has_dealer_access(dealer_id));

DROP POLICY IF EXISTS "Users can update their dealer deals" ON deals;
CREATE POLICY "Users can update their dealer deals" ON deals
  FOR UPDATE TO authenticated
  USING (user_has_dealer_access(dealer_id));

DROP POLICY IF EXISTS "Users can delete their dealer deals" ON deals;
CREATE POLICY "Users can delete their dealer deals" ON deals
  FOR DELETE TO authenticated
  USING (user_has_dealer_access(dealer_id));

DROP POLICY IF EXISTS "Service role full access on deals" ON deals;
CREATE POLICY "Service role full access on deals" ON deals
  FOR ALL TO service_role USING (true);

-- ============ CUSTOMERS ============
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their dealer customers" ON customers;
CREATE POLICY "Users can view their dealer customers" ON customers
  FOR SELECT TO authenticated
  USING (user_has_dealer_access(dealer_id));

DROP POLICY IF EXISTS "Users can insert their dealer customers" ON customers;
CREATE POLICY "Users can insert their dealer customers" ON customers
  FOR INSERT TO authenticated
  WITH CHECK (user_has_dealer_access(dealer_id));

DROP POLICY IF EXISTS "Users can update their dealer customers" ON customers;
CREATE POLICY "Users can update their dealer customers" ON customers
  FOR UPDATE TO authenticated
  USING (user_has_dealer_access(dealer_id));

DROP POLICY IF EXISTS "Users can delete their dealer customers" ON customers;
CREATE POLICY "Users can delete their dealer customers" ON customers
  FOR DELETE TO authenticated
  USING (user_has_dealer_access(dealer_id));

DROP POLICY IF EXISTS "Service role full access on customers" ON customers;
CREATE POLICY "Service role full access on customers" ON customers
  FOR ALL TO service_role USING (true);

-- ============ EMPLOYEES ============
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their dealer employees" ON employees;
CREATE POLICY "Users can view their dealer employees" ON employees
  FOR SELECT TO authenticated
  USING (user_has_dealer_access(dealer_id));

DROP POLICY IF EXISTS "Owners can manage employees" ON employees;
CREATE POLICY "Owners can manage employees" ON employees
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dealer_settings
      WHERE id = employees.dealer_id AND owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role full access on employees" ON employees;
CREATE POLICY "Service role full access on employees" ON employees
  FOR ALL TO service_role USING (true);

-- ============ BHPH_LOANS ============
ALTER TABLE bhph_loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their dealer bhph loans" ON bhph_loans;
CREATE POLICY "Users can view their dealer bhph loans" ON bhph_loans
  FOR SELECT TO authenticated
  USING (user_has_dealer_access(dealer_id));

DROP POLICY IF EXISTS "Users can insert their dealer bhph loans" ON bhph_loans;
CREATE POLICY "Users can insert their dealer bhph loans" ON bhph_loans
  FOR INSERT TO authenticated
  WITH CHECK (user_has_dealer_access(dealer_id));

DROP POLICY IF EXISTS "Users can update their dealer bhph loans" ON bhph_loans;
CREATE POLICY "Users can update their dealer bhph loans" ON bhph_loans
  FOR UPDATE TO authenticated
  USING (user_has_dealer_access(dealer_id));

DROP POLICY IF EXISTS "Service role full access on bhph_loans" ON bhph_loans;
CREATE POLICY "Service role full access on bhph_loans" ON bhph_loans
  FOR ALL TO service_role USING (true);

-- ============ BANK_ACCOUNTS (Fix broken policies) ============
DROP POLICY IF EXISTS "Users can view their dealer bank accounts" ON bank_accounts;
CREATE POLICY "Users can view their dealer bank accounts" ON bank_accounts
  FOR SELECT TO authenticated
  USING (user_has_dealer_access(dealer_id));

DROP POLICY IF EXISTS "Users can insert their dealer bank accounts" ON bank_accounts;
CREATE POLICY "Users can insert their dealer bank accounts" ON bank_accounts
  FOR INSERT TO authenticated
  WITH CHECK (user_has_dealer_access(dealer_id));

DROP POLICY IF EXISTS "Users can update their dealer bank accounts" ON bank_accounts;
CREATE POLICY "Users can update their dealer bank accounts" ON bank_accounts
  FOR UPDATE TO authenticated
  USING (user_has_dealer_access(dealer_id));

-- ============ BANK_TRANSACTIONS (Fix broken policies) ============
DROP POLICY IF EXISTS "Users can view their dealer transactions" ON bank_transactions;
CREATE POLICY "Users can view their dealer transactions" ON bank_transactions
  FOR SELECT TO authenticated
  USING (user_has_dealer_access(dealer_id));

DROP POLICY IF EXISTS "Users can insert their dealer transactions" ON bank_transactions;
CREATE POLICY "Users can insert their dealer transactions" ON bank_transactions
  FOR INSERT TO authenticated
  WITH CHECK (user_has_dealer_access(dealer_id));

DROP POLICY IF EXISTS "Users can update their dealer transactions" ON bank_transactions;
CREATE POLICY "Users can update their dealer transactions" ON bank_transactions
  FOR UPDATE TO authenticated
  USING (user_has_dealer_access(dealer_id));

-- ============ DEALER_AUTOMATION_RULES (Fix USING true policies) ============
DROP POLICY IF EXISTS "Users can view their dealer automation rules" ON dealer_automation_rules;
CREATE POLICY "Users can view their dealer automation rules" ON dealer_automation_rules
  FOR SELECT TO authenticated
  USING (
    user_has_dealer_access(
      (SELECT id FROM dealer_settings WHERE id::text = dealer_id::text LIMIT 1)
    )
  );

DROP POLICY IF EXISTS "Users can insert their dealer automation rules" ON dealer_automation_rules;
CREATE POLICY "Users can insert their dealer automation rules" ON dealer_automation_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    user_has_dealer_access(
      (SELECT id FROM dealer_settings WHERE id::text = dealer_id::text LIMIT 1)
    )
  );

DROP POLICY IF EXISTS "Users can update their dealer automation rules" ON dealer_automation_rules;
CREATE POLICY "Users can update their dealer automation rules" ON dealer_automation_rules
  FOR UPDATE TO authenticated
  USING (
    user_has_dealer_access(
      (SELECT id FROM dealer_settings WHERE id::text = dealer_id::text LIMIT 1)
    )
  );

DROP POLICY IF EXISTS "Users can delete their dealer automation rules" ON dealer_automation_rules;
CREATE POLICY "Users can delete their dealer automation rules" ON dealer_automation_rules
  FOR DELETE TO authenticated
  USING (
    user_has_dealer_access(
      (SELECT id FROM dealer_settings WHERE id::text = dealer_id::text LIMIT 1)
    )
  );

COMMENT ON FUNCTION user_has_dealer_access IS 'Helper function to check if authenticated user can access a dealer (owner or employee)';
COMMENT ON COLUMN employees.user_id IS 'Auth user ID linked to this employee for login access';
