-- Comprehensive RLS Security Fix for Production
-- This migration fixes insecure RLS policies and ensures proper data isolation between dealers

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

DROP POLICY IF EXISTS "Users can update their own dealer" ON dealer_settings
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert dealer settings" ON dealer_settings;
CREATE POLICY "Users can insert dealer settings" ON dealer_settings
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

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

-- ============ BANK_ACCOUNTS ============
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

-- ============ BANK_TRANSACTIONS ============
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

-- ============ MANUAL_EXPENSES ============
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'manual_expenses') THEN
    ALTER TABLE manual_expenses ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can view their dealer expenses" ON manual_expenses;
    CREATE POLICY "Users can view their dealer expenses" ON manual_expenses
      FOR SELECT TO authenticated
      USING (user_has_dealer_access(dealer_id));

    DROP POLICY IF EXISTS "Users can insert their dealer expenses" ON manual_expenses;
    CREATE POLICY "Users can insert their dealer expenses" ON manual_expenses
      FOR INSERT TO authenticated
      WITH CHECK (user_has_dealer_access(dealer_id));

    DROP POLICY IF EXISTS "Users can update their dealer expenses" ON manual_expenses;
    CREATE POLICY "Users can update their dealer expenses" ON manual_expenses
      FOR UPDATE TO authenticated
      USING (user_has_dealer_access(dealer_id));

    DROP POLICY IF EXISTS "Users can delete their dealer expenses" ON manual_expenses;
    CREATE POLICY "Users can delete their dealer expenses" ON manual_expenses
      FOR DELETE TO authenticated
      USING (user_has_dealer_access(dealer_id));
  END IF;
END $$;

-- ============ DOCUMENT_PACKAGES ============
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'document_packages') THEN
    ALTER TABLE document_packages ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can view their dealer document packages" ON document_packages;
    CREATE POLICY "Users can view their dealer document packages" ON document_packages
      FOR SELECT TO authenticated
      USING (dealer_id IS NULL OR user_has_dealer_access(dealer_id));

    DROP POLICY IF EXISTS "Users can manage their dealer document packages" ON document_packages;
    CREATE POLICY "Users can manage their dealer document packages" ON document_packages
      FOR ALL TO authenticated
      USING (user_has_dealer_access(dealer_id));
  END IF;
END $$;

-- ============ DEALER_AUTOMATION_RULES ============
DROP POLICY IF EXISTS "Users can view their dealer automation rules" ON dealer_automation_rules;
CREATE POLICY "Users can view their dealer automation rules" ON dealer_automation_rules
  FOR SELECT TO authenticated
  USING (
    -- Convert bigint dealer_id to uuid for comparison (if needed)
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

-- ============ EMAIL_CAMPAIGNS ============
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_campaigns') THEN
    ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can manage their dealer campaigns" ON email_campaigns;
    CREATE POLICY "Users can manage their dealer campaigns" ON email_campaigns
      FOR ALL TO authenticated
      USING (user_has_dealer_access(dealer_id));
  END IF;
END $$;

-- ============ EMAIL_CONTACTS ============
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_contacts') THEN
    ALTER TABLE email_contacts ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can manage their dealer contacts" ON email_contacts;
    CREATE POLICY "Users can manage their dealer contacts" ON email_contacts
      FOR ALL TO authenticated
      USING (user_has_dealer_access(dealer_id));
  END IF;
END $$;

-- ============ SERVICE ROLE POLICIES ============
-- Service role (edge functions) need full access to all tables

CREATE POLICY "Service role full access on dealer_settings" ON dealer_settings
  FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access on inventory" ON inventory
  FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access on deals" ON deals
  FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access on customers" ON customers
  FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access on employees" ON employees
  FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access on bhph_loans" ON bhph_loans
  FOR ALL TO service_role USING (true);

COMMENT ON FUNCTION user_has_dealer_access IS 'Helper function to check if authenticated user can access a dealer (owner or employee)';
