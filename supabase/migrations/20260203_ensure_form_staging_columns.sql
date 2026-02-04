-- Ensure all necessary columns exist in form_staging for the analyze/map/fill workflow

-- Field mappings (array of {pdf_field, universal_field, confidence, status})
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS field_mappings JSONB DEFAULT '[]'::jsonb;

-- Detected PDF field names (array of strings)
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS detected_fields JSONB DEFAULT '[]'::jsonb;

-- Field mapping object format (legacy, for backwards compatibility)
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS field_mapping JSONB DEFAULT '{}'::jsonb;

-- Dismissed fields tracking
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS dismissed_fields JSONB DEFAULT '{}'::jsonb;

-- Mapping confidence percentage (0-100)
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS mapping_confidence INTEGER DEFAULT 0;

-- Mapping status: pending, extracted, ai_suggested, human_verified
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS mapping_status TEXT DEFAULT 'pending';

-- Is the PDF fillable (has form fields)
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS is_fillable BOOLEAN DEFAULT false;

-- When was the form analyzed
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;

-- PDF validated flag
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS pdf_validated BOOLEAN DEFAULT false;

-- URL validated flag
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS url_validated BOOLEAN DEFAULT false;

-- URL validation timestamp
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS url_validated_at TIMESTAMPTZ;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_form_staging_status ON form_staging(status);
CREATE INDEX IF NOT EXISTS idx_form_staging_state_status ON form_staging(state, status);
CREATE INDEX IF NOT EXISTS idx_form_staging_mapping_status ON form_staging(mapping_status);

-- Comments for documentation
COMMENT ON COLUMN form_staging.field_mappings IS 'Array of field mapping objects: [{pdf_field, universal_field, universal_fields[], confidence, status}]';
COMMENT ON COLUMN form_staging.detected_fields IS 'Array of PDF field names extracted from the form';
COMMENT ON COLUMN form_staging.mapping_confidence IS 'Percentage of fields successfully mapped (0-100)';
COMMENT ON COLUMN form_staging.is_fillable IS 'True if PDF has fillable form fields that can be programmatically filled';
