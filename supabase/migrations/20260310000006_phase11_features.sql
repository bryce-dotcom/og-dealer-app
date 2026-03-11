-- ============================================
-- Phase 11: Vendors, Test Drives, Key/Lot Tracking, Warranty Claims, Tasks
-- ============================================
-- Created: 2026-03-10

-- ============================================
-- TABLE: vendors
-- ============================================
CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,

  name text NOT NULL,
  company text,
  vendor_type text DEFAULT 'general' CHECK (vendor_type IN (
    'mechanic', 'body_shop', 'detail', 'parts', 'tires',
    'glass', 'electrical', 'transport', 'auction', 'general'
  )),
  phone text,
  email text,
  address text,
  city text,
  state text,
  zip text,

  -- Payment
  payment_terms text, -- 'net30', 'cod', 'prepaid'
  tax_id text,
  w9_on_file boolean DEFAULT false,

  -- Stats
  total_paid numeric(12,2) DEFAULT 0,
  total_jobs integer DEFAULT 0,
  avg_rating numeric(3,1),
  last_used_at timestamptz,

  active boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: vendor_payments
-- ============================================
CREATE TABLE IF NOT EXISTS vendor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  vehicle_id text REFERENCES inventory(id) ON DELETE SET NULL,

  description text NOT NULL,
  amount numeric(10,2) NOT NULL,
  payment_date date NOT NULL,
  payment_method text CHECK (payment_method IN ('check', 'cash', 'card', 'ach', 'other')),
  reference_number text,
  category text,

  invoice_number text,
  invoice_date date,
  due_date date,
  status text DEFAULT 'paid' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),

  notes text,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: test_drives
-- ============================================
CREATE TABLE IF NOT EXISTS test_drives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  vehicle_id text NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  customer_id integer REFERENCES customers(id) ON DELETE SET NULL,

  -- Customer Info
  customer_name text NOT NULL,
  customer_phone text,
  customer_email text,

  -- License
  license_number text,
  license_state text,
  license_expiry date,
  license_verified boolean DEFAULT false,
  license_photo_url text,

  -- Insurance
  insurance_company text,
  insurance_policy text,
  insurance_verified boolean DEFAULT false,

  -- Drive Details
  salesperson_id integer REFERENCES employees(id) ON DELETE SET NULL,
  salesperson_name text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_minutes integer,
  mileage_out integer,
  mileage_in integer,
  route_notes text,

  -- Outcome
  outcome text DEFAULT 'pending' CHECK (outcome IN (
    'pending', 'interested', 'not_interested', 'follow_up', 'sold', 'no_show'
  )),
  feedback text,
  follow_up_date date,

  -- Status
  status text DEFAULT 'active' CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),

  notes text,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: key_tracking
-- ============================================
CREATE TABLE IF NOT EXISTS key_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  vehicle_id text NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,

  -- Key Info
  key_count integer DEFAULT 1,
  key_type text DEFAULT 'standard' CHECK (key_type IN ('standard', 'fob', 'smart', 'proximity', 'valet', 'spare')),
  has_spare boolean DEFAULT false,

  -- Location
  hook_number text, -- key board hook number
  current_location text DEFAULT 'key_board' CHECK (current_location IN (
    'key_board', 'salesperson', 'service', 'customer', 'detail', 'office', 'lost', 'other'
  )),
  checked_out_to integer REFERENCES employees(id) ON DELETE SET NULL,
  checked_out_name text,
  checked_out_at timestamptz,
  checked_out_reason text,

  -- History tracked via updated_at
  last_verified_at timestamptz,

  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(dealer_id, vehicle_id)
);

-- ============================================
-- TABLE: lot_positions
-- ============================================
CREATE TABLE IF NOT EXISTS lot_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  vehicle_id text REFERENCES inventory(id) ON DELETE SET NULL,

  -- Position
  lot_name text DEFAULT 'Main',
  row_label text, -- 'A', 'B', 'C'
  spot_number text, -- '1', '2', '3'
  position_label text, -- computed: 'A-1', 'B-3'
  zone text, -- 'front', 'back', 'showroom', 'service', 'overflow'

  -- Status
  occupied boolean DEFAULT false,
  reserved boolean DEFAULT false,
  reserved_for text,

  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(dealer_id, lot_name, row_label, spot_number)
);

