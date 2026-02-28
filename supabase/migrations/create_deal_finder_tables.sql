-- =============================================
-- Deal Finder System Tables
-- =============================================

-- Table: saved_vehicle_searches
-- Stores dealer's saved search criteria for auto-scout feature
CREATE TABLE IF NOT EXISTS saved_vehicle_searches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id UUID NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,

  -- Search details
  name TEXT NOT NULL, -- User-friendly name like "F-150s for BHPH"

  -- Vehicle criteria
  year_min INT,
  year_max INT,
  make TEXT NOT NULL,
  model TEXT,
  trim TEXT,
  max_price INT,
  max_miles INT,

  -- Location
  zip_code TEXT DEFAULT '84065',
  radius_miles INT DEFAULT 250,

  -- Preferences
  bhph_preferred BOOLEAN DEFAULT false,

  -- Status
  active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_year_range CHECK (year_min IS NULL OR year_max IS NULL OR year_min <= year_max),
  CONSTRAINT valid_price CHECK (max_price IS NULL OR max_price > 0),
  CONSTRAINT valid_miles CHECK (max_miles IS NULL OR max_miles > 0),
  CONSTRAINT valid_radius CHECK (radius_miles > 0 AND radius_miles <= 500)
);

-- Index for dealer queries
CREATE INDEX IF NOT EXISTS idx_saved_searches_dealer ON saved_vehicle_searches(dealer_id);
CREATE INDEX IF NOT EXISTS idx_saved_searches_active ON saved_vehicle_searches(dealer_id, active) WHERE active = true;

-- RLS Policies
ALTER TABLE saved_vehicle_searches ENABLE ROW LEVEL SECURITY;

-- Dealers can view their own searches
CREATE POLICY "Dealers can view own searches"
  ON saved_vehicle_searches FOR SELECT
  USING (
    dealer_id IN (
      SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid()
      UNION
      SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true
    )
  );

-- Dealers can create their own searches
CREATE POLICY "Dealers can create own searches"
  ON saved_vehicle_searches FOR INSERT
  WITH CHECK (
    dealer_id IN (
      SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid()
      UNION
      SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true
    )
  );

-- Dealers can update their own searches
CREATE POLICY "Dealers can update own searches"
  ON saved_vehicle_searches FOR UPDATE
  USING (
    dealer_id IN (
      SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid()
      UNION
      SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true
    )
  );

-- Dealers can delete their own searches
CREATE POLICY "Dealers can delete own searches"
  ON saved_vehicle_searches FOR DELETE
  USING (
    dealer_id IN (
      SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid()
      UNION
      SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true
    )
  );

-- =============================================

-- Table: deal_alerts
-- Stores vehicles found by background job that match dealer criteria
CREATE TABLE IF NOT EXISTS deal_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id UUID NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  search_id UUID REFERENCES saved_vehicle_searches(id) ON DELETE SET NULL,

  -- Vehicle information
  year INT,
  make TEXT,
  model TEXT,
  trim TEXT,
  vin TEXT,
  price INT,
  miles INT,
  location TEXT,
  url TEXT,
  source TEXT, -- "Craigslist", "FB Marketplace", "Dealer", etc
  exterior_color TEXT,
  seller_type TEXT, -- "Private Party", "Dealer"
  dealer_name TEXT, -- If from dealer
  thumbnail TEXT, -- Image URL if available

  -- Valuation data
  mmr INT, -- Manheim Market Report value
  market_value INT, -- Retail market value
  trade_in_value INT,
  wholesale_value INT,
  deal_score TEXT, -- "STRONG BUY", "GOOD BUY", "FAIR PRICE", etc
  savings INT, -- Dollars below market
  savings_percentage DECIMAL(5,2), -- Percentage below market

  -- AI Analysis
  estimated_profit INT,
  estimated_recon_cost INT,
  estimated_holding_cost INT,
  bhph_score INT, -- 1-10 rating for BHPH suitability
  recommendation TEXT, -- "STRONG BUY", "BUY", "MAYBE", "PASS"
  confidence_score INT, -- 0-100
  ai_reasoning JSONB, -- Full AI analysis details

  -- Deal status
  status TEXT DEFAULT 'new', -- new, viewed, interested, passed, purchased
  notes TEXT, -- Dealer notes

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  viewed_at TIMESTAMP,
  actioned_at TIMESTAMP,
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '7 days', -- Auto-expire old deals

  CONSTRAINT valid_bhph_score CHECK (bhph_score IS NULL OR (bhph_score >= 1 AND bhph_score <= 10)),
  CONSTRAINT valid_confidence CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 100)),
  CONSTRAINT valid_status CHECK (status IN ('new', 'viewed', 'interested', 'passed', 'purchased'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_deal_alerts_dealer ON deal_alerts(dealer_id);
CREATE INDEX IF NOT EXISTS idx_deal_alerts_search ON deal_alerts(search_id);
CREATE INDEX IF NOT EXISTS idx_deal_alerts_status ON deal_alerts(dealer_id, status);
CREATE INDEX IF NOT EXISTS idx_deal_alerts_created ON deal_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deal_alerts_new ON deal_alerts(dealer_id, created_at DESC) WHERE status = 'new';

-- RLS Policies
ALTER TABLE deal_alerts ENABLE ROW LEVEL SECURITY;

-- Dealers can view their own alerts
CREATE POLICY "Dealers can view own alerts"
  ON deal_alerts FOR SELECT
  USING (
    dealer_id IN (
      SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid()
      UNION
      SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true
    )
  );

-- Service role can insert alerts (from background job)
CREATE POLICY "Service role can insert alerts"
  ON deal_alerts FOR INSERT
  WITH CHECK (true);

-- Dealers can update their own alerts
CREATE POLICY "Dealers can update own alerts"
  ON deal_alerts FOR UPDATE
  USING (
    dealer_id IN (
      SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid()
      UNION
      SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true
    )
  );

-- Dealers can delete their own alerts
CREATE POLICY "Dealers can delete own alerts"
  ON deal_alerts FOR DELETE
  USING (
    dealer_id IN (
      SELECT id FROM dealer_settings WHERE owner_user_id = auth.uid()
      UNION
      SELECT dealer_id FROM employees WHERE user_id = auth.uid() AND active = true
    )
  );

-- =============================================

-- Function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_saved_search_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update updated_at
CREATE TRIGGER update_saved_search_timestamp
  BEFORE UPDATE ON saved_vehicle_searches
  FOR EACH ROW
  EXECUTE FUNCTION update_saved_search_timestamp();

-- =============================================

-- Function: Clean up expired deal alerts
CREATE OR REPLACE FUNCTION cleanup_expired_deal_alerts()
RETURNS void AS $$
BEGIN
  DELETE FROM deal_alerts
  WHERE expires_at < NOW()
    AND status IN ('new', 'viewed', 'passed');
  -- Keep 'interested' and 'purchased' forever
END;
$$ LANGUAGE plpgsql;

-- =============================================

COMMENT ON TABLE saved_vehicle_searches IS 'Dealer saved search criteria for auto-scout deal finder';
COMMENT ON TABLE deal_alerts IS 'Vehicle deals found by background job matching dealer criteria';
COMMENT ON COLUMN deal_alerts.ai_reasoning IS 'JSON containing full AI analysis: key_reasons, risks, market_insights';
COMMENT ON COLUMN deal_alerts.expires_at IS 'Auto-expire deals after 7 days unless marked interested/purchased';
