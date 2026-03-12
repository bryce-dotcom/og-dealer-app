-- ============================================
-- Phase 8: Compliance, Marketplace Listings, CRM Workflows, Customer Portal, Lead Management
-- ============================================
-- Created: 2026-03-10

-- ============================================
-- TABLE: compliance_tracking
-- ============================================
-- Tracks dealer licensing, insurance, bonds, and regulatory deadlines
CREATE TABLE IF NOT EXISTS compliance_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,

  -- What
  compliance_type text NOT NULL CHECK (compliance_type IN (
    'dealer_license', 'business_license', 'surety_bond',
    'garage_liability', 'general_liability', 'workers_comp',
    'dmv_title', 'temp_tag', 'emissions_inspection',
    'sales_tax_filing', 'annual_report', 'custom'
  )),
  name text NOT NULL,
  description text,

  -- Status
  status text DEFAULT 'active' CHECK (status IN ('active', 'expiring_soon', 'expired', 'pending_renewal', 'not_applicable')),
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),

  -- Dates
  effective_date date,
  expiration_date date,
  renewal_date date,
  reminder_days integer DEFAULT 30,
  last_reminder_sent timestamptz,

  -- Documents
  document_url text,
  document_number text,
  issuing_authority text,
  cost numeric(10,2),

  -- Related
  related_id text,
  related_type text, -- 'vehicle', 'employee', 'dealer'
  vehicle_id text,

  -- Metadata
  auto_renew boolean DEFAULT false,
  notes text,
  metadata jsonb,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: compliance_checklist_items
-- ============================================
-- State-specific compliance requirements checklist
CREATE TABLE IF NOT EXISTS compliance_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,

  -- Checklist
  category text NOT NULL CHECK (category IN (
    'licensing', 'insurance', 'bonding', 'facility',
    'record_keeping', 'advertising', 'title_registration',
    'tax', 'employee', 'safety', 'environmental'
  )),
  requirement text NOT NULL,
  description text,
  state_code text DEFAULT 'UT',

  -- Status
  completed boolean DEFAULT false,
  completed_at timestamptz,
  completed_by integer REFERENCES employees(id),
  due_date date,
  recurring text CHECK (recurring IN ('once', 'monthly', 'quarterly', 'annually', 'biannually')),

  -- Evidence
  evidence_url text,
  evidence_notes text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: marketplace_listings (expanded)
-- ============================================
-- Already exists in some form; this ensures full schema
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  vehicle_id text REFERENCES inventory(id) ON DELETE CASCADE,

  -- Where
  marketplace text NOT NULL CHECK (marketplace IN ('facebook', 'ksl', 'craigslist', 'autotrader', 'cars_com')),

  -- Listing Details
  title text,
  description text,
  price numeric(10,2),
  images jsonb, -- [{url, order}]

  -- Status
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'active', 'paused', 'sold', 'expired', 'error', 'removed')),
  external_listing_id text,
  external_url text,
  error_message text,

  -- Performance
  views integer DEFAULT 0,
  inquiries integer DEFAULT 0,
  saves integer DEFAULT 0,

  -- Dates
  published_at timestamptz,
  expires_at timestamptz,
  last_synced_at timestamptz,

  -- Lead capture
  leads_captured integer DEFAULT 0,

  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: crm_workflows
-- ============================================
-- Automated customer follow-up workflows
CREATE TABLE IF NOT EXISTS crm_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,

  -- Workflow Definition
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL CHECK (trigger_type IN (
    'new_lead', 'deal_created', 'deal_lost', 'post_sale',
    'payment_overdue', 'birthday', 'service_due',
    'no_activity', 'appointment_missed', 'custom'
  )),
  trigger_conditions jsonb, -- {days_after: 3, status: 'Looking'}

  -- Actions (ordered steps)
  steps jsonb NOT NULL, -- [{step: 1, action: 'send_sms', template: '...', delay_hours: 0}, ...]

  -- Status
  active boolean DEFAULT true,
  runs_count integer DEFAULT 0,
  last_run_at timestamptz,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: crm_workflow_runs
