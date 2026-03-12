-- ============================================
-- Phase 6: Investor Settings, Reports, Accreditation, Analytics, Notifications
-- ============================================
-- Created: 2026-03-10

-- ============================================
-- TABLE: investor_notifications
-- ============================================
CREATE TABLE IF NOT EXISTS investor_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id uuid NOT NULL REFERENCES investors(id) ON DELETE CASCADE,

  -- Notification Details
  type text NOT NULL CHECK (type IN (
    'deposit_confirmed', 'deposit_failed', 'withdrawal_completed', 'withdrawal_failed',
    'vehicle_purchased', 'vehicle_sold', 'distribution_ready', 'distribution_paid',
    'report_available', 'accreditation_approved', 'accreditation_rejected',
    'account_update', 'announcement', 'system'
  )),
  title text NOT NULL,
  message text NOT NULL,
  action_url text, -- Optional link to relevant page

  -- Related Records
  related_id uuid, -- Generic reference to related record
  related_type text, -- 'capital', 'vehicle', 'distribution', 'report'

  -- Status
  read boolean DEFAULT false,
  read_at timestamptz,
  dismissed boolean DEFAULT false,

  -- Metadata
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- TABLE: investor_documents
-- ============================================
-- Documents uploaded for accreditation verification
CREATE TABLE IF NOT EXISTS investor_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id uuid NOT NULL REFERENCES investors(id) ON DELETE CASCADE,

  -- Document Details
  document_type text NOT NULL CHECK (document_type IN (
    'tax_return', 'w2', 'bank_statement', 'brokerage_statement',
    'cpa_letter', 'entity_docs', 'professional_cert', 'id_front', 'id_back', 'other'
  )),
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size integer,
  mime_type text,

  -- Review
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_notes text,

  -- Metadata
  uploaded_at timestamptz DEFAULT now(),
  expires_at date, -- Some docs expire (e.g., CPA letters valid 90 days)
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- Add notification preferences to investors
-- ============================================
ALTER TABLE investors ADD COLUMN IF NOT EXISTS notification_preferences jsonb DEFAULT '{
  "email_deposits": true,
  "email_withdrawals": true,
  "email_distributions": true,
  "email_vehicle_updates": true,
  "email_reports": true,
  "email_announcements": true,
  "in_app_all": true
}'::jsonb;

