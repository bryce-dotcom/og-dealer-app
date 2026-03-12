-- ============================================
-- OG Dealer Investor Portal - Database Schema
-- ============================================
-- Created: 2026-03-06
-- Purpose: Enable accredited investors to fund dealer inventory and earn returns

-- ============================================
-- TABLE: investors
-- ============================================
-- Investor accounts and profiles
CREATE TABLE IF NOT EXISTS investors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Personal Information
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text,
  address jsonb, -- { street, city, state, zip }

  -- Accreditation (SEC compliance)
  accredited_investor boolean DEFAULT false,
  identity_verified boolean DEFAULT false,
  accreditation_verified boolean DEFAULT false,
  accreditation_method text, -- 'income', 'net_worth', 'entity', 'professional'
  accreditation_date date,
  verification_documents jsonb, -- URLs to uploaded docs

  -- Financial Summary
  total_invested numeric(12,2) DEFAULT 0.00,
  total_returned numeric(12,2) DEFAULT 0.00,
  total_profit numeric(12,2) DEFAULT 0.00,
  available_balance numeric(12,2) DEFAULT 0.00,
  lifetime_roi numeric(5,2) DEFAULT 0.00, -- %

  -- Banking (Plaid)
  plaid_item_id text,
  plaid_access_token text, -- encrypted
  linked_bank_account jsonb, -- { account_id, name, mask, type }

  -- Status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'closed')),

  -- Metadata
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

-- ============================================
-- TABLE: investment_pools
-- ============================================
-- Shared capital pools that fund vehicles
CREATE TABLE IF NOT EXISTS investment_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Pool Info
  pool_name text NOT NULL,
  description text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'closed', 'liquidating')),

  -- Capital Tracking
  total_capital numeric(12,2) DEFAULT 0.00, -- Total investor capital
  deployed_capital numeric(12,2) DEFAULT 0.00, -- Currently in vehicles
  available_capital numeric(12,2) DEFAULT 0.00, -- Ready to deploy
  reserved_capital numeric(12,2) DEFAULT 0.00, -- Reserved for pending purchases

  -- Performance
  total_profit numeric(12,2) DEFAULT 0.00, -- Lifetime profit generated
  total_vehicles_funded integer DEFAULT 0,
  total_vehicles_sold integer DEFAULT 0,
  lifetime_roi numeric(5,2) DEFAULT 0.00, -- %
  avg_days_to_sell numeric(5,1) DEFAULT 0.0,

  -- Profit Split Terms (percentages)
  investor_profit_share numeric(5,2) DEFAULT 60.00, -- % to investors
  platform_fee_share numeric(5,2) DEFAULT 20.00, -- % to platform
  dealer_profit_share numeric(5,2) DEFAULT 20.00, -- % to dealer

  -- Investment Limits
  min_investment numeric(12,2) DEFAULT 10000.00,
  max_investment numeric(12,2), -- null = unlimited

  -- Banking
  bank_account_name text,
  bank_account_number text, -- encrypted
  bank_routing_number text,
  plaid_item_id text,
  plaid_access_token text, -- encrypted

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT valid_profit_split CHECK (
    investor_profit_share + platform_fee_share + dealer_profit_share = 100.00
  )
);

-- ============================================
-- TABLE: investor_pool_shares
-- ============================================
-- Tracks investor ownership in pools
CREATE TABLE IF NOT EXISTS investor_pool_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id uuid NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  pool_id uuid NOT NULL REFERENCES investment_pools(id) ON DELETE CASCADE,

  -- Ownership
  capital_invested numeric(12,2) NOT NULL,
  ownership_percentage numeric(7,4), -- e.g., 12.3456%

  -- Performance
  total_profit_earned numeric(12,2) DEFAULT 0.00,
  total_distributions numeric(12,2) DEFAULT 0.00,
  current_roi numeric(5,2) DEFAULT 0.00, -- %

  -- Status
  active boolean DEFAULT true,

  joined_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(investor_id, pool_id)
);

