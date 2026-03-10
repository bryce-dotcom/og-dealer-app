-- ============================================
-- Phase 7: SMS, E-Signature, Appointments, Notifications, Analytics
-- ============================================
-- Created: 2026-03-10

-- ============================================
-- TABLE: sms_messages
-- ============================================
CREATE TABLE IF NOT EXISTS sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  customer_id integer REFERENCES customers(id) ON DELETE SET NULL,

  -- Message Details
  direction text NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  from_number text NOT NULL,
  to_number text NOT NULL,
  body text NOT NULL,

  -- Status
  status text DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'received')),
  error_message text,

  -- Provider
  provider text DEFAULT 'twilio',
  provider_message_id text,

  -- Context
  message_type text DEFAULT 'manual' CHECK (message_type IN ('manual', 'payment_reminder', 'appointment_reminder', 'follow_up', 'marketing', 'system')),
  related_id text, -- deal_id, loan_id, appointment_id, etc.
  related_type text, -- 'deal', 'loan', 'appointment'

  -- Sent by
  sent_by integer REFERENCES employees(id),
  sent_by_name text,

  created_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: sms_settings
-- ============================================
CREATE TABLE IF NOT EXISTS sms_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL UNIQUE REFERENCES dealer_settings(id) ON DELETE CASCADE,

  -- Twilio Config
  twilio_account_sid text,
  twilio_auth_token text,
  twilio_phone_number text,

  -- Settings
  is_active boolean DEFAULT false,
  auto_payment_reminders boolean DEFAULT true,
  reminder_days_before integer DEFAULT 3,
  auto_appointment_reminders boolean DEFAULT true,
  appointment_reminder_hours integer DEFAULT 24,

  -- Templates
  payment_reminder_template text DEFAULT 'Hi {{name}}, your payment of {{amount}} is due on {{date}}. Reply STOP to opt out.',
  appointment_reminder_template text DEFAULT 'Hi {{name}}, reminder: you have an appointment at {{dealer}} on {{date}} at {{time}}. Reply C to confirm.',

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: customer_interactions
-- ============================================
-- Unified communication log / CRM timeline
CREATE TABLE IF NOT EXISTS customer_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  -- Interaction Details
  interaction_type text NOT NULL CHECK (interaction_type IN (
    'call', 'sms', 'email', 'visit', 'test_drive', 'quote', 'follow_up', 'note'
  )),
  direction text CHECK (direction IN ('inbound', 'outbound')),
  summary text NOT NULL,
  details text,

  -- Related Records
  related_id text,
  related_type text, -- 'deal', 'vehicle', 'loan', 'appointment'

  -- Follow-up
  follow_up_date date,
  follow_up_completed boolean DEFAULT false,

  -- Who
  employee_id integer REFERENCES employees(id),
  employee_name text,

  -- Metadata
  duration_seconds integer, -- for calls
  metadata jsonb,

  created_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: appointments
-- ============================================
CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,

  -- Who
  customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text,
  customer_phone text,
  customer_email text,
  employee_id integer REFERENCES employees(id) ON DELETE SET NULL,
  employee_name text,

  -- What
  appointment_type text NOT NULL CHECK (appointment_type IN (
    'test_drive', 'sales_meeting', 'delivery', 'service', 'financing', 'other'
  )),
  title text NOT NULL,
  description text,

  -- When
  scheduled_date date NOT NULL,
  start_time time NOT NULL,
  end_time time,
  duration_minutes integer DEFAULT 30,

  -- Where
  location text,

  -- Related
  vehicle_id text REFERENCES inventory(id) ON DELETE SET NULL,
  deal_id integer,

  -- Status
  status text DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  confirmation_sent boolean DEFAULT false,
  reminder_sent boolean DEFAULT false,

  -- Notes
  notes text,
  cancellation_reason text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: dealer_notifications
