-- ============================================
-- Phase 12: Service Orders, Lenders, Deal Jackets, Inspections, Reviews
-- ============================================
-- Created: 2026-03-10

-- ============================================
-- TABLE: service_orders
-- ============================================
CREATE TABLE IF NOT EXISTS service_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  vehicle_id text REFERENCES inventory(id) ON DELETE SET NULL,
  customer_id integer REFERENCES customers(id) ON DELETE SET NULL,

  -- Order Info
  order_number text,
  order_type text DEFAULT 'repair' CHECK (order_type IN (
    'repair', 'maintenance', 'detail', 'inspection', 'warranty', 'recall', 'internal', 'customer_pay'
  )),
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  -- Vehicle at time of service
  mileage_in integer,
  mileage_out integer,
  customer_concern text,
  diagnosis text,
  recommendation text,

  -- Assignment
  technician_id integer REFERENCES employees(id) ON DELETE SET NULL,
  technician_name text,
  advisor_id integer REFERENCES employees(id) ON DELETE SET NULL,
  advisor_name text,

  -- Costs
  parts_cost numeric(10,2) DEFAULT 0,
  labor_cost numeric(10,2) DEFAULT 0,
  sublet_cost numeric(10,2) DEFAULT 0,
  tax numeric(10,2) DEFAULT 0,
  discount numeric(10,2) DEFAULT 0,
  total numeric(10,2) DEFAULT 0,

  -- Payment
  payment_method text CHECK (payment_method IN ('cash', 'check', 'card', 'warranty', 'internal', 'other')),
  paid boolean DEFAULT false,
  paid_at timestamptz,
  invoice_number text,

  -- Dates
  promised_date date,
  started_at timestamptz,
  completed_at timestamptz,

  -- Status
  status text DEFAULT 'open' CHECK (status IN (
    'estimate', 'open', 'in_progress', 'waiting_parts', 'waiting_approval',
    'completed', 'invoiced', 'closed', 'cancelled'
  )),

  -- Vendor sublet
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,

  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: service_line_items
-- ============================================
CREATE TABLE IF NOT EXISTS service_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,

  line_type text DEFAULT 'labor' CHECK (line_type IN ('labor', 'parts', 'sublet', 'fee', 'discount')),
  description text NOT NULL,
  quantity numeric(10,2) DEFAULT 1,
  unit_price numeric(10,2) DEFAULT 0,
  total numeric(10,2) DEFAULT 0,

  -- Parts specific
  part_number text,
  part_source text, -- 'stock', 'ordered', 'customer'

  -- Labor specific
  labor_hours numeric(6,2),
  labor_rate numeric(10,2),

  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: lenders
-- ============================================
CREATE TABLE IF NOT EXISTS lenders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,

  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  fax text,
  website text,
  address text,
  city text,
  state text,
  zip text,

  -- Lending details
  lender_type text DEFAULT 'bank' CHECK (lender_type IN (
    'bank', 'credit_union', 'captive', 'subprime', 'bhph', 'online', 'other'
  )),
  min_credit_score integer,
  max_ltv numeric(5,2),
  min_amount numeric(10,2),
  max_amount numeric(10,2),
  flat_fee numeric(10,2),
  reserve_flat numeric(10,2),
  reserve_percent numeric(5,2),

  -- Rate info
  base_rate numeric(5,2),
  max_rate numeric(5,2),
  max_term_new integer, -- months
  max_term_used integer,
  max_vehicle_age integer, -- years
  max_vehicle_miles integer,

  -- Relationship
  dealer_number text,
  portal_url text,
  portal_username text,
  submission_method text CHECK (submission_method IN ('dealertrack', 'routeone', 'cudl', 'manual', 'portal', 'email', 'fax')),

  -- Stats
  total_funded integer DEFAULT 0,
  total_funded_amount numeric(12,2) DEFAULT 0,
  avg_approval_days numeric(4,1),
  approval_rate numeric(5,2),
  last_funded_at timestamptz,

  active boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: lender_submissions
