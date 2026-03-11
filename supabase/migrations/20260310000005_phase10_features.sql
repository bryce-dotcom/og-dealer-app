-- ============================================
-- Phase 10: Floor Plan, F&I Products, Auction/Wholesale, Photos, Title & Registration
-- ============================================
-- Created: 2026-03-10

-- ============================================
-- TABLE: floor_plan_lenders
-- ============================================
CREATE TABLE IF NOT EXISTS floor_plan_lenders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,

  lender_name text NOT NULL,
  contact_name text,
  contact_phone text,
  contact_email text,
  account_number text,

  -- Terms
  interest_rate numeric(5,3), -- annual rate e.g. 6.500
  max_days integer DEFAULT 90, -- max days before curtailment
  curtailment_schedule jsonb, -- [{days: 45, percent: 25}, {days: 60, percent: 25}]
  max_advance_percent numeric(5,2) DEFAULT 100, -- max % of cost they'll finance

  -- Limits
  credit_line numeric(12,2),
  current_balance numeric(12,2) DEFAULT 0,
  available_credit numeric(12,2),

  active boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: floor_plan_vehicles
-- ============================================
CREATE TABLE IF NOT EXISTS floor_plan_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  vehicle_id text NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  lender_id uuid NOT NULL REFERENCES floor_plan_lenders(id) ON DELETE CASCADE,

  -- Financing
  advance_amount numeric(10,2) NOT NULL, -- amount financed
  interest_rate numeric(5,3), -- rate for this vehicle
  funded_date date NOT NULL,
  maturity_date date, -- when full payoff is due

  -- Curtailments
  curtailment_1_date date,
  curtailment_1_amount numeric(10,2),
  curtailment_1_paid boolean DEFAULT false,
  curtailment_2_date date,
  curtailment_2_amount numeric(10,2),
  curtailment_2_paid boolean DEFAULT false,
  curtailment_3_date date,
  curtailment_3_amount numeric(10,2),
  curtailment_3_paid boolean DEFAULT false,

  -- Interest
  accrued_interest numeric(10,2) DEFAULT 0,
  interest_paid numeric(10,2) DEFAULT 0,

  -- Payoff
  payoff_amount numeric(10,2),
  paid_off boolean DEFAULT false,
  paid_off_date date,
  paid_off_amount numeric(10,2),

  -- Status
  status text DEFAULT 'active' CHECK (status IN ('active', 'curtailed', 'paid_off', 'defaulted')),
  days_on_plan integer,

  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(dealer_id, vehicle_id, lender_id)
);

-- ============================================
-- TABLE: fi_products
-- ============================================
CREATE TABLE IF NOT EXISTS fi_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,

  product_type text NOT NULL CHECK (product_type IN (
    'gap', 'warranty', 'service_contract', 'tire_wheel',
    'paint_protection', 'theft_deterrent', 'key_replacement',
    'dent_repair', 'windshield', 'maintenance_plan', 'credit_life',
    'disability', 'custom'
  )),
  name text NOT NULL,
  provider text, -- warranty company / vendor
  description text,

  -- Pricing
  dealer_cost numeric(10,2) DEFAULT 0,
  retail_price numeric(10,2) DEFAULT 0,
  profit numeric(10,2) DEFAULT 0, -- retail - cost

  -- Terms
  term_months integer,
  mileage_limit integer,
  deductible numeric(10,2),

  -- Coverage
  coverage_details jsonb, -- [{component, covered, notes}]

  active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: fi_deal_products
-- ============================================
CREATE TABLE IF NOT EXISTS fi_deal_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  deal_id integer NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  product_id uuid REFERENCES fi_products(id) ON DELETE SET NULL,
  vehicle_id text REFERENCES inventory(id) ON DELETE SET NULL,

  product_type text NOT NULL,
  product_name text NOT NULL,

  -- Pricing
  dealer_cost numeric(10,2) DEFAULT 0,
  sell_price numeric(10,2) DEFAULT 0,
  profit numeric(10,2) DEFAULT 0,

  -- Terms
  term_months integer,
  mileage_limit integer,
  deductible numeric(10,2),

  -- Contract
  contract_number text,
  provider text,
  effective_date date,
  expiration_date date,

  -- Status
  status text DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'claimed', 'expired')),
  cancelled_date date,
  refund_amount numeric(10,2),

  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: auction_accounts
-- ============================================
CREATE TABLE IF NOT EXISTS auction_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,

  auction_name text NOT NULL,
  location text,
  contact_name text,
  contact_phone text,
  contact_email text,
  account_number text,
  buyer_number text,

  -- Fees
  buy_fee numeric(10,2) DEFAULT 0,
  sell_fee numeric(10,2) DEFAULT 0,
  registration_fee numeric(10,2) DEFAULT 0,

  active boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: auction_transactions