-- ============================================
-- TABLE: warranty_claims
-- ============================================
CREATE TABLE IF NOT EXISTS warranty_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  vehicle_id text NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  deal_id integer REFERENCES deals(id) ON DELETE SET NULL,
  customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
  fi_product_id uuid REFERENCES fi_deal_products(id) ON DELETE SET NULL,

  -- Claim Info
  claim_number text,
  claim_type text DEFAULT 'warranty' CHECK (claim_type IN (
    'warranty', 'goodwill', 'recall', 'service_contract', 'gap'
  )),
  provider text,
  provider_claim_number text,

  -- Vehicle/Issue
  mileage_at_claim integer,
  complaint text NOT NULL,
  cause text,
  correction text,
  parts_used jsonb, -- [{part, quantity, cost}]

  -- Costs
  parts_cost numeric(10,2) DEFAULT 0,
  labor_cost numeric(10,2) DEFAULT 0,
  total_cost numeric(10,2) DEFAULT 0,
  deductible numeric(10,2) DEFAULT 0,

  -- Payment
  approved_amount numeric(10,2),
  paid_amount numeric(10,2),
  dealer_responsibility numeric(10,2) DEFAULT 0,

  -- Dates
  submitted_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  denied_at timestamptz,
  paid_at timestamptz,
  completed_at timestamptz,

  -- Status
  status text DEFAULT 'draft' CHECK (status IN (
    'draft', 'submitted', 'under_review', 'approved',
    'denied', 'paid', 'completed', 'appealed'
  )),
  denial_reason text,
  appeal_notes text,

  assigned_to integer REFERENCES employees(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: dealer_tasks
-- ============================================
CREATE TABLE IF NOT EXISTS dealer_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,

  title text NOT NULL,
  description text,
  category text DEFAULT 'general' CHECK (category IN (
    'general', 'sales', 'finance', 'service', 'admin',
    'compliance', 'marketing', 'inventory', 'customer', 'other'
  )),
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  -- Assignment
  assigned_to integer REFERENCES employees(id) ON DELETE SET NULL,
  assigned_name text,
  created_by integer REFERENCES employees(id) ON DELETE SET NULL,
  created_by_name text,

  -- Dates
  due_date date,
  started_at timestamptz,
  completed_at timestamptz,

  -- Status
  status text DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'completed', 'cancelled')),

  -- Relations
  vehicle_id text REFERENCES inventory(id) ON DELETE SET NULL,
  deal_id integer REFERENCES deals(id) ON DELETE SET NULL,
  customer_id integer REFERENCES customers(id) ON DELETE SET NULL,

  -- Checklist
  checklist jsonb, -- [{item, completed, completed_at}]

  -- Tags
  tags jsonb, -- ['urgent', 'follow-up']

  sort_order integer DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

-- Vendors
CREATE INDEX IF NOT EXISTS idx_vendors_dealer ON vendors(dealer_id);
CREATE INDEX IF NOT EXISTS idx_vendors_type ON vendors(vendor_type);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_dealer ON vendor_payments(dealer_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor ON vendor_payments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_vehicle ON vendor_payments(vehicle_id);

-- Test Drives
CREATE INDEX IF NOT EXISTS idx_test_drives_dealer ON test_drives(dealer_id);
CREATE INDEX IF NOT EXISTS idx_test_drives_vehicle ON test_drives(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_test_drives_customer ON test_drives(customer_id);
CREATE INDEX IF NOT EXISTS idx_test_drives_status ON test_drives(status);
CREATE INDEX IF NOT EXISTS idx_test_drives_date ON test_drives(started_at DESC);

-- Key Tracking
CREATE INDEX IF NOT EXISTS idx_key_tracking_dealer ON key_tracking(dealer_id);
CREATE INDEX IF NOT EXISTS idx_key_tracking_vehicle ON key_tracking(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_key_tracking_location ON key_tracking(current_location);

-- Lot Positions
CREATE INDEX IF NOT EXISTS idx_lot_positions_dealer ON lot_positions(dealer_id);
CREATE INDEX IF NOT EXISTS idx_lot_positions_vehicle ON lot_positions(vehicle_id);

-- Warranty Claims
CREATE INDEX IF NOT EXISTS idx_warranty_claims_dealer ON warranty_claims(dealer_id);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_vehicle ON warranty_claims(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_deal ON warranty_claims(deal_id);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_status ON warranty_claims(status);

-- Tasks
CREATE INDEX IF NOT EXISTS idx_dealer_tasks_dealer ON dealer_tasks(dealer_id);
CREATE INDEX IF NOT EXISTS idx_dealer_tasks_assigned ON dealer_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_dealer_tasks_status ON dealer_tasks(status);
CREATE INDEX IF NOT EXISTS idx_dealer_tasks_due ON dealer_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_dealer_tasks_vehicle ON dealer_tasks(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_dealer_tasks_deal ON dealer_tasks(deal_id);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_drives ENABLE ROW LEVEL SECURITY;
ALTER TABLE key_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE lot_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE warranty_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealer_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer users access vendors" ON vendors FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access vendor_payments" ON vendor_payments FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access test_drives" ON test_drives FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access key_tracking" ON key_tracking FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access lot_positions" ON lot_positions FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access warranty_claims" ON warranty_claims FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access dealer_tasks" ON dealer_tasks FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE vendors IS 'Vendor and service provider management';
COMMENT ON TABLE vendor_payments IS 'Vendor payment history';
COMMENT ON TABLE test_drives IS 'Test drive log with license and insurance verification';
COMMENT ON TABLE key_tracking IS 'Vehicle key location tracking';
COMMENT ON TABLE lot_positions IS 'Lot map parking spot assignments';
COMMENT ON TABLE warranty_claims IS 'Warranty and service contract claims';
COMMENT ON TABLE dealer_tasks IS 'Internal task management for team';