-- ============================================
-- Tracks individual workflow executions
CREATE TABLE IF NOT EXISTS crm_workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES crm_workflows(id) ON DELETE CASCADE,
  customer_id integer REFERENCES customers(id) ON DELETE SET NULL,

  -- Execution
  status text DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled', 'paused')),
  current_step integer DEFAULT 1,
  total_steps integer NOT NULL,
  next_step_at timestamptz,

  -- Results
  steps_completed jsonb, -- [{step: 1, action: 'send_sms', status: 'sent', at: '...'}]
  error_message text,

  -- Context
  trigger_data jsonb, -- data that triggered the workflow
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- ============================================
-- TABLE: customer_portal_access
-- ============================================
-- Customer self-service portal access
CREATE TABLE IF NOT EXISTS customer_portal_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  -- Auth
  email text NOT NULL,
  pin_hash text, -- hashed 6-digit PIN
  access_token text,
  token_expires_at timestamptz,
  magic_link_token text,
  magic_link_expires_at timestamptz,

  -- Status
  active boolean DEFAULT true,
  last_login_at timestamptz,
  login_count integer DEFAULT 0,

  -- Permissions
  can_view_payments boolean DEFAULT true,
  can_make_payments boolean DEFAULT true,
  can_view_documents boolean DEFAULT true,
  can_view_appointments boolean DEFAULT true,
  can_schedule_appointments boolean DEFAULT false,
  can_message_dealer boolean DEFAULT true,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(dealer_id, customer_id),
  UNIQUE(dealer_id, email)
);

-- ============================================
-- TABLE: customer_portal_payments
-- ============================================
-- Payments made through the customer portal
CREATE TABLE IF NOT EXISTS customer_portal_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  loan_id integer REFERENCES bhph_loans(id) ON DELETE SET NULL,

  -- Payment
  amount numeric(10,2) NOT NULL,
  payment_method text DEFAULT 'card' CHECK (payment_method IN ('card', 'ach', 'debit', 'cash_app', 'venmo')),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),

  -- Provider
  provider text DEFAULT 'stripe',
  provider_payment_id text,
  provider_data jsonb,

  -- Metadata
  ip_address text,
  user_agent text,
  notes text,
  error_message text,

  processed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: leads
-- ============================================
-- Lead tracking and scoring
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,

  -- Contact Info
  first_name text NOT NULL,
  last_name text,
  email text,
  phone text,
  preferred_contact text DEFAULT 'phone' CHECK (preferred_contact IN ('phone', 'email', 'sms', 'any')),

  -- Source
  source text NOT NULL CHECK (source IN (
    'walk_in', 'phone_call', 'website', 'facebook', 'ksl',
    'craigslist', 'autotrader', 'referral', 'repeat_customer',
    'marketplace', 'other'
  )),
  source_details text, -- specific ad, referrer name, etc.
  marketplace_listing_id uuid REFERENCES marketplace_listings(id),

  -- Interest
  interested_vehicle_id text REFERENCES inventory(id) ON DELETE SET NULL,
  vehicle_preferences jsonb, -- {make, model, year_min, year_max, budget}
  budget_min numeric(10,2),
  budget_max numeric(10,2),
  trade_in_vehicle text,
  trade_in_value numeric(10,2),
  financing_needed boolean,

  -- Scoring
  lead_score integer DEFAULT 50 CHECK (lead_score >= 0 AND lead_score <= 100),
  temperature text DEFAULT 'warm' CHECK (temperature IN ('hot', 'warm', 'cold', 'dead')),

  -- Assignment
  assigned_to integer REFERENCES employees(id) ON DELETE SET NULL,
  assigned_at timestamptz,

  -- Status
  status text DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'negotiating', 'won', 'lost')),
  lost_reason text,

  -- Follow-up
  next_follow_up date,
  last_contact_at timestamptz,
  contact_count integer DEFAULT 0,

  -- Conversion
  converted_to_customer boolean DEFAULT false,
  customer_id integer REFERENCES customers(id),
  deal_id integer REFERENCES deals(id),
  converted_at timestamptz,

  notes text,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