-- ============================================
CREATE TABLE IF NOT EXISTS dealer_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,

  -- Who should see it (null = all dealer users)
  user_id uuid REFERENCES auth.users(id),
  employee_id integer REFERENCES employees(id),

  -- Notification Details
  type text NOT NULL CHECK (type IN (
    'payment_due', 'payment_overdue', 'payment_received',
    'deal_created', 'deal_status_changed', 'deal_document_ready',
    'appointment_upcoming', 'appointment_confirmed', 'appointment_cancelled',
    'inventory_low', 'inventory_aged',
    'title_deadline', 'compliance_alert',
    'esignature_completed', 'esignature_declined',
    'sms_received', 'customer_inquiry',
    'system', 'announcement'
  )),
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  title text NOT NULL,
  message text NOT NULL,
  action_url text,

  -- Related
  related_id text,
  related_type text,

  -- Status
  read boolean DEFAULT false,
  read_at timestamptz,
  dismissed boolean DEFAULT false,

  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: esignature_requests
-- ============================================
CREATE TABLE IF NOT EXISTS esignature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  deal_id integer REFERENCES deals(id) ON DELETE SET NULL,

  -- Document Info
  document_name text NOT NULL,
  document_url text, -- Source document
  template_id text, -- DocuSeal template ID

  -- Signers
  signers jsonb NOT NULL, -- [{ name, email, phone, role, status }]

  -- Provider
  provider text DEFAULT 'docuseal',
  provider_submission_id text,
  provider_data jsonb,

  -- Status
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'partially_signed', 'completed', 'declined', 'expired', 'voided')),
  sent_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,

  -- Result
  signed_document_url text,
  audit_trail jsonb, -- [{ signer, action, timestamp, ip }]

  -- Metadata
  created_by integer REFERENCES employees(id),
  notes text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: analytics_snapshots
-- ============================================
-- Daily snapshots for trend analysis
CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,

  -- Inventory Metrics
  total_vehicles integer DEFAULT 0,
  total_inventory_value numeric(12,2) DEFAULT 0,
  avg_days_on_lot numeric(5,1) DEFAULT 0,
  vehicles_over_60_days integer DEFAULT 0,
  vehicles_over_90_days integer DEFAULT 0,

  -- Sales Metrics
  vehicles_sold integer DEFAULT 0,
  total_revenue numeric(12,2) DEFAULT 0,
  total_profit numeric(12,2) DEFAULT 0,
  avg_profit_per_vehicle numeric(10,2) DEFAULT 0,
  avg_days_to_sell numeric(5,1) DEFAULT 0,

  -- BHPH Metrics
  active_loans integer DEFAULT 0,
  total_loan_balance numeric(12,2) DEFAULT 0,
  payments_collected numeric(12,2) DEFAULT 0,
  payments_overdue integer DEFAULT 0,
  delinquency_rate numeric(5,2) DEFAULT 0,

  -- Customer Metrics
  total_customers integer DEFAULT 0,
  new_customers integer DEFAULT 0,
  customers_looking integer DEFAULT 0,

  -- Financial
  total_expenses numeric(12,2) DEFAULT 0,
  net_income numeric(12,2) DEFAULT 0,

  created_at timestamptz DEFAULT now(),

  UNIQUE(dealer_id, snapshot_date)
);

-- ============================================
-- INDEXES
-- ============================================

-- SMS
CREATE INDEX IF NOT EXISTS idx_sms_dealer ON sms_messages(dealer_id);
CREATE INDEX IF NOT EXISTS idx_sms_customer ON sms_messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_sms_direction ON sms_messages(direction);
CREATE INDEX IF NOT EXISTS idx_sms_created ON sms_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_to_number ON sms_messages(to_number);

-- Customer Interactions
CREATE INDEX IF NOT EXISTS idx_interactions_dealer ON customer_interactions(dealer_id);
CREATE INDEX IF NOT EXISTS idx_interactions_customer ON customer_interactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_interactions_type ON customer_interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_interactions_followup ON customer_interactions(follow_up_date) WHERE follow_up_completed = false;
CREATE INDEX IF NOT EXISTS idx_interactions_created ON customer_interactions(created_at DESC);

