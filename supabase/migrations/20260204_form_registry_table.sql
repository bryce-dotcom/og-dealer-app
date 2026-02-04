-- Create form_registry table for state DMV forms
-- This is the master registry of forms that can be used by dealers

CREATE TABLE IF NOT EXISTS form_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Form identification
  state VARCHAR(2) NOT NULL,
  form_number VARCHAR(50),
  form_name VARCHAR(255) NOT NULL,
  category VARCHAR(50) DEFAULT 'deal',

  -- What this form is used for
  required_for TEXT[], -- ['cash', 'bhph', 'financing', 'wholesale', 'trade-in']
  description TEXT,

  -- Source information
  source_url TEXT,
  download_url TEXT, -- Our storage URL for the PDF
  is_gov_source BOOLEAN DEFAULT false,

  -- PDF analysis
  is_fillable BOOLEAN DEFAULT false,
  detected_fields JSONB DEFAULT '[]'::jsonb, -- Array of field names from PDF
  field_mappings JSONB DEFAULT '[]'::jsonb, -- Array of {pdf_field, universal_field, confidence}
  mapping_confidence INTEGER DEFAULT 0, -- 0-100

  -- AI discovery metadata
  ai_discovered BOOLEAN DEFAULT false,
  ai_confidence DECIMAL(3,2) DEFAULT 0,

  -- Status tracking
  status VARCHAR(20) DEFAULT 'pending', -- pending, active, deprecated
  last_verified_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT form_registry_category_check CHECK (category IN ('deal', 'title', 'financing', 'tax', 'disclosure', 'registration', 'compliance', 'other')),
  CONSTRAINT form_registry_status_check CHECK (status IN ('pending', 'active', 'deprecated'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_form_registry_state ON form_registry(state);
CREATE INDEX IF NOT EXISTS idx_form_registry_state_status ON form_registry(state, status);
CREATE INDEX IF NOT EXISTS idx_form_registry_category ON form_registry(category);
CREATE INDEX IF NOT EXISTS idx_form_registry_form_number ON form_registry(form_number);

-- Unique constraint on state + form_name
CREATE UNIQUE INDEX IF NOT EXISTS idx_form_registry_unique_form ON form_registry(state, form_name);

-- Ensure document_packages table exists
CREATE TABLE IF NOT EXISTS document_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  state VARCHAR(2) NOT NULL,
  deal_type VARCHAR(50) NOT NULL,
  form_ids UUID[], -- References form_registry IDs
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT document_packages_deal_type_check CHECK (deal_type IN ('Cash', 'BHPH', 'Financing', 'Wholesale', 'Trade-In'))
);

-- Index for package lookups
CREATE INDEX IF NOT EXISTS idx_document_packages_dealer ON document_packages(dealer_id);
CREATE INDEX IF NOT EXISTS idx_document_packages_dealer_deal_type ON document_packages(dealer_id, deal_type);

-- Comments
COMMENT ON TABLE form_registry IS 'Master registry of state DMV forms that can be used by dealers';
COMMENT ON COLUMN form_registry.detected_fields IS 'Array of PDF form field names extracted via pdf-lib';
COMMENT ON COLUMN form_registry.field_mappings IS 'Array mapping PDF fields to our universal schema: [{pdf_field, universal_field, confidence}]';
COMMENT ON COLUMN form_registry.required_for IS 'Deal types this form is required for: cash, bhph, financing, wholesale, trade-in';