-- ============================================
CREATE TABLE IF NOT EXISTS lender_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  lender_id uuid NOT NULL REFERENCES lenders(id) ON DELETE CASCADE,
  deal_id integer REFERENCES deals(id) ON DELETE SET NULL,
  customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
  vehicle_id text REFERENCES inventory(id) ON DELETE SET NULL,

  -- Submission
  submitted_at timestamptz DEFAULT now(),
  submitted_by integer REFERENCES employees(id) ON DELETE SET NULL,
  submission_method text,

  -- Request
  amount_requested numeric(10,2),
  term_requested integer,
  rate_requested numeric(5,2),

  -- Response
  status text DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'conditional', 'countered', 'declined', 'expired', 'funded'
  )),
  approved_amount numeric(10,2),
  approved_rate numeric(5,2),
  approved_term integer,
  buy_rate numeric(5,2),
  reserve_amount numeric(10,2),
  conditions text,
  stipulations jsonb, -- [{stip, satisfied, date}]
  decline_reason text,

  -- Funding
  funded_at timestamptz,
  funded_amount numeric(10,2),
  funding_delay_days integer,

  response_at timestamptz,
  expires_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: deal_jackets
-- ============================================
CREATE TABLE IF NOT EXISTS deal_jackets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  deal_id integer NOT NULL REFERENCES deals(id) ON DELETE CASCADE,

  -- Checklist
  status text DEFAULT 'incomplete' CHECK (status IN ('incomplete', 'complete', 'archived')),
  completion_percent numeric(5,2) DEFAULT 0,
  reviewed_by integer REFERENCES employees(id) ON DELETE SET NULL,
  reviewed_at timestamptz,

  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: deal_jacket_documents
-- ============================================
CREATE TABLE IF NOT EXISTS deal_jacket_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_jacket_id uuid NOT NULL REFERENCES deal_jackets(id) ON DELETE CASCADE,
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,

  document_name text NOT NULL,
  document_type text DEFAULT 'other' CHECK (document_type IN (
    'buyers_guide', 'bill_of_sale', 'title', 'registration', 'insurance',
    'credit_app', 'contract', 'addendum', 'disclosure', 'warranty',
    'trade_title', 'payoff_letter', 'stip', 'id_copy', 'proof_income',
    'proof_residence', 'power_of_attorney', 'odometer', 'lien_release', 'other'
  )),
  required boolean DEFAULT false,
  received boolean DEFAULT false,
  received_at timestamptz,
  verified boolean DEFAULT false,
  verified_by integer REFERENCES employees(id) ON DELETE SET NULL,
  verified_at timestamptz,

  file_url text,
  file_name text,
  file_size integer,

  expiry_date date,
  notes text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: vehicle_inspections
-- ============================================
CREATE TABLE IF NOT EXISTS vehicle_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  vehicle_id text NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,

  inspection_type text DEFAULT 'purchase' CHECK (inspection_type IN (
    'purchase', 'trade_in', 'delivery', 'safety', 'emissions', 'recon', 'custom'
  )),
  inspector_id integer REFERENCES employees(id) ON DELETE SET NULL,
  inspector_name text,

  -- Results
  overall_condition text CHECK (overall_condition IN ('excellent', 'good', 'fair', 'poor', 'salvage')),
  pass boolean,
  score numeric(5,1), -- 0-100

  -- Sections (jsonb for flexibility)
  exterior jsonb, -- [{item, condition, notes, photo_url}]
  interior jsonb,
  mechanical jsonb,
  electrical jsonb,
  tires_brakes jsonb,
  underbody jsonb,
  fluids jsonb,

  -- Issues found
  issues_found integer DEFAULT 0,
  critical_issues integer DEFAULT 0,
  estimated_repair_cost numeric(10,2) DEFAULT 0,

  -- Dates
  inspected_at timestamptz DEFAULT now(),
  expires_at date,

  mileage integer,
  photos jsonb, -- [url, url]
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: customer_reviews
-- ============================================
CREATE TABLE IF NOT EXISTS customer_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
  deal_id integer REFERENCES deals(id) ON DELETE SET NULL,
  salesperson_id integer REFERENCES employees(id) ON DELETE SET NULL,

  -- Review Source
  platform text DEFAULT 'internal' CHECK (platform IN (
    'google', 'facebook', 'yelp', 'cars_com', 'autotrader',
    'dealerrater', 'carfax', 'bbb', 'internal', 'other'
  )),
  external_review_id text,
  external_url text,

  -- Review Content
  reviewer_name text NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title text,
  review_text text,
  review_date date NOT NULL DEFAULT CURRENT_DATE,

  -- Response
  responded boolean DEFAULT false,
  response_text text,
  responded_by integer REFERENCES employees(id) ON DELETE SET NULL,
  responded_at timestamptz,

  -- Moderation
  flagged boolean DEFAULT false,
  flag_reason text,
  verified_purchase boolean DEFAULT false,
  featured boolean DEFAULT false,
  visible boolean DEFAULT true,

  -- Sentiment
  sentiment text CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  tags jsonb, -- ['service', 'price', 'experience']

  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

