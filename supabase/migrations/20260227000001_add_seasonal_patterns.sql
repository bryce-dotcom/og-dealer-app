-- Phase 3: Seasonal Pattern Analysis
-- Tracks seasonal buying/selling patterns for each make/model

CREATE TABLE IF NOT EXISTS seasonal_vehicle_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id),
  make text NOT NULL,
  model text,
  best_buy_months integer[], -- e.g., [1,2,3] for Jan-Mar
  best_sell_months integer[], -- e.g., [6,7,8] for Jun-Aug
  avg_price_by_month jsonb, -- {"1": 25000, "2": 24500, ...}
  demand_score_by_month jsonb, -- {"1": 7, "2": 8, ...} (1-10 scale)
  sales_by_month jsonb, -- {"1": 3, "2": 5, ...}
  profit_by_month jsonb, -- {"1": 2500, "2": 3000, ...}
  last_calculated_at timestamp with time zone DEFAULT now(),
  UNIQUE(dealer_id, make, model)
);

-- Enable RLS
ALTER TABLE seasonal_vehicle_patterns ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY seasonal_vehicle_patterns_policy ON seasonal_vehicle_patterns
  FOR ALL USING (dealer_id = current_setting('app.current_dealer_id')::integer);

-- Indexes
CREATE INDEX idx_seasonal_vehicle_patterns_dealer_id ON seasonal_vehicle_patterns(dealer_id);
CREATE INDEX idx_seasonal_vehicle_patterns_make_model ON seasonal_vehicle_patterns(dealer_id, make, model);

-- Verify table created
SELECT
  'seasonal_vehicle_patterns' as table_name,
  EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'seasonal_vehicle_patterns') as exists;