-- ============================================
-- TABLE: investor_capital
-- ============================================
-- Capital deposits and withdrawals
CREATE TABLE IF NOT EXISTS investor_capital (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id uuid NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  pool_id uuid REFERENCES investment_pools(id),

  -- Transaction Details
  transaction_type text NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal')),
  amount numeric(12,2) NOT NULL,

  -- Status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),

  -- Payment Details
  payment_method text DEFAULT 'ach' CHECK (payment_method IN ('ach', 'wire', 'check')),
  plaid_transfer_id text,
  plaid_transaction_id text,

  -- Bank Info
  bank_account_last4 text,
  bank_name text,

  -- Timing
  initiated_at timestamptz DEFAULT now(),
  processing_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,

  -- Errors
  error_message text,

  -- Admin
  approved_by uuid REFERENCES auth.users(id),
  notes text,

  created_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: investor_vehicles
-- ============================================
-- Tracks vehicles funded by investment pools
CREATE TABLE IF NOT EXISTS investor_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES investment_pools(id) ON DELETE CASCADE,
  inventory_id text NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,

  -- Investment Details
  capital_deployed numeric(12,2) NOT NULL, -- Amount used from pool
  purchase_price numeric(12,2) NOT NULL,
  purchase_date date,

  -- Sale Details
  sale_price numeric(12,2),
  sale_date date,
  days_held integer, -- Auto-calculated
  gross_profit numeric(12,2), -- sale_price - purchase_price

  -- Profit Split (calculated when sold)
  investor_profit numeric(12,2),
  platform_fee_amount numeric(12,2),
  dealer_profit numeric(12,2),

  -- Additional Costs
  reconditioning_cost numeric(12,2) DEFAULT 0.00,
  holding_cost numeric(12,2) DEFAULT 0.00,
  other_costs numeric(12,2) DEFAULT 0.00,
  total_costs numeric(12,2) GENERATED ALWAYS AS (
    COALESCE(reconditioning_cost, 0) +
    COALESCE(holding_cost, 0) +
    COALESCE(other_costs, 0)
  ) STORED,

  -- Status
  status text DEFAULT 'active' CHECK (status IN ('active', 'sold', 'returned', 'written_off')),

  -- Metadata
  vehicle_info jsonb, -- Cached: { year, make, model, vin, stock_number }
  notes text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(pool_id, inventory_id)
);

-- ============================================
-- TABLE: investor_distributions
-- ============================================
-- Profit payouts to investors
CREATE TABLE IF NOT EXISTS investor_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id uuid NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  pool_id uuid REFERENCES investment_pools(id),
  vehicle_id uuid REFERENCES investor_vehicles(id),

  -- Distribution Details
  distribution_type text NOT NULL CHECK (distribution_type IN ('profit', 'principal_return', 'dividend', 'fee_refund')),
  amount numeric(12,2) NOT NULL,

  -- Payment Status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'processing', 'paid', 'failed', 'cancelled')),
  payment_method text DEFAULT 'ach' CHECK (payment_method IN ('ach', 'wire', 'check')),

  -- Plaid/Bank
  plaid_transfer_id text,
  plaid_transaction_id text,
  bank_account_last4 text,

  -- Timing
  scheduled_date date,
  approved_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,

  -- Admin
  approved_by uuid REFERENCES auth.users(id),
  error_message text,
  notes text,

  created_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: investor_reports
-- ============================================
-- Monthly/Quarterly statements
CREATE TABLE IF NOT EXISTS investor_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id uuid NOT NULL REFERENCES investors(id) ON DELETE CASCADE,

  -- Report Details
  report_type text NOT NULL CHECK (report_type IN ('monthly', 'quarterly', 'annual', 'tax', 'custom')),
  period_start date NOT NULL,
  period_end date NOT NULL,

  -- Summary Data (JSON)
  summary jsonb, -- { vehicles_active, vehicles_sold, capital_deployed, profit_earned, roi, etc }

  -- Files
  pdf_url text,
  csv_url text,

  -- Status
  generated_at timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,

  created_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: pool_transactions