-- ============================================
CREATE TABLE IF NOT EXISTS auction_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  auction_id uuid NOT NULL REFERENCES auction_accounts(id) ON DELETE CASCADE,
  vehicle_id text REFERENCES inventory(id) ON DELETE SET NULL,

  -- Transaction
  transaction_type text NOT NULL CHECK (transaction_type IN ('buy', 'sell')),
  transaction_date date NOT NULL,
  run_number text,
  lane text,

  -- Vehicle Info (for record keeping even if vehicle deleted)
  vin text,
  year integer,
  make text,
  model text,
  mileage integer,
  condition_grade text, -- auction condition grade

  -- Pricing
  bid_amount numeric(10,2),
  hammer_price numeric(10,2),
  buy_fee numeric(10,2) DEFAULT 0,
  sell_fee numeric(10,2) DEFAULT 0,
  transport_cost numeric(10,2) DEFAULT 0,
  total_cost numeric(10,2), -- hammer + fees + transport (buys)
  total_proceeds numeric(10,2), -- hammer - fees (sells)

  -- Arbitration
  arbitration_status text CHECK (arbitration_status IN ('none', 'filed', 'pending', 'won', 'lost', 'settled')),
  arbitration_reason text,
  arbitration_amount numeric(10,2),
  arbitration_resolved_at timestamptz,

  -- Status
  status text DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled', 'arbitration')),
  payment_status text DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'partial')),
  payment_date date,

  notes text,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: wholesale_buyers
-- ============================================
CREATE TABLE IF NOT EXISTS wholesale_buyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,

  name text NOT NULL,
  company text,
  phone text,
  email text,
  dealer_license text,
  tax_id text,

  -- Preferences
  preferred_makes jsonb, -- ['Toyota', 'Honda']
  preferred_types jsonb, -- ['truck', 'suv']
  price_range_min numeric(10,2),
  price_range_max numeric(10,2),

  -- Stats
  total_purchases integer DEFAULT 0,
  total_spent numeric(12,2) DEFAULT 0,
  last_purchase_date date,

  active boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: vehicle_photos
-- ============================================
CREATE TABLE IF NOT EXISTS vehicle_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  vehicle_id text NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,

  url text NOT NULL,
  storage_path text, -- supabase storage path
  thumbnail_url text,

  -- Metadata
  photo_type text DEFAULT 'exterior' CHECK (photo_type IN (
    'exterior', 'interior', 'engine', 'trunk', 'wheel',
    'damage', 'vin_plate', 'odometer', 'document', 'other'
  )),
  caption text,
  sort_order integer DEFAULT 0,
  is_primary boolean DEFAULT false,

  -- Image Info
  width integer,
  height integer,
  file_size integer, -- bytes
  file_name text,

  -- Processing
  watermarked boolean DEFAULT false,
  watermarked_url text,
  background_removed boolean DEFAULT false,

  uploaded_by integer REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: title_tracking
-- ============================================
CREATE TABLE IF NOT EXISTS title_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  vehicle_id text NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  deal_id integer REFERENCES deals(id) ON DELETE SET NULL,
  customer_id integer REFERENCES customers(id) ON DELETE SET NULL,

  -- Title Info
  title_number text,
  title_state text,
  title_status text DEFAULT 'pending' CHECK (title_status IN (
    'pending', 'received', 'at_dmv', 'processing',
    'issued', 'mailed', 'delivered', 'held', 'problem'
  )),

  -- Dates
  title_received_date date,
  sent_to_dmv_date date,
  new_title_issued_date date,
  mailed_to_customer_date date,
  delivered_date date,

  -- Lien
  lien_holder text,
  lien_release_received boolean DEFAULT false,
  lien_release_date date,

  -- Registration
  registration_status text DEFAULT 'pending' CHECK (registration_status IN (
    'pending', 'submitted', 'processing', 'completed', 'expired'
  )),
  registration_expiry date,
  plate_number text,
  plate_type text,

  -- Temp Tags
  temp_tag_number text,
  temp_tag_issued date,
  temp_tag_expiry date,
  temp_tag_extensions integer DEFAULT 0,

  -- Fees
  title_fee numeric(10,2),
  registration_fee numeric(10,2),
  plate_fee numeric(10,2),
  sales_tax numeric(10,2),
  total_fees numeric(10,2),
  fees_paid boolean DEFAULT false,

  -- Problem tracking
  problem_description text,
  problem_resolved boolean DEFAULT false,

  assigned_to integer REFERENCES employees(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(dealer_id, vehicle_id)
);

-- ============================================
-- INDEXES
-- ============================================

