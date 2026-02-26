-- Sales Rep Commission Tracking System

-- ============================================
-- SALES REPS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS sales_reps (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  territory TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'terminated_for_cause')),
  start_date DATE DEFAULT CURRENT_DATE,
  end_date DATE,
  departure_type TEXT CHECK (departure_type IN ('voluntary', 'terminated_for_cause')),
  upfront_commission DECIMAL(10,2) DEFAULT 300.00,
  residual_rate DECIMAL(5,4) DEFAULT 0.15,
  bonus_threshold INTEGER DEFAULT 15,
  bonus_amount DECIMAL(10,2) DEFAULT 750.00,
  clawback_days INTEGER DEFAULT 90,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_reps_status ON sales_reps(status);
CREATE INDEX IF NOT EXISTS idx_sales_reps_email ON sales_reps(email);

COMMENT ON TABLE sales_reps IS 'Sales representatives who sign up dealers';
COMMENT ON COLUMN sales_reps.status IS 'active, inactive, or terminated_for_cause';
COMMENT ON COLUMN sales_reps.upfront_commission IS 'One-time commission paid for new signup (default $300)';
COMMENT ON COLUMN sales_reps.residual_rate IS 'Percentage of monthly revenue paid as residual (default 15% = 0.15)';
COMMENT ON COLUMN sales_reps.bonus_threshold IS 'Number of signups per month to earn bonus (default 15)';
COMMENT ON COLUMN sales_reps.bonus_amount IS 'Bonus amount when threshold is met (default $750)';
COMMENT ON COLUMN sales_reps.clawback_days IS 'Days within which cancellation triggers clawback (default 90)';

-- ============================================
-- REP SIGNUPS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS rep_signups (
  id SERIAL PRIMARY KEY,
  rep_id INTEGER REFERENCES sales_reps(id) ON DELETE CASCADE,
  dealer_id INTEGER REFERENCES dealer_settings(id) ON DELETE SET NULL,
  dealer_name TEXT NOT NULL,
  signup_date DATE DEFAULT CURRENT_DATE,
  plan_type TEXT DEFAULT 'pro' CHECK (plan_type IN ('starter', 'pro', 'dealer', 'unlimited')),
  monthly_rate DECIMAL(10,2) DEFAULT 79.00,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'clawback', 'paused')),
  cancel_date DATE,
  cancel_reason TEXT,
  clawback_applied BOOLEAN DEFAULT false,
  credits_purchased DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rep_signups_rep_id ON rep_signups(rep_id);
CREATE INDEX IF NOT EXISTS idx_rep_signups_dealer_id ON rep_signups(dealer_id);
CREATE INDEX IF NOT EXISTS idx_rep_signups_status ON rep_signups(status);
CREATE INDEX IF NOT EXISTS idx_rep_signups_signup_date ON rep_signups(signup_date);

COMMENT ON TABLE rep_signups IS 'Dealers signed up by sales reps';
COMMENT ON COLUMN rep_signups.monthly_rate IS 'Monthly subscription rate for this dealer';
COMMENT ON COLUMN rep_signups.credits_purchased IS 'Additional credits purchased by this dealer';
COMMENT ON COLUMN rep_signups.clawback_applied IS 'True if upfront commission was clawed back due to early cancellation';

-- ============================================
-- COMMISSION PAYOUTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS commission_payouts (
  id SERIAL PRIMARY KEY,
  rep_id INTEGER REFERENCES sales_reps(id) ON DELETE CASCADE,
  payout_period TEXT NOT NULL,
  upfront_total DECIMAL(10,2) DEFAULT 0,
  upfront_count INTEGER DEFAULT 0,
  residual_total DECIMAL(10,2) DEFAULT 0,
  residual_accounts INTEGER DEFAULT 0,
  bonus_total DECIMAL(10,2) DEFAULT 0,
  clawback_total DECIMAL(10,2) DEFAULT 0,
  gross_payout DECIMAL(10,2) DEFAULT 0,
  net_payout DECIMAL(10,2) DEFAULT 0,
  paid BOOLEAN DEFAULT false,
  paid_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(rep_id, payout_period)
);

CREATE INDEX IF NOT EXISTS idx_commission_payouts_rep_id ON commission_payouts(rep_id);
CREATE INDEX IF NOT EXISTS idx_commission_payouts_period ON commission_payouts(payout_period);
CREATE INDEX IF NOT EXISTS idx_commission_payouts_paid ON commission_payouts(paid);

COMMENT ON TABLE commission_payouts IS 'Monthly commission payouts to sales reps';
COMMENT ON COLUMN commission_payouts.payout_period IS 'Format: YYYY-MM (e.g., 2026-03)';
COMMENT ON COLUMN commission_payouts.upfront_total IS 'Total upfront commissions for new signups this period';
COMMENT ON COLUMN commission_payouts.residual_total IS 'Total residual commissions from all active accounts';
COMMENT ON COLUMN commission_payouts.gross_payout IS 'Total before clawbacks: upfront + residual + bonus';
COMMENT ON COLUMN commission_payouts.net_payout IS 'Final payout after clawbacks: gross - clawback';

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE sales_reps ENABLE ROW LEVEL SECURITY;
ALTER TABLE rep_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_payouts ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated and anon roles (admin section)
DROP POLICY IF EXISTS "Allow all for sales_reps" ON sales_reps;
CREATE POLICY "Allow all for sales_reps" ON sales_reps
  FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all for rep_signups" ON rep_signups;
CREATE POLICY "Allow all for rep_signups" ON rep_signups
  FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all for commission_payouts" ON commission_payouts;
CREATE POLICY "Allow all for commission_payouts" ON commission_payouts
  FOR ALL USING (true);

-- ============================================
-- HELPFUL VIEWS
-- ============================================

-- View for rep performance summary
CREATE OR REPLACE VIEW rep_performance AS
SELECT
  sr.id,
  sr.name,
  sr.status,
  sr.start_date,
  sr.end_date,
  COUNT(CASE WHEN rs.status = 'active' THEN 1 END) as active_signups,
  SUM(CASE WHEN rs.status = 'active' THEN rs.monthly_rate ELSE 0 END) as total_mrr,
  EXTRACT(YEAR FROM AGE(COALESCE(sr.end_date, CURRENT_DATE), sr.start_date)) * 12 +
    EXTRACT(MONTH FROM AGE(COALESCE(sr.end_date, CURRENT_DATE), sr.start_date)) as months_active
FROM sales_reps sr
LEFT JOIN rep_signups rs ON sr.id = rs.rep_id
GROUP BY sr.id, sr.name, sr.status, sr.start_date, sr.end_date;

COMMENT ON VIEW rep_performance IS 'Summary of each reps active signups, MRR, and tenure';

-- ============================================
-- SAMPLE DATA (Optional - comment out if not needed)
-- ============================================

-- Insert sample rep
-- INSERT INTO sales_reps (name, email, phone, territory)
-- VALUES ('John Smith', 'john@example.com', '555-1234', 'West Coast')
-- ON CONFLICT (email) DO NOTHING;