-- ============================================
-- Audit log of all pool account transactions
CREATE TABLE IF NOT EXISTS pool_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES investment_pools(id) ON DELETE CASCADE,

  -- Transaction Details
  transaction_type text NOT NULL, -- 'investor_deposit', 'vehicle_purchase', 'vehicle_sale', 'distribution', 'fee', 'interest'
  amount numeric(12,2) NOT NULL,
  balance_after numeric(12,2),

  -- Related Records
  investor_id uuid REFERENCES investors(id),
  vehicle_id uuid REFERENCES investor_vehicles(id),
  distribution_id uuid REFERENCES investor_distributions(id),
  capital_transaction_id uuid REFERENCES investor_capital(id),

  -- Plaid
  plaid_transaction_id text,
  plaid_category text,

  -- Details
  description text NOT NULL,
  merchant_name text,

  -- Metadata
  metadata jsonb,

  transaction_date timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

-- Investors
CREATE INDEX IF NOT EXISTS idx_investors_user_id ON investors(user_id);
CREATE INDEX IF NOT EXISTS idx_investors_email ON investors(email);
CREATE INDEX IF NOT EXISTS idx_investors_status ON investors(status);
CREATE INDEX IF NOT EXISTS idx_investors_accredited ON investors(accredited_investor) WHERE accredited_investor = true;

-- Investment Pools
CREATE INDEX IF NOT EXISTS idx_investment_pools_status ON investment_pools(status);