-- Floor Plan
CREATE INDEX IF NOT EXISTS idx_fp_lenders_dealer ON floor_plan_lenders(dealer_id);
CREATE INDEX IF NOT EXISTS idx_fp_vehicles_dealer ON floor_plan_vehicles(dealer_id);
CREATE INDEX IF NOT EXISTS idx_fp_vehicles_vehicle ON floor_plan_vehicles(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fp_vehicles_lender ON floor_plan_vehicles(lender_id);
CREATE INDEX IF NOT EXISTS idx_fp_vehicles_status ON floor_plan_vehicles(status);
CREATE INDEX IF NOT EXISTS idx_fp_vehicles_active ON floor_plan_vehicles(dealer_id) WHERE status = 'active';

-- F&I
CREATE INDEX IF NOT EXISTS idx_fi_products_dealer ON fi_products(dealer_id);
CREATE INDEX IF NOT EXISTS idx_fi_products_type ON fi_products(product_type);
CREATE INDEX IF NOT EXISTS idx_fi_deal_products_dealer ON fi_deal_products(dealer_id);
CREATE INDEX IF NOT EXISTS idx_fi_deal_products_deal ON fi_deal_products(deal_id);

-- Auction
CREATE INDEX IF NOT EXISTS idx_auction_accounts_dealer ON auction_accounts(dealer_id);
CREATE INDEX IF NOT EXISTS idx_auction_txn_dealer ON auction_transactions(dealer_id);
CREATE INDEX IF NOT EXISTS idx_auction_txn_auction ON auction_transactions(auction_id);
CREATE INDEX IF NOT EXISTS idx_auction_txn_vehicle ON auction_transactions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_auction_txn_type ON auction_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_wholesale_buyers_dealer ON wholesale_buyers(dealer_id);

-- Photos
CREATE INDEX IF NOT EXISTS idx_vehicle_photos_dealer ON vehicle_photos(dealer_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_photos_vehicle ON vehicle_photos(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_photos_primary ON vehicle_photos(vehicle_id) WHERE is_primary = true;

-- Title
CREATE INDEX IF NOT EXISTS idx_title_tracking_dealer ON title_tracking(dealer_id);
CREATE INDEX IF NOT EXISTS idx_title_tracking_vehicle ON title_tracking(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_title_tracking_status ON title_tracking(title_status);
CREATE INDEX IF NOT EXISTS idx_title_tracking_deal ON title_tracking(deal_id);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE floor_plan_lenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE floor_plan_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fi_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE fi_deal_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE auction_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE auction_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wholesale_buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE title_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer users access floor_plan_lenders" ON floor_plan_lenders FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access floor_plan_vehicles" ON floor_plan_vehicles FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access fi_products" ON fi_products FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access fi_deal_products" ON fi_deal_products FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access auction_accounts" ON auction_accounts FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access auction_transactions" ON auction_transactions FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access wholesale_buyers" ON wholesale_buyers FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access vehicle_photos" ON vehicle_photos FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access title_tracking" ON title_tracking FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

-- ============================================
-- FUNCTIONS
-- ============================================

-- Calculate floor plan interest for a vehicle
CREATE OR REPLACE FUNCTION calculate_floor_plan_interest(p_vehicle_id uuid)
RETURNS numeric AS $$
DECLARE
  v_result numeric;
BEGIN
  SELECT COALESCE(SUM(
    advance_amount * (interest_rate / 100.0 / 365.0) *
    EXTRACT(DAY FROM (COALESCE(paid_off_date, CURRENT_DATE) - funded_date))
  ), 0) INTO v_result
  FROM floor_plan_vehicles
  WHERE id = p_vehicle_id;
  RETURN ROUND(v_result, 2);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get F&I profit summary for a deal
CREATE OR REPLACE FUNCTION get_fi_deal_summary(p_deal_id integer)
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_products', COUNT(*),
    'total_revenue', COALESCE(SUM(sell_price), 0),
    'total_cost', COALESCE(SUM(dealer_cost), 0),
    'total_profit', COALESCE(SUM(profit), 0),
    'active_products', COUNT(*) FILTER (WHERE status = 'active'),
    'cancelled_products', COUNT(*) FILTER (WHERE status = 'cancelled')
  ) INTO v_result
  FROM fi_deal_products
  WHERE deal_id = p_deal_id;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE floor_plan_lenders IS 'Floor plan financing lender accounts';
COMMENT ON TABLE floor_plan_vehicles IS 'Individual vehicle floor plan financing records';
COMMENT ON TABLE fi_products IS 'F&I product catalog (GAP, warranties, etc.)';
COMMENT ON TABLE fi_deal_products IS 'F&I products sold on specific deals';
COMMENT ON TABLE auction_accounts IS 'Auction house accounts';
COMMENT ON TABLE auction_transactions IS 'Auction buy/sell transaction records';
COMMENT ON TABLE wholesale_buyers IS 'Wholesale buyer contacts and preferences';
COMMENT ON TABLE vehicle_photos IS 'Vehicle photo management and metadata';
COMMENT ON TABLE title_tracking IS 'Title and registration status tracking';