ALTER TABLE investors ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/Denver';
ALTER TABLE investors ADD COLUMN IF NOT EXISTS preferred_currency text DEFAULT 'USD';

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_investor_notifications_investor ON investor_notifications(investor_id);
CREATE INDEX IF NOT EXISTS idx_investor_notifications_type ON investor_notifications(type);
CREATE INDEX IF NOT EXISTS idx_investor_notifications_read ON investor_notifications(investor_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_investor_notifications_created ON investor_notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_investor_documents_investor ON investor_documents(investor_id);
CREATE INDEX IF NOT EXISTS idx_investor_documents_type ON investor_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_investor_documents_status ON investor_documents(status);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE investor_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE investor_documents ENABLE ROW LEVEL SECURITY;

-- Notifications: Investors see their own
DROP POLICY IF EXISTS "Investors can view their own notifications" ON investor_notifications;
CREATE POLICY "Investors can view their own notifications" ON investor_notifications
  FOR SELECT TO authenticated
  USING (investor_id IN (SELECT id FROM investors WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Investors can update their own notifications" ON investor_notifications;
CREATE POLICY "Investors can update their own notifications" ON investor_notifications
  FOR UPDATE TO authenticated
  USING (investor_id IN (SELECT id FROM investors WHERE user_id = auth.uid()))
  WITH CHECK (investor_id IN (SELECT id FROM investors WHERE user_id = auth.uid()));

-- Documents: Investors see their own, can upload
DROP POLICY IF EXISTS "Investors can view their own documents" ON investor_documents;
CREATE POLICY "Investors can view their own documents" ON investor_documents
  FOR SELECT TO authenticated
  USING (investor_id IN (SELECT id FROM investors WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Investors can upload documents" ON investor_documents;
CREATE POLICY "Investors can upload documents" ON investor_documents
  FOR INSERT TO authenticated
  WITH CHECK (investor_id IN (SELECT id FROM investors WHERE user_id = auth.uid()));

-- ============================================
-- FUNCTION: Create notification helper
-- ============================================
CREATE OR REPLACE FUNCTION create_investor_notification(
  p_investor_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_action_url text DEFAULT NULL,
  p_related_id uuid DEFAULT NULL,
  p_related_type text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_notification_id uuid;
BEGIN
  INSERT INTO investor_notifications (
    investor_id, type, title, message, action_url,
    related_id, related_type, metadata
  ) VALUES (
    p_investor_id, p_type, p_title, p_message, p_action_url,
    p_related_id, p_related_type, p_metadata
  ) RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Generate investor report
-- ============================================
CREATE OR REPLACE FUNCTION generate_investor_report(
  p_investor_id uuid,
  p_report_type text,
  p_period_start date,
  p_period_end date
) RETURNS uuid AS $$
DECLARE
  v_report_id uuid;
  v_summary jsonb;
  v_vehicles_active integer;
  v_vehicles_sold integer;
  v_capital_deployed numeric;
  v_profit_earned numeric;
  v_distributions_paid numeric;
  v_deposits numeric;
  v_withdrawals numeric;
BEGIN
  -- Count active vehicles in investor's pools
  SELECT COUNT(*) INTO v_vehicles_active
  FROM investor_vehicles iv
  JOIN investor_pool_shares ips ON iv.pool_id = ips.pool_id
  WHERE ips.investor_id = p_investor_id AND ips.active = true AND iv.status = 'active';

  -- Count sold vehicles in period
  SELECT COUNT(*) INTO v_vehicles_sold
  FROM investor_vehicles iv
  JOIN investor_pool_shares ips ON iv.pool_id = ips.pool_id
  WHERE ips.investor_id = p_investor_id AND ips.active = true
    AND iv.status = 'sold' AND iv.sale_date BETWEEN p_period_start AND p_period_end;

  -- Capital currently deployed
  SELECT COALESCE(SUM(iv.capital_deployed), 0) INTO v_capital_deployed
  FROM investor_vehicles iv
  JOIN investor_pool_shares ips ON iv.pool_id = ips.pool_id
  WHERE ips.investor_id = p_investor_id AND ips.active = true AND iv.status = 'active';

  -- Profit earned in period
  SELECT COALESCE(SUM(amount), 0) INTO v_profit_earned
  FROM investor_distributions
  WHERE investor_id = p_investor_id AND distribution_type = 'profit'
    AND created_at BETWEEN p_period_start AND (p_period_end + interval '1 day');

  -- Distributions paid in period
  SELECT COALESCE(SUM(amount), 0) INTO v_distributions_paid
  FROM investor_distributions
  WHERE investor_id = p_investor_id AND status = 'paid'
    AND paid_at BETWEEN p_period_start AND (p_period_end + interval '1 day');

  -- Deposits in period
  SELECT COALESCE(SUM(amount), 0) INTO v_deposits
  FROM investor_capital
  WHERE investor_id = p_investor_id AND transaction_type = 'deposit' AND status = 'completed'
    AND completed_at BETWEEN p_period_start AND (p_period_end + interval '1 day');

  -- Withdrawals in period
  SELECT COALESCE(SUM(amount), 0) INTO v_withdrawals
  FROM investor_capital
  WHERE investor_id = p_investor_id AND transaction_type = 'withdrawal' AND status = 'completed'
    AND completed_at BETWEEN p_period_start AND (p_period_end + interval '1 day');

  -- Build summary
  v_summary := jsonb_build_object(
    'vehicles_active', v_vehicles_active,
    'vehicles_sold', v_vehicles_sold,
    'capital_deployed', v_capital_deployed,
    'profit_earned', v_profit_earned,
    'distributions_paid', v_distributions_paid,
    'deposits', v_deposits,
    'withdrawals', v_withdrawals,
    'net_capital_flow', v_deposits - v_withdrawals
  );

  -- Insert report
  INSERT INTO investor_reports (
    investor_id, report_type, period_start, period_end,
    summary, generated_at
  ) VALUES (
    p_investor_id, p_report_type, p_period_start, p_period_end,
    v_summary, now()
  ) RETURNING id INTO v_report_id;

  -- Create notification
  PERFORM create_investor_notification(
    p_investor_id,
    'report_available',
    p_report_type || ' report ready',
    'Your ' || p_report_type || ' report for ' || p_period_start || ' to ' || p_period_end || ' is now available.',
    '/investor/reports',
    v_report_id,
    'report'
  );

  RETURN v_report_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Get unread notification count
-- ============================================
CREATE OR REPLACE FUNCTION get_investor_unread_count(p_investor_id uuid)
RETURNS integer AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::integer
    FROM investor_notifications
    WHERE investor_id = p_investor_id AND read = false AND dismissed = false
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- FUNCTION: Get investor analytics
-- ============================================
CREATE OR REPLACE FUNCTION get_investor_analytics(p_investor_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
  v_monthly_data jsonb;
  v_vehicle_stats jsonb;
  v_pool_allocation jsonb;
BEGIN
  -- Monthly performance (last 12 months)
  SELECT jsonb_agg(row_to_json(m)) INTO v_monthly_data
  FROM (
    SELECT
      to_char(date_trunc('month', iv.sale_date), 'YYYY-MM') as month,
      COUNT(*) as vehicles_sold,
      COALESCE(SUM(iv.gross_profit), 0) as gross_profit,
      COALESCE(SUM(iv.investor_profit), 0) as investor_profit,
      COALESCE(AVG(iv.days_held), 0) as avg_days_held,
      CASE WHEN SUM(iv.purchase_price) > 0
        THEN (SUM(iv.gross_profit) / SUM(iv.purchase_price) * 100)
        ELSE 0
      END as roi_pct
    FROM investor_vehicles iv
    JOIN investor_pool_shares ips ON iv.pool_id = ips.pool_id
    WHERE ips.investor_id = p_investor_id AND ips.active = true
      AND iv.status = 'sold' AND iv.sale_date >= (CURRENT_DATE - interval '12 months')
    GROUP BY date_trunc('month', iv.sale_date)
    ORDER BY month
  ) m;

  -- Vehicle stats by type
  SELECT jsonb_agg(row_to_json(v)) INTO v_vehicle_stats
  FROM (
    SELECT
      iv.status,
      COUNT(*) as count,
      COALESCE(SUM(iv.capital_deployed), 0) as total_capital,
      COALESCE(AVG(iv.days_held), 0) as avg_days,
      COALESCE(SUM(iv.gross_profit), 0) as total_profit
    FROM investor_vehicles iv
    JOIN investor_pool_shares ips ON iv.pool_id = ips.pool_id
    WHERE ips.investor_id = p_investor_id AND ips.active = true
    GROUP BY iv.status
  ) v;

  -- Pool allocation
  SELECT jsonb_agg(row_to_json(p)) INTO v_pool_allocation
  FROM (
    SELECT
      ip.pool_name,
      ips.capital_invested,
      ips.ownership_percentage,
      ips.total_profit_earned,
      ips.current_roi,
      ip.total_vehicles_funded,
      ip.total_vehicles_sold
    FROM investor_pool_shares ips
    JOIN investment_pools ip ON ips.pool_id = ip.id
    WHERE ips.investor_id = p_investor_id AND ips.active = true
  ) p;

  v_result := jsonb_build_object(
    'monthly_performance', COALESCE(v_monthly_data, '[]'::jsonb),
    'vehicle_stats', COALESCE(v_vehicle_stats, '[]'::jsonb),
    'pool_allocation', COALESCE(v_pool_allocation, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- STORAGE BUCKET for accreditation docs
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('investor-documents', 'investor-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS for investor-documents bucket
DROP POLICY IF EXISTS "Investors can upload their own docs" ON storage.objects;
CREATE POLICY "Investors can upload their own docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'investor-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM investors WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Investors can view their own docs" ON storage.objects;
CREATE POLICY "Investors can view their own docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'investor-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM investors WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE investor_notifications IS 'In-app notifications for investor events';
COMMENT ON TABLE investor_documents IS 'Uploaded documents for accreditation verification';
COMMENT ON FUNCTION create_investor_notification IS 'Helper to create notifications from edge functions or triggers';
COMMENT ON FUNCTION generate_investor_report IS 'Generates period summary reports for investors';
COMMENT ON FUNCTION get_investor_analytics IS 'Returns analytics data for portfolio performance charts';