-- Pool Shares
CREATE INDEX IF NOT EXISTS idx_pool_shares_investor ON investor_pool_shares(investor_id);
CREATE INDEX IF NOT EXISTS idx_pool_shares_pool ON investor_pool_shares(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_shares_active ON investor_pool_shares(active) WHERE active = true;

-- Capital Transactions
CREATE INDEX IF NOT EXISTS idx_capital_investor ON investor_capital(investor_id);
CREATE INDEX IF NOT EXISTS idx_capital_pool ON investor_capital(pool_id);
CREATE INDEX IF NOT EXISTS idx_capital_status ON investor_capital(status);
CREATE INDEX IF NOT EXISTS idx_capital_type ON investor_capital(transaction_type);
CREATE INDEX IF NOT EXISTS idx_capital_date ON investor_capital(initiated_at DESC);

-- Investor Vehicles
CREATE INDEX IF NOT EXISTS idx_investor_vehicles_pool ON investor_vehicles(pool_id);
CREATE INDEX IF NOT EXISTS idx_investor_vehicles_inventory ON investor_vehicles(inventory_id);
CREATE INDEX IF NOT EXISTS idx_investor_vehicles_dealer ON investor_vehicles(dealer_id);
CREATE INDEX IF NOT EXISTS idx_investor_vehicles_status ON investor_vehicles(status);
CREATE INDEX IF NOT EXISTS idx_investor_vehicles_purchase_date ON investor_vehicles(purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_investor_vehicles_sale_date ON investor_vehicles(sale_date DESC);

-- Distributions
CREATE INDEX IF NOT EXISTS idx_distributions_investor ON investor_distributions(investor_id);
CREATE INDEX IF NOT EXISTS idx_distributions_pool ON investor_distributions(pool_id);
CREATE INDEX IF NOT EXISTS idx_distributions_vehicle ON investor_distributions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_distributions_status ON investor_distributions(status);
CREATE INDEX IF NOT EXISTS idx_distributions_type ON investor_distributions(distribution_type);
CREATE INDEX IF NOT EXISTS idx_distributions_scheduled ON investor_distributions(scheduled_date);

-- Reports
CREATE INDEX IF NOT EXISTS idx_reports_investor ON investor_reports(investor_id);
CREATE INDEX IF NOT EXISTS idx_reports_type ON investor_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_reports_period ON investor_reports(period_start, period_end);

-- Pool Transactions
CREATE INDEX IF NOT EXISTS idx_pool_transactions_pool ON pool_transactions(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_transactions_investor ON pool_transactions(investor_id);
CREATE INDEX IF NOT EXISTS idx_pool_transactions_type ON pool_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_pool_transactions_date ON pool_transactions(transaction_date DESC);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE investor_pool_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE investor_capital ENABLE ROW LEVEL SECURITY;
ALTER TABLE investor_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE investor_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE investor_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_transactions ENABLE ROW LEVEL SECURITY;

-- Investors: Can only see their own profile
DROP POLICY IF EXISTS "Investors can view their own profile" ON investors;
CREATE POLICY "Investors can view their own profile" ON investors
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Investors can update their own profile" ON investors;
CREATE POLICY "Investors can update their own profile" ON investors
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Investment Pools: Investors can view pools they're invested in
DROP POLICY IF EXISTS "Investors can view pools they're in" ON investment_pools;
CREATE POLICY "Investors can view pools they're in" ON investment_pools
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT pool_id FROM investor_pool_shares
      WHERE investor_id IN (
        SELECT id FROM investors WHERE user_id = auth.uid()
      )
    )
  );

-- Pool Shares: Investors can view their own shares
DROP POLICY IF EXISTS "Investors can view their own shares" ON investor_pool_shares;
CREATE POLICY "Investors can view their own shares" ON investor_pool_shares
  FOR SELECT TO authenticated
  USING (
    investor_id IN (
      SELECT id FROM investors WHERE user_id = auth.uid()
    )
  );

-- Capital: Investors can view their own transactions
DROP POLICY IF EXISTS "Investors can view their own capital transactions" ON investor_capital;
CREATE POLICY "Investors can view their own capital transactions" ON investor_capital
  FOR SELECT TO authenticated
  USING (
    investor_id IN (
      SELECT id FROM investors WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Investors can create capital transactions" ON investor_capital;
CREATE POLICY "Investors can create capital transactions" ON investor_capital
  FOR INSERT TO authenticated
  WITH CHECK (
    investor_id IN (
      SELECT id FROM investors WHERE user_id = auth.uid()
    )
  );

-- Vehicles: Investors can view vehicles in their pools
DROP POLICY IF EXISTS "Investors can view vehicles in their pools" ON investor_vehicles;
CREATE POLICY "Investors can view vehicles in their pools" ON investor_vehicles
  FOR SELECT TO authenticated
  USING (
    pool_id IN (
      SELECT pool_id FROM investor_pool_shares
      WHERE investor_id IN (
        SELECT id FROM investors WHERE user_id = auth.uid()
      )
    )
  );

-- Distributions: Investors can view their own distributions
DROP POLICY IF EXISTS "Investors can view their own distributions" ON investor_distributions;
CREATE POLICY "Investors can view their own distributions" ON investor_distributions
  FOR SELECT TO authenticated
  USING (
    investor_id IN (
      SELECT id FROM investors WHERE user_id = auth.uid()
    )
  );

-- Reports: Investors can view their own reports
DROP POLICY IF EXISTS "Investors can view their own reports" ON investor_reports;
CREATE POLICY "Investors can view their own reports" ON investor_reports
  FOR SELECT TO authenticated
  USING (
    investor_id IN (
      SELECT id FROM investors WHERE user_id = auth.uid()
    )
  );

-- Pool Transactions: Investors can view transactions for their pools
DROP POLICY IF EXISTS "Investors can view transactions for their pools" ON pool_transactions;
CREATE POLICY "Investors can view transactions for their pools" ON pool_transactions
  FOR SELECT TO authenticated
  USING (
    pool_id IN (
      SELECT pool_id FROM investor_pool_shares
      WHERE investor_id IN (
        SELECT id FROM investors WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================
-- ADMIN POLICIES (Dealers)
-- ============================================

-- Dealers can manage everything for their pools
-- (Will add dealer_id to pools in future iteration)

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_investors_updated_at ON investors;
CREATE TRIGGER update_investors_updated_at BEFORE UPDATE ON investors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_investment_pools_updated_at ON investment_pools;
CREATE TRIGGER update_investment_pools_updated_at BEFORE UPDATE ON investment_pools
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_investor_pool_shares_updated_at ON investor_pool_shares;
CREATE TRIGGER update_investor_pool_shares_updated_at BEFORE UPDATE ON investor_pool_shares
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_investor_vehicles_updated_at ON investor_vehicles;
CREATE TRIGGER update_investor_vehicles_updated_at BEFORE UPDATE ON investor_vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- FUNCTIONS
-- ============================================

-- Calculate ownership percentage when shares change
CREATE OR REPLACE FUNCTION calculate_pool_ownership()
RETURNS TRIGGER AS $$
DECLARE
  pool_total numeric(12,2);
BEGIN
  -- Get total capital in pool
  SELECT COALESCE(SUM(capital_invested), 0) INTO pool_total
  FROM investor_pool_shares
  WHERE pool_id = NEW.pool_id AND active = true;

  -- Calculate ownership percentage
  IF pool_total > 0 THEN
    NEW.ownership_percentage := (NEW.capital_invested / pool_total) * 100;
  ELSE
    NEW.ownership_percentage := 0;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calculate_ownership_on_insert ON investor_pool_shares;
CREATE TRIGGER calculate_ownership_on_insert BEFORE INSERT ON investor_pool_shares
  FOR EACH ROW EXECUTE FUNCTION calculate_pool_ownership();

DROP TRIGGER IF EXISTS calculate_ownership_on_update ON investor_pool_shares;
CREATE TRIGGER calculate_ownership_on_update BEFORE UPDATE ON investor_pool_shares
  FOR EACH ROW EXECUTE FUNCTION calculate_pool_ownership();

-- Calculate days held when vehicle is marked as sold
CREATE OR REPLACE FUNCTION calculate_vehicle_days_held()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'sold' AND NEW.sale_date IS NOT NULL AND NEW.purchase_date IS NOT NULL THEN
    NEW.days_held := NEW.sale_date - NEW.purchase_date;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calculate_days_held_on_sale ON investor_vehicles;
CREATE TRIGGER calculate_days_held_on_sale BEFORE UPDATE ON investor_vehicles
  FOR EACH ROW
  WHEN (NEW.status = 'sold' AND OLD.status != 'sold')
  EXECUTE FUNCTION calculate_vehicle_days_held();

-- ============================================
-- COMMENTS (Documentation)
-- ============================================

COMMENT ON TABLE investors IS 'Accredited investors who fund vehicle inventory';
COMMENT ON TABLE investment_pools IS 'Shared capital pools that fund multiple vehicles';
COMMENT ON TABLE investor_pool_shares IS 'Tracks investor ownership % in pools';
COMMENT ON TABLE investor_capital IS 'Deposits and withdrawals by investors';
COMMENT ON TABLE investor_vehicles IS 'Vehicles funded by investment capital';
COMMENT ON TABLE investor_distributions IS 'Profit payouts to investors';
COMMENT ON TABLE investor_reports IS 'Monthly/quarterly investor statements';
COMMENT ON TABLE pool_transactions IS 'Audit log of all pool account transactions';

COMMENT ON COLUMN investors.accredited_investor IS 'SEC-required: Must verify investor meets accreditation criteria';
COMMENT ON COLUMN investors.plaid_access_token IS 'Encrypted Plaid token for bank account access';
COMMENT ON COLUMN investment_pools.investor_profit_share IS 'Percentage of profit distributed to investors (default 60%)';
COMMENT ON COLUMN investor_vehicles.capital_deployed IS 'Amount of pool capital used to purchase this vehicle';
COMMENT ON COLUMN investor_distributions.distribution_type IS 'Type: profit (from sales), principal_return (refund), dividend (interest)';