-- Service Orders
CREATE INDEX IF NOT EXISTS idx_service_orders_dealer ON service_orders(dealer_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_vehicle ON service_orders(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_customer ON service_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_status ON service_orders(status);
CREATE INDEX IF NOT EXISTS idx_service_orders_technician ON service_orders(technician_id);
CREATE INDEX IF NOT EXISTS idx_service_line_items_order ON service_line_items(service_order_id);
CREATE INDEX IF NOT EXISTS idx_service_line_items_dealer ON service_line_items(dealer_id);

-- Lenders
CREATE INDEX IF NOT EXISTS idx_lenders_dealer ON lenders(dealer_id);
CREATE INDEX IF NOT EXISTS idx_lenders_type ON lenders(lender_type);
CREATE INDEX IF NOT EXISTS idx_lender_submissions_dealer ON lender_submissions(dealer_id);
CREATE INDEX IF NOT EXISTS idx_lender_submissions_lender ON lender_submissions(lender_id);
CREATE INDEX IF NOT EXISTS idx_lender_submissions_deal ON lender_submissions(deal_id);
CREATE INDEX IF NOT EXISTS idx_lender_submissions_status ON lender_submissions(status);

-- Deal Jackets
CREATE INDEX IF NOT EXISTS idx_deal_jackets_dealer ON deal_jackets(dealer_id);
CREATE INDEX IF NOT EXISTS idx_deal_jackets_deal ON deal_jackets(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_jacket_docs_jacket ON deal_jacket_documents(deal_jacket_id);
CREATE INDEX IF NOT EXISTS idx_deal_jacket_docs_dealer ON deal_jacket_documents(dealer_id);

-- Inspections
CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_dealer ON vehicle_inspections(dealer_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_vehicle ON vehicle_inspections(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_type ON vehicle_inspections(inspection_type);

-- Reviews
CREATE INDEX IF NOT EXISTS idx_customer_reviews_dealer ON customer_reviews(dealer_id);
CREATE INDEX IF NOT EXISTS idx_customer_reviews_customer ON customer_reviews(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_reviews_platform ON customer_reviews(platform);
CREATE INDEX IF NOT EXISTS idx_customer_reviews_rating ON customer_reviews(rating);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE lenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE lender_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_jackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_jacket_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer users access service_orders" ON service_orders FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access service_line_items" ON service_line_items FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access lenders" ON lenders FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access lender_submissions" ON lender_submissions FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access deal_jackets" ON deal_jackets FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access deal_jacket_documents" ON deal_jacket_documents FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access vehicle_inspections" ON vehicle_inspections FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access customer_reviews" ON customer_reviews FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE service_orders IS 'Vehicle service and repair work orders';
COMMENT ON TABLE service_line_items IS 'Line items for service orders (labor, parts, fees)';
COMMENT ON TABLE lenders IS 'Lending partner management with rate info';
COMMENT ON TABLE lender_submissions IS 'Deal submissions to lenders with approval tracking';
COMMENT ON TABLE deal_jackets IS 'Digital deal jacket document checklists';
COMMENT ON TABLE deal_jacket_documents IS 'Individual documents within a deal jacket';
COMMENT ON TABLE vehicle_inspections IS 'Vehicle inspection reports with section scoring';
COMMENT ON TABLE customer_reviews IS 'Customer review and reputation management';