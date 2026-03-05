-- ============================================
-- AI-Powered Data Import System
-- ============================================
-- Created: 2026-03-05
-- Purpose: Enable dealers to import historical data (inventory, deals, customers)
--          from CSV/Excel files with AI-powered column mapping

-- ============================================
-- TABLE: import_sessions
-- ============================================
-- Tracks each import attempt with progress and audit trail
CREATE TABLE IF NOT EXISTS import_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  data_type text NOT NULL CHECK (data_type IN ('inventory', 'deals', 'customers')),
  file_name text NOT NULL,
  file_storage_path text,
  total_rows integer,
  processed_rows integer DEFAULT 0,
  success_count integer DEFAULT 0,
  error_count integer DEFAULT 0,
  warning_count integer DEFAULT 0,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  column_mappings jsonb,
  validation_summary jsonb,
  errors jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  created_by text,
  CONSTRAINT import_sessions_dealer_id_check CHECK (dealer_id > 0)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_import_sessions_dealer_id ON import_sessions(dealer_id);
CREATE INDEX IF NOT EXISTS idx_import_sessions_status ON import_sessions(status);
CREATE INDEX IF NOT EXISTS idx_import_sessions_created_at ON import_sessions(created_at DESC);

-- ============================================
-- TABLE: dealer_import_mappings
-- ============================================
-- Learning system: saves dealer's custom column mappings for future imports
CREATE TABLE IF NOT EXISTS dealer_import_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  data_type text NOT NULL CHECK (data_type IN ('inventory', 'deals', 'customers')),
  dealer_column_name text NOT NULL,
  db_field_name text NOT NULL,
  usage_count integer DEFAULT 1,
  last_used_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT dealer_import_mappings_dealer_id_check CHECK (dealer_id > 0),
  UNIQUE(dealer_id, data_type, dealer_column_name)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_dealer_import_mappings_dealer_type ON dealer_import_mappings(dealer_id, data_type);

-- ============================================
-- OPTIONAL: Add import_session_id to track source
-- ============================================
-- This allows dealers to see which import session created each record
-- and enables "undo import" functionality

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS import_session_id uuid REFERENCES import_sessions(id);
ALTER TABLE deals ADD COLUMN IF NOT EXISTS import_session_id uuid REFERENCES import_sessions(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS import_session_id uuid REFERENCES import_sessions(id);

-- Indexes for tracking imports
CREATE INDEX IF NOT EXISTS idx_inventory_import_session ON inventory(import_session_id);
CREATE INDEX IF NOT EXISTS idx_deals_import_session ON deals(import_session_id);
CREATE INDEX IF NOT EXISTS idx_customers_import_session ON customers(import_session_id);

-- ============================================
-- RLS POLICIES
-- ============================================
-- Enable RLS
ALTER TABLE import_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealer_import_mappings ENABLE ROW LEVEL SECURITY;

-- Policy: Dealers can only see their own import sessions
CREATE POLICY import_sessions_dealer_isolation ON import_sessions
  FOR ALL USING (dealer_id = current_setting('app.current_dealer_id', true)::integer);

-- Policy: Dealers can only see their own import mappings
CREATE POLICY dealer_import_mappings_dealer_isolation ON dealer_import_mappings
  FOR ALL USING (dealer_id = current_setting('app.current_dealer_id', true)::integer);

-- ============================================
-- COMMENTS (documentation)
-- ============================================
COMMENT ON TABLE import_sessions IS 'Tracks dealer data imports from CSV/Excel with AI-powered column mapping';
COMMENT ON COLUMN import_sessions.data_type IS 'Type of data being imported: inventory, deals, or customers';
COMMENT ON COLUMN import_sessions.column_mappings IS 'JSON mapping of dealer columns to database fields with confidence scores';
COMMENT ON COLUMN import_sessions.validation_summary IS 'Summary of validation results: valid, warnings, errors';
COMMENT ON COLUMN import_sessions.errors IS 'Array of error objects with row number and error message';

COMMENT ON TABLE dealer_import_mappings IS 'Learning system: stores dealer custom column mappings for reuse';
COMMENT ON COLUMN dealer_import_mappings.usage_count IS 'Number of times this mapping has been used (incremented on each import)';
