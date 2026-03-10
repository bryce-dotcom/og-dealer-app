-- ============================================
-- Phase 9: Reconditioning, GPS Tracking, Trade-Ins, Deal Timeline, Vehicle Detail
-- ============================================
-- Created: 2026-03-10

-- ============================================
-- TABLE: reconditioning_tasks
-- ============================================
CREATE TABLE IF NOT EXISTS reconditioning_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  vehicle_id text NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,

  -- Task Details
  task_type text NOT NULL CHECK (task_type IN (
    'inspection', 'mechanical', 'body_work', 'paint', 'interior',
    'detail', 'tires', 'glass', 'electrical', 'emissions',
    'safety', 'cosmetic', 'custom'
  )),
  title text NOT NULL,
  description text,
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  -- Status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'blocked')),
  started_at timestamptz,
  completed_at timestamptz,

  -- Assignment
  assigned_to integer REFERENCES employees(id) ON DELETE SET NULL,
  assigned_name text,
  vendor_name text, -- external vendor if outsourced

  -- Costs
  estimated_cost numeric(10,2) DEFAULT 0,
  actual_cost numeric(10,2),
  parts_cost numeric(10,2) DEFAULT 0,
  labor_cost numeric(10,2) DEFAULT 0,
  labor_hours numeric(5,2),

  -- Photos
  before_photos jsonb, -- [{url, caption}]
  after_photos jsonb,

  -- Notes
  notes text,
  completion_notes text,

  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: reconditioning_templates
-- ============================================
CREATE TABLE IF NOT EXISTS reconditioning_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,

  name text NOT NULL,
  description text,
  vehicle_type text, -- 'car', 'truck', 'suv', 'van', 'all'
  tasks jsonb NOT NULL, -- [{task_type, title, description, estimated_cost, priority, sort_order}]
  is_default boolean DEFAULT false,

  created_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: vehicle_gps_tracking
-- ============================================
CREATE TABLE IF NOT EXISTS vehicle_gps_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  vehicle_id text NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  loan_id integer REFERENCES bhph_loans(id) ON DELETE SET NULL,

  -- Device
  device_id text,
  device_type text DEFAULT 'gps' CHECK (device_type IN ('gps', 'obd', 'hardwired', 'manual')),
  provider text, -- 'ituran', 'spireon', 'passtime', 'manual'

  -- Current Location
  current_lat numeric(10,7),
  current_lng numeric(10,7),
  current_address text,
  last_ping_at timestamptz,
  speed numeric(5,1) DEFAULT 0,
  heading numeric(5,1),
  ignition_on boolean DEFAULT false,

  -- Geofence
  geofence_enabled boolean DEFAULT false,
  geofence_center_lat numeric(10,7),
  geofence_center_lng numeric(10,7),
  geofence_radius_miles numeric(5,1) DEFAULT 50,
  geofence_alert_sent boolean DEFAULT false,

  -- Status
  active boolean DEFAULT true,
  battery_level integer,
  starter_disabled boolean DEFAULT false,

  -- Mileage
  last_known_mileage integer,
  mileage_limit integer,
  mileage_alert_sent boolean DEFAULT false,

  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(dealer_id, vehicle_id)
);

-- ============================================
-- TABLE: gps_location_history
-- ============================================
CREATE TABLE IF NOT EXISTS gps_location_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_id uuid NOT NULL REFERENCES vehicle_gps_tracking(id) ON DELETE CASCADE,
  dealer_id integer NOT NULL,

  lat numeric(10,7) NOT NULL,
  lng numeric(10,7) NOT NULL,
  address text,
  speed numeric(5,1),
  heading numeric(5,1),
  ignition_on boolean,
  event_type text DEFAULT 'ping' CHECK (event_type IN ('ping', 'ignition_on', 'ignition_off', 'geofence_exit', 'geofence_enter', 'speed_alert', 'tow_alert')),

  recorded_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: trade_ins
-- ============================================
CREATE TABLE IF NOT EXISTS trade_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  deal_id integer REFERENCES deals(id) ON DELETE SET NULL,
  customer_id integer REFERENCES customers(id) ON DELETE SET NULL,

  -- Vehicle Info
  vin text,
  year integer,
  make text,
  model text,
  trim text,
  color text,
  mileage integer,
  condition text DEFAULT 'good' CHECK (condition IN ('excellent', 'good', 'fair', 'poor', 'salvage')),

  -- Valuation
  kbb_value numeric(10,2),
  nada_value numeric(10,2),
  market_value numeric(10,2),
  acv numeric(10,2), -- actual cash value (dealer's assessment)
  offered_value numeric(10,2),
  agreed_value numeric(10,2),

  -- Payoff
  has_lien boolean DEFAULT false,
  lien_holder text,
  payoff_amount numeric(10,2),
  payoff_good_through date,
  negative_equity numeric(10,2),
  payoff_verified boolean DEFAULT false,

  -- Appraisal
  appraised_by integer REFERENCES employees(id),
  appraised_at timestamptz,
  appraisal_notes text,
  appraisal_photos jsonb, -- [{url, caption, area}]

  -- Checklist
  checklist jsonb, -- [{item, status, notes}] - tires, body, engine, interior, etc.

  -- Status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'appraised', 'offered', 'accepted', 'declined', 'completed')),

  -- Disposition
  disposition text CHECK (disposition IN ('retail', 'wholesale', 'auction', 'parts', 'pending')),
  added_to_inventory boolean DEFAULT false,
  inventory_id text REFERENCES inventory(id),

  notes text,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: deal_timeline
