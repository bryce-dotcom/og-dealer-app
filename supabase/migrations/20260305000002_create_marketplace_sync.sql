-- ============================================
-- Marketplace Syndication System
-- ============================================
-- Created: 2026-03-05
-- Purpose: Enable dealers to sync inventory to Facebook, KSL, AutoTrader

-- ============================================
-- TABLE: marketplace_settings
-- ============================================
-- Stores marketplace connection settings and credentials for each dealer
CREATE TABLE IF NOT EXISTS marketplace_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  marketplace text NOT NULL CHECK (marketplace IN ('facebook', 'ksl', 'autotrader')),
  enabled boolean DEFAULT false,

  -- Encrypted credentials (JSON with platform-specific fields)
  -- Facebook: { access_token, catalog_id, page_id }
  -- KSL: { username, password, dealer_id }
  -- AutoTrader: { ftp_host, ftp_username, ftp_password, dealer_id }
  credentials jsonb,

  sync_frequency text DEFAULT 'hourly' CHECK (sync_frequency IN ('realtime', 'hourly', 'daily', 'manual')),
  auto_sync boolean DEFAULT true,
  last_sync_at timestamptz,
  last_sync_status text, -- 'success', 'error', 'pending'
  last_sync_error text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT marketplace_settings_dealer_id_check CHECK (dealer_id > 0),
  UNIQUE(dealer_id, marketplace)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_marketplace_settings_dealer ON marketplace_settings(dealer_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_settings_enabled ON marketplace_settings(enabled) WHERE enabled = true;

-- ============================================
-- TABLE: marketplace_listings
-- ============================================
-- Tracks sync status of each vehicle listing on each marketplace
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  inventory_id text NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  marketplace text NOT NULL CHECK (marketplace IN ('facebook', 'ksl', 'autotrader')),

  -- External marketplace listing ID
  listing_id text,

  -- Status tracking
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'sold', 'removed', 'error')),

  -- Sync tracking
  last_synced_at timestamptz,
  sync_attempts integer DEFAULT 0,
  error_message text,

  -- Metadata (platform-specific data)
  metadata jsonb,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT marketplace_listings_dealer_id_check CHECK (dealer_id > 0),
  UNIQUE(dealer_id, inventory_id, marketplace)
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_dealer ON marketplace_listings(dealer_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_inventory ON marketplace_listings(inventory_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_marketplace ON marketplace_listings(marketplace);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_status ON marketplace_listings(status);

-- ============================================
-- TABLE: marketplace_sync_log
-- ============================================
-- Audit log of all sync operations
CREATE TABLE IF NOT EXISTS marketplace_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  marketplace text NOT NULL,
  sync_type text NOT NULL, -- 'full', 'partial', 'single'

  -- Results
  total_items integer,
  success_count integer DEFAULT 0,
  error_count integer DEFAULT 0,

  -- Details
  items_synced jsonb, -- Array of inventory_ids
  errors jsonb, -- Array of error objects

  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,

  CONSTRAINT marketplace_sync_log_dealer_id_check CHECK (dealer_id > 0)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_marketplace_sync_log_dealer ON marketplace_sync_log(dealer_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_sync_log_created ON marketplace_sync_log(started_at DESC);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE marketplace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_sync_log ENABLE ROW LEVEL SECURITY;

-- Dealers can only see their own marketplace data
CREATE POLICY marketplace_settings_dealer_isolation ON marketplace_settings
  FOR ALL USING (dealer_id = current_setting('app.current_dealer_id', true)::integer);

CREATE POLICY marketplace_listings_dealer_isolation ON marketplace_listings
  FOR ALL USING (dealer_id = current_setting('app.current_dealer_id', true)::integer);

CREATE POLICY marketplace_sync_log_dealer_isolation ON marketplace_sync_log
  FOR ALL USING (dealer_id = current_setting('app.current_dealer_id', true)::integer);

-- ============================================
-- COMMENTS (documentation)
-- ============================================
COMMENT ON TABLE marketplace_settings IS 'Marketplace connection settings and credentials for each dealer';
COMMENT ON COLUMN marketplace_settings.credentials IS 'Encrypted JSON with platform-specific API credentials';
COMMENT ON COLUMN marketplace_settings.sync_frequency IS 'How often to auto-sync: realtime, hourly, daily, manual';

COMMENT ON TABLE marketplace_listings IS 'Tracks sync status of each vehicle listing on each marketplace';
COMMENT ON COLUMN marketplace_listings.listing_id IS 'External marketplace listing ID (e.g., Facebook catalog item ID)';
COMMENT ON COLUMN marketplace_listings.status IS 'Current listing status: pending, active, sold, removed, error';

COMMENT ON TABLE marketplace_sync_log IS 'Audit log of all marketplace sync operations';
