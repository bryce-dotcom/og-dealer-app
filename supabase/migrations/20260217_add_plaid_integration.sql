-- Add Plaid integration columns to bank_accounts table

-- First ensure bank_accounts table exists
CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  account_name TEXT,
  account_type TEXT, -- checking, savings, credit_card
  current_balance DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add Plaid-specific columns
ALTER TABLE bank_accounts
ADD COLUMN IF NOT EXISTS plaid_access_token TEXT,
ADD COLUMN IF NOT EXISTS plaid_item_id TEXT,
ADD COLUMN IF NOT EXISTS plaid_account_id TEXT,
ADD COLUMN IF NOT EXISTS institution_name TEXT,
ADD COLUMN IF NOT EXISTS institution_logo TEXT,
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS is_plaid_connected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS plaid_error TEXT,
ADD COLUMN IF NOT EXISTS account_mask TEXT; -- last 4 digits

-- Ensure bank_transactions table exists
CREATE TABLE IF NOT EXISTS bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE CASCADE,
  plaid_transaction_id TEXT,
  merchant_name TEXT,
  amount DECIMAL(10,2),
  transaction_date DATE,
  pending BOOLEAN DEFAULT false,
  category_id UUID REFERENCES expense_categories(id),
  status TEXT DEFAULT 'inbox', -- inbox, booked, ignored
  is_income BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for faster transaction queries
CREATE INDEX IF NOT EXISTS idx_bank_transactions_dealer ON bank_transactions(dealer_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_status ON bank_transactions(dealer_id, status);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_dealer ON bank_accounts(dealer_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_plaid_item ON bank_accounts(plaid_item_id) WHERE plaid_item_id IS NOT NULL;

-- Enable RLS
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for bank_accounts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bank_accounts' AND policyname = 'Users can view their dealer bank accounts'
  ) THEN
    CREATE POLICY "Users can view their dealer bank accounts"
    ON bank_accounts FOR SELECT
    TO authenticated
    USING (dealer_id IN (SELECT id FROM dealer_settings WHERE id = dealer_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bank_accounts' AND policyname = 'Users can insert their dealer bank accounts'
  ) THEN
    CREATE POLICY "Users can insert their dealer bank accounts"
    ON bank_accounts FOR INSERT
    TO authenticated
    WITH CHECK (dealer_id IN (SELECT id FROM dealer_settings WHERE id = dealer_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bank_accounts' AND policyname = 'Users can update their dealer bank accounts'
  ) THEN
    CREATE POLICY "Users can update their dealer bank accounts"
    ON bank_accounts FOR UPDATE
    TO authenticated
    USING (dealer_id IN (SELECT id FROM dealer_settings WHERE id = dealer_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bank_accounts' AND policyname = 'Service role full access on bank_accounts'
  ) THEN
    CREATE POLICY "Service role full access on bank_accounts"
    ON bank_accounts FOR ALL
    TO service_role
    USING (true);
  END IF;
END $$;

-- RLS Policies for bank_transactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bank_transactions' AND policyname = 'Users can view their dealer transactions'
  ) THEN
    CREATE POLICY "Users can view their dealer transactions"
    ON bank_transactions FOR SELECT
    TO authenticated
    USING (dealer_id IN (SELECT id FROM dealer_settings WHERE id = dealer_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bank_transactions' AND policyname = 'Users can insert their dealer transactions'
  ) THEN
    CREATE POLICY "Users can insert their dealer transactions"
    ON bank_transactions FOR INSERT
    TO authenticated
    WITH CHECK (dealer_id IN (SELECT id FROM dealer_settings WHERE id = dealer_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bank_transactions' AND policyname = 'Users can update their dealer transactions'
  ) THEN
    CREATE POLICY "Users can update their dealer transactions"
    ON bank_transactions FOR UPDATE
    TO authenticated
    USING (dealer_id IN (SELECT id FROM dealer_settings WHERE id = dealer_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bank_transactions' AND policyname = 'Service role full access on bank_transactions'
  ) THEN
    CREATE POLICY "Service role full access on bank_transactions"
    ON bank_transactions FOR ALL
    TO service_role
    USING (true);
  END IF;
END $$;

-- Create expense_categories table if it doesn't exist
CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID REFERENCES dealer_settings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📄',
  color TEXT DEFAULT '#3b82f6',
  type TEXT DEFAULT 'expense', -- income or expense
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default expense categories
INSERT INTO expense_categories (dealer_id, name, icon, color, type, sort_order) VALUES
(NULL, 'Vehicle Sale', '🚗', '#22c55e', 'income', 1),
(NULL, 'Down Payment', '💵', '#22c55e', 'income', 2),
(NULL, 'BHPH Payment', '📋', '#22c55e', 'income', 3),
(NULL, 'Inventory Purchase', '🚙', '#ef4444', 'expense', 10),
(NULL, 'Reconditioning', '🔧', '#ef4444', 'expense', 11),
(NULL, 'Advertising', '📢', '#f97316', 'expense', 12),
(NULL, 'Insurance', '🛡️', '#8b5cf6', 'expense', 13),
(NULL, 'Utilities', '💡', '#3b82f6', 'expense', 14),
(NULL, 'Payroll', '👥', '#ec4899', 'expense', 15),
(NULL, 'Rent/Lease', '🏢', '#6366f1', 'expense', 16),
(NULL, 'Office Supplies', '📎', '#14b8a6', 'expense', 17),
(NULL, 'Fuel', '⛽', '#f59e0b', 'expense', 18),
(NULL, 'Taxes', '🏛️', '#dc2626', 'expense', 19),
(NULL, 'Legal/Professional', '⚖️', '#7c3aed', 'expense', 20),
(NULL, 'Other', '📌', '#71717a', 'expense', 99)
ON CONFLICT DO NOTHING;

-- Enable RLS on expense_categories
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'expense_categories' AND policyname = 'Users can view expense categories'
  ) THEN
    CREATE POLICY "Users can view expense categories"
    ON expense_categories FOR SELECT
    TO authenticated
    USING (dealer_id IS NULL OR dealer_id IN (SELECT id FROM dealer_settings));
  END IF;
END $$;