-- ============================================
CREATE TABLE IF NOT EXISTS deal_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  deal_id integer NOT NULL REFERENCES deals(id) ON DELETE CASCADE,

  -- Event
  event_type text NOT NULL CHECK (event_type IN (
    'created', 'status_changed', 'price_changed', 'payment_received',
    'document_generated', 'document_signed', 'trade_in_added',
    'financing_approved', 'financing_denied', 'customer_changed',
    'note_added', 'appointment_set', 'test_drive', 'delivery',
    'title_sent', 'title_received', 'cancelled', 'custom'
  )),
  title text NOT NULL,
  description text,

  -- Context
  old_value text,
  new_value text,
  metadata jsonb,

  -- Who
  employee_id integer REFERENCES employees(id),
  employee_name text,

  created_at timestamptz DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

-- Reconditioning
CREATE INDEX IF NOT EXISTS idx_recon_dealer ON reconditioning_tasks(dealer_id);
CREATE INDEX IF NOT EXISTS idx_recon_vehicle ON reconditioning_tasks(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_recon_status ON reconditioning_tasks(status);
CREATE INDEX IF NOT EXISTS idx_recon_assigned ON reconditioning_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_recon_templates_dealer ON reconditioning_templates(dealer_id);

-- GPS
CREATE INDEX IF NOT EXISTS idx_gps_dealer ON vehicle_gps_tracking(dealer_id);
CREATE INDEX IF NOT EXISTS idx_gps_vehicle ON vehicle_gps_tracking(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_gps_loan ON vehicle_gps_tracking(loan_id);
CREATE INDEX IF NOT EXISTS idx_gps_active ON vehicle_gps_tracking(dealer_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_gps_history_tracking ON gps_location_history(tracking_id);
CREATE INDEX IF NOT EXISTS idx_gps_history_time ON gps_location_history(recorded_at DESC);

-- Trade-Ins
CREATE INDEX IF NOT EXISTS idx_tradein_dealer ON trade_ins(dealer_id);
CREATE INDEX IF NOT EXISTS idx_tradein_deal ON trade_ins(deal_id);
CREATE INDEX IF NOT EXISTS idx_tradein_customer ON trade_ins(customer_id);
CREATE INDEX IF NOT EXISTS idx_tradein_status ON trade_ins(status);
CREATE INDEX IF NOT EXISTS idx_tradein_vin ON trade_ins(vin);

-- Deal Timeline
CREATE INDEX IF NOT EXISTS idx_deal_timeline_dealer ON deal_timeline(dealer_id);
CREATE INDEX IF NOT EXISTS idx_deal_timeline_deal ON deal_timeline(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_timeline_type ON deal_timeline(event_type);
CREATE INDEX IF NOT EXISTS idx_deal_timeline_created ON deal_timeline(created_at DESC);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE reconditioning_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconditioning_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_gps_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_location_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_timeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer users access recon_tasks" ON reconditioning_tasks FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access recon_templates" ON reconditioning_templates FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access gps_tracking" ON vehicle_gps_tracking FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access gps_history" ON gps_location_history FOR ALL TO authenticated
  USING (dealer_id IN (SELECT dealer_id FROM vehicle_gps_tracking WHERE id = tracking_id));

CREATE POLICY "Dealer users access trade_ins" ON trade_ins FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access deal_timeline" ON deal_timeline FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

-- ============================================
-- FUNCTIONS
-- ============================================

-- Log deal timeline event
CREATE OR REPLACE FUNCTION log_deal_event(
  p_dealer_id integer,
  p_deal_id integer,
  p_event_type text,
  p_title text,
  p_description text DEFAULT NULL,
  p_old_value text DEFAULT NULL,
  p_new_value text DEFAULT NULL,
  p_employee_id integer DEFAULT NULL,
  p_employee_name text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO deal_timeline (
    dealer_id, deal_id, event_type, title, description,
    old_value, new_value, employee_id, employee_name
  ) VALUES (
    p_dealer_id, p_deal_id, p_event_type, p_title, p_description,
    p_old_value, p_new_value, p_employee_id, p_employee_name
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get reconditioning summary for a vehicle
CREATE OR REPLACE FUNCTION get_recon_summary(p_vehicle_id text)
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_tasks', COUNT(*),
    'completed', COUNT(*) FILTER (WHERE status = 'completed'),
    'in_progress', COUNT(*) FILTER (WHERE status = 'in_progress'),
    'pending', COUNT(*) FILTER (WHERE status = 'pending'),
    'total_estimated', COALESCE(SUM(estimated_cost), 0),
    'total_actual', COALESCE(SUM(actual_cost), 0),
    'total_parts', COALESCE(SUM(parts_cost), 0),
    'total_labor', COALESCE(SUM(labor_cost), 0)
  ) INTO v_result
  FROM reconditioning_tasks
  WHERE vehicle_id = p_vehicle_id;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE reconditioning_tasks IS 'Vehicle reconditioning repair tasks and cost tracking';
COMMENT ON TABLE reconditioning_templates IS 'Reusable reconditioning task templates';
COMMENT ON TABLE vehicle_gps_tracking IS 'GPS device tracking for BHPH vehicles';
COMMENT ON TABLE gps_location_history IS 'Historical GPS location pings';
COMMENT ON TABLE trade_ins IS 'Trade-in vehicle appraisals and valuations';
COMMENT ON TABLE deal_timeline IS 'Deal lifecycle activity timeline';
