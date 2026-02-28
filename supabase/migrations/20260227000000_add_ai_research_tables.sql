-- AI-Powered Research Page Intelligence
-- Phase 1: AI Analysis Foundation

-- Table: dealer_vehicle_preferences
-- Stores historical performance data for make/model combinations
CREATE TABLE dealer_vehicle_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id),
  make text NOT NULL,
  model text,
  avg_profit numeric,
  avg_days_on_lot integer,
  total_sold integer,
  success_rate numeric,
  avg_purchase_price numeric,
  avg_sale_price numeric,
  last_calculated_at timestamp with time zone DEFAULT now(),
  UNIQUE(dealer_id, make, model)
);

-- Table: vehicle_ai_analysis
-- Stores AI analysis results (cached to save credits)
CREATE TABLE vehicle_ai_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id),
  vin text,
  year integer,
  make text NOT NULL,
  model text NOT NULL,
  price numeric,
  miles integer,
  estimated_profit numeric,
  estimated_recon_cost numeric,
  estimated_days_to_sell integer,
  bhph_score integer, -- 1-10
  recommendation text, -- STRONG_BUY, BUY, MAYBE, PASS
  confidence_score integer, -- 0-100
  key_reasons text[],
  risks text[],
  target_purchase_price numeric,
  target_sale_price numeric,
  analyzed_at timestamp with time zone DEFAULT now()
);

-- Table: market_intelligence_cache
-- Caches market intelligence data (24hr TTL)
CREATE TABLE market_intelligence_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id),
  cache_key text NOT NULL,
  make text NOT NULL,
  model text,
  insights jsonb NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  UNIQUE(dealer_id, cache_key)
);

-- Enable RLS on all new tables
ALTER TABLE dealer_vehicle_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_ai_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_intelligence_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY dealer_vehicle_preferences_policy ON dealer_vehicle_preferences
  FOR ALL USING (dealer_id = current_setting('app.current_dealer_id')::integer);

CREATE POLICY vehicle_ai_analysis_policy ON vehicle_ai_analysis
  FOR ALL USING (dealer_id = current_setting('app.current_dealer_id')::integer);

CREATE POLICY market_intelligence_cache_policy ON market_intelligence_cache
  FOR ALL USING (dealer_id = current_setting('app.current_dealer_id')::integer);

-- Indexes for performance
CREATE INDEX idx_dealer_vehicle_preferences_dealer_id ON dealer_vehicle_preferences(dealer_id);
CREATE INDEX idx_dealer_vehicle_preferences_make_model ON dealer_vehicle_preferences(dealer_id, make, model);

CREATE INDEX idx_vehicle_ai_analysis_dealer_id ON vehicle_ai_analysis(dealer_id);
CREATE INDEX idx_vehicle_ai_analysis_vin ON vehicle_ai_analysis(dealer_id, vin);
CREATE INDEX idx_vehicle_ai_analysis_make_model ON vehicle_ai_analysis(dealer_id, make, model);

CREATE INDEX idx_market_intelligence_cache_dealer_id ON market_intelligence_cache(dealer_id);
CREATE INDEX idx_market_intelligence_cache_key ON market_intelligence_cache(dealer_id, cache_key);
CREATE INDEX idx_market_intelligence_cache_expires ON market_intelligence_cache(expires_at);