-- Compliance
CREATE INDEX IF NOT EXISTS idx_compliance_dealer ON compliance_tracking(dealer_id);
CREATE INDEX IF NOT EXISTS idx_compliance_type ON compliance_tracking(compliance_type);
CREATE INDEX IF NOT EXISTS idx_compliance_expiry ON compliance_tracking(expiration_date) WHERE status != 'not_applicable';
CREATE INDEX IF NOT EXISTS idx_compliance_status ON compliance_tracking(status);
CREATE INDEX IF NOT EXISTS idx_checklist_dealer ON compliance_checklist_items(dealer_id);
CREATE INDEX IF NOT EXISTS idx_checklist_category ON compliance_checklist_items(category);

-- Marketplace Listings
CREATE INDEX IF NOT EXISTS idx_mktplace_dealer ON marketplace_listings(dealer_id);
CREATE INDEX IF NOT EXISTS idx_mktplace_vehicle ON marketplace_listings(inventory_id);
CREATE INDEX IF NOT EXISTS idx_mktplace_status ON marketplace_listings(status);
CREATE INDEX IF NOT EXISTS idx_mktplace_marketplace ON marketplace_listings(marketplace);

-- CRM Workflows
CREATE INDEX IF NOT EXISTS idx_workflows_dealer ON crm_workflows(dealer_id);
CREATE INDEX IF NOT EXISTS idx_workflows_active ON crm_workflows(dealer_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_workflow_runs_dealer ON crm_workflow_runs(dealer_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON crm_workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_next ON crm_workflow_runs(next_step_at) WHERE status = 'running';

-- Customer Portal
CREATE INDEX IF NOT EXISTS idx_portal_dealer ON customer_portal_access(dealer_id);
CREATE INDEX IF NOT EXISTS idx_portal_customer ON customer_portal_access(customer_id);
CREATE INDEX IF NOT EXISTS idx_portal_email ON customer_portal_access(email);
CREATE INDEX IF NOT EXISTS idx_portal_payments_dealer ON customer_portal_payments(dealer_id);
CREATE INDEX IF NOT EXISTS idx_portal_payments_customer ON customer_portal_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_portal_payments_loan ON customer_portal_payments(loan_id);

-- Leads
CREATE INDEX IF NOT EXISTS idx_leads_dealer ON leads(dealer_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_temp ON leads(temperature);
CREATE INDEX IF NOT EXISTS idx_leads_followup ON leads(next_follow_up) WHERE status NOT IN ('won', 'lost');
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE compliance_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_portal_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_portal_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Standard dealer_id RLS pattern
CREATE POLICY "Dealer users access compliance_tracking" ON compliance_tracking FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access compliance_checklist" ON compliance_checklist_items FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access marketplace_listings" ON marketplace_listings FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access crm_workflows" ON crm_workflows FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access crm_workflow_runs" ON crm_workflow_runs FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access customer_portal_access" ON customer_portal_access FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access customer_portal_payments" ON customer_portal_payments FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access leads" ON leads FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

-- ============================================
-- FUNCTIONS
-- ============================================

-- Check compliance expirations and create notifications
CREATE OR REPLACE FUNCTION check_compliance_expirations(p_dealer_id integer)
RETURNS integer AS $$
DECLARE
  v_count integer := 0;
  v_item record;
BEGIN
  FOR v_item IN
    SELECT id, name, compliance_type, expiration_date, reminder_days
    FROM compliance_tracking
    WHERE dealer_id = p_dealer_id
      AND status NOT IN ('not_applicable', 'expired')
      AND expiration_date IS NOT NULL
      AND expiration_date <= CURRENT_DATE + (COALESCE(reminder_days, 30) || ' days')::interval
      AND (last_reminder_sent IS NULL OR last_reminder_sent < CURRENT_DATE - interval '7 days')
  LOOP
    -- Create notification
    PERFORM create_dealer_notification(
      p_dealer_id,
      'compliance_alert',
      'Compliance Expiring: ' || v_item.name,
      v_item.name || ' expires on ' || v_item.expiration_date::text,
      CASE WHEN v_item.expiration_date <= CURRENT_DATE THEN 'urgent'
           WHEN v_item.expiration_date <= CURRENT_DATE + interval '7 days' THEN 'high'
           ELSE 'normal' END,
      '/compliance',
      v_item.id::text,
      'compliance'
    );

    -- Update last reminder sent
    UPDATE compliance_tracking SET
      last_reminder_sent = now(),
      status = CASE
        WHEN expiration_date <= CURRENT_DATE THEN 'expired'
        WHEN expiration_date <= CURRENT_DATE + interval '30 days' THEN 'expiring_soon'
        ELSE status
      END
    WHERE id = v_item.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Calculate lead score
CREATE OR REPLACE FUNCTION calculate_lead_score(p_lead_id uuid)
RETURNS integer AS $$
DECLARE
  v_score integer := 50;
  v_lead record;
BEGIN
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Source scoring
  IF v_lead.source IN ('walk_in', 'phone_call') THEN v_score := v_score + 20;
  ELSIF v_lead.source IN ('website', 'referral') THEN v_score := v_score + 15;
  ELSIF v_lead.source IN ('facebook', 'marketplace') THEN v_score := v_score + 10;
  END IF;

  -- Has specific vehicle interest
  IF v_lead.interested_vehicle_id IS NOT NULL THEN v_score := v_score + 15; END IF;

  -- Has budget defined
  IF v_lead.budget_max IS NOT NULL THEN v_score := v_score + 5; END IF;

  -- Financing needed (higher intent)
  IF v_lead.financing_needed THEN v_score := v_score + 5; END IF;

  -- Contact info completeness
  IF v_lead.email IS NOT NULL THEN v_score := v_score + 5; END IF;
  IF v_lead.phone IS NOT NULL THEN v_score := v_score + 5; END IF;

  -- Recent activity bonus
  IF v_lead.last_contact_at > now() - interval '3 days' THEN v_score := v_score + 10;
  ELSIF v_lead.last_contact_at > now() - interval '7 days' THEN v_score := v_score + 5;
  END IF;

  -- Decay for no activity
  IF v_lead.last_contact_at < now() - interval '14 days' THEN v_score := v_score - 15;
  ELSIF v_lead.last_contact_at < now() - interval '7 days' THEN v_score := v_score - 5;
  END IF;

  -- Cap score
  v_score := GREATEST(0, LEAST(100, v_score));

  -- Update the lead
  UPDATE leads SET
    lead_score = v_score,
    temperature = CASE
      WHEN v_score >= 80 THEN 'hot'
      WHEN v_score >= 50 THEN 'warm'
      WHEN v_score >= 20 THEN 'cold'
      ELSE 'dead'
    END,
    updated_at = now()
  WHERE id = p_lead_id;

  RETURN v_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE compliance_tracking IS 'Dealer licensing, insurance, and regulatory deadline tracking';
COMMENT ON TABLE compliance_checklist_items IS 'State-specific compliance requirements checklist';
COMMENT ON TABLE marketplace_listings IS 'Vehicle listings across marketplace platforms';
COMMENT ON TABLE crm_workflows IS 'Automated customer follow-up workflow definitions';
COMMENT ON TABLE crm_workflow_runs IS 'Individual CRM workflow execution tracking';
COMMENT ON TABLE customer_portal_access IS 'Customer self-service portal access and permissions';
COMMENT ON TABLE customer_portal_payments IS 'Payments made through the customer portal';
COMMENT ON TABLE leads IS 'Lead tracking, scoring, and conversion pipeline';