-- Appointments
CREATE INDEX IF NOT EXISTS idx_appointments_dealer ON appointments(dealer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_customer ON appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_employee ON appointments(employee_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

-- Dealer Notifications
CREATE INDEX IF NOT EXISTS idx_dealer_notif_dealer ON dealer_notifications(dealer_id);
CREATE INDEX IF NOT EXISTS idx_dealer_notif_user ON dealer_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_dealer_notif_unread ON dealer_notifications(dealer_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_dealer_notif_created ON dealer_notifications(created_at DESC);

-- E-Signature
CREATE INDEX IF NOT EXISTS idx_esign_dealer ON esignature_requests(dealer_id);
CREATE INDEX IF NOT EXISTS idx_esign_deal ON esignature_requests(deal_id);
CREATE INDEX IF NOT EXISTS idx_esign_status ON esignature_requests(status);

-- Analytics
CREATE INDEX IF NOT EXISTS idx_analytics_dealer_date ON analytics_snapshots(dealer_id, snapshot_date DESC);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealer_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE esignature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;

-- All dealer tables use dealer_id filtering
CREATE POLICY "Dealer users access sms_messages" ON sms_messages FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access sms_settings" ON sms_settings FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access interactions" ON customer_interactions FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access appointments" ON appointments FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access notifications" ON dealer_notifications FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access esignature" ON esignature_requests FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

CREATE POLICY "Dealer users access analytics" ON analytics_snapshots FOR ALL TO authenticated
  USING (dealer_id IN (SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid())
    OR dealer_id IN (SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true));

-- ============================================
-- FUNCTIONS
-- ============================================

-- Create dealer notification helper
CREATE OR REPLACE FUNCTION create_dealer_notification(
  p_dealer_id integer,
  p_type text,
  p_title text,
  p_message text,
  p_priority text DEFAULT 'normal',
  p_action_url text DEFAULT NULL,
  p_related_id text DEFAULT NULL,
  p_related_type text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO dealer_notifications (
    dealer_id, user_id, type, priority, title, message,
    action_url, related_id, related_type
  ) VALUES (
    p_dealer_id, p_user_id, p_type, p_priority, p_title, p_message,
    p_action_url, p_related_id, p_related_type
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Take daily analytics snapshot
CREATE OR REPLACE FUNCTION take_analytics_snapshot(p_dealer_id integer)
RETURNS uuid AS $$
DECLARE
  v_id uuid;
  v_today date := CURRENT_DATE;
  v_total_vehicles integer;
  v_inventory_value numeric;
  v_avg_days numeric;
  v_over_60 integer;
  v_over_90 integer;
  v_sold integer;
  v_revenue numeric;
  v_profit numeric;
  v_avg_profit numeric;
  v_avg_days_sell numeric;
  v_active_loans integer;
  v_loan_balance numeric;
  v_payments numeric;
  v_overdue integer;
  v_total_customers integer;
  v_new_customers integer;
  v_looking integer;
BEGIN
  -- Inventory metrics
  SELECT COUNT(*), COALESCE(SUM(price), 0),
    COALESCE(AVG(EXTRACT(DAY FROM now() - created_at)), 0)
  INTO v_total_vehicles, v_inventory_value, v_avg_days
  FROM inventory WHERE dealer_id = p_dealer_id AND status = 'In Stock';

  SELECT COUNT(*) INTO v_over_60 FROM inventory
  WHERE dealer_id = p_dealer_id AND status = 'In Stock'
    AND created_at < now() - interval '60 days';

  SELECT COUNT(*) INTO v_over_90 FROM inventory
  WHERE dealer_id = p_dealer_id AND status = 'In Stock'
    AND created_at < now() - interval '90 days';

  -- Sales (last 30 days)
  SELECT COUNT(*), COALESCE(SUM(sale_price), 0), COALESCE(SUM(profit), 0),
    COALESCE(AVG(profit), 0), COALESCE(AVG(days_in_stock), 0)
  INTO v_sold, v_revenue, v_profit, v_avg_profit, v_avg_days_sell
  FROM deals WHERE dealer_id = p_dealer_id AND status = 'Sold'
    AND created_at > now() - interval '30 days';

  -- BHPH
  SELECT COUNT(*), COALESCE(SUM(remaining_balance), 0)
  INTO v_active_loans, v_loan_balance
  FROM bhph_loans WHERE dealer_id = p_dealer_id AND status = 'active';

  SELECT COALESCE(SUM(amount), 0) INTO v_payments
  FROM bhph_payments WHERE dealer_id = p_dealer_id
    AND payment_date > now() - interval '30 days' AND status = 'completed';

  SELECT COUNT(*) INTO v_overdue
  FROM bhph_loans WHERE dealer_id = p_dealer_id AND status = 'active'
    AND next_payment_date < CURRENT_DATE;

  -- Customers
  SELECT COUNT(*) INTO v_total_customers
  FROM customers WHERE dealer_id = p_dealer_id;

  SELECT COUNT(*) INTO v_new_customers
  FROM customers WHERE dealer_id = p_dealer_id
    AND created_at > now() - interval '30 days';

  SELECT COUNT(DISTINCT customer_id) INTO v_looking
  FROM customer_vehicle_requests WHERE dealer_id = p_dealer_id AND status = 'Looking';

  -- Upsert snapshot
  INSERT INTO analytics_snapshots (
    dealer_id, snapshot_date, total_vehicles, total_inventory_value, avg_days_on_lot,
    vehicles_over_60_days, vehicles_over_90_days, vehicles_sold, total_revenue,
    total_profit, avg_profit_per_vehicle, avg_days_to_sell, active_loans,
    total_loan_balance, payments_collected, payments_overdue,
    delinquency_rate, total_customers, new_customers, customers_looking
  ) VALUES (
    p_dealer_id, v_today, v_total_vehicles, v_inventory_value, v_avg_days,
    v_over_60, v_over_90, v_sold, v_revenue,
    v_profit, v_avg_profit, v_avg_days_sell, v_active_loans,
    v_loan_balance, v_payments, v_overdue,
    CASE WHEN v_active_loans > 0 THEN (v_overdue::numeric / v_active_loans * 100) ELSE 0 END,
    v_total_customers, v_new_customers, v_looking
  )
  ON CONFLICT (dealer_id, snapshot_date) DO UPDATE SET
    total_vehicles = EXCLUDED.total_vehicles,
    total_inventory_value = EXCLUDED.total_inventory_value,
    avg_days_on_lot = EXCLUDED.avg_days_on_lot,
    vehicles_over_60_days = EXCLUDED.vehicles_over_60_days,
    vehicles_over_90_days = EXCLUDED.vehicles_over_90_days,
    vehicles_sold = EXCLUDED.vehicles_sold,
    total_revenue = EXCLUDED.total_revenue,
    total_profit = EXCLUDED.total_profit,
    avg_profit_per_vehicle = EXCLUDED.avg_profit_per_vehicle,
    avg_days_to_sell = EXCLUDED.avg_days_to_sell,
    active_loans = EXCLUDED.active_loans,
    total_loan_balance = EXCLUDED.total_loan_balance,
    payments_collected = EXCLUDED.payments_collected,
    payments_overdue = EXCLUDED.payments_overdue,
    delinquency_rate = EXCLUDED.delinquency_rate,
    total_customers = EXCLUDED.total_customers,
    new_customers = EXCLUDED.new_customers,
    customers_looking = EXCLUDED.customers_looking
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE sms_messages IS 'SMS message history for customer communication';
COMMENT ON TABLE sms_settings IS 'Twilio configuration per dealer';
COMMENT ON TABLE customer_interactions IS 'CRM timeline - unified communication log per customer';
COMMENT ON TABLE appointments IS 'Test drive, sales, service, and financing appointments';
COMMENT ON TABLE dealer_notifications IS 'In-app notifications for dealer staff';
COMMENT ON TABLE esignature_requests IS 'Document e-signature tracking via DocuSeal';
COMMENT ON TABLE analytics_snapshots IS 'Daily business metrics for trend analysis';
