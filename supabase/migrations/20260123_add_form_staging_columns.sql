-- Add missing columns to form_staging table for field mapping system

-- Add detected_fields column (array of PDF field names)
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS detected_fields jsonb DEFAULT '[]'::jsonb;

-- Add field_mapping column (mapping of PDF fields to deal context)
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS field_mapping jsonb DEFAULT '{}'::jsonb;

-- Add mapping_confidence column (0-100 percentage)
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS mapping_confidence integer DEFAULT 0;

-- Add form_type column (title, registration, bill_of_sale, etc.)
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS form_type text;

-- Add analyzed_at timestamp
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS analyzed_at timestamptz;

-- Also add the same columns to form_library if they don't exist
ALTER TABLE form_library
ADD COLUMN IF NOT EXISTS detected_fields jsonb DEFAULT '[]'::jsonb;

ALTER TABLE form_library
ADD COLUMN IF NOT EXISTS mapping_status text DEFAULT 'pending';

-- Add index for faster queries on mapping_confidence
CREATE INDEX IF NOT EXISTS idx_form_staging_mapping_confidence
ON form_staging(mapping_confidence);

CREATE INDEX IF NOT EXISTS idx_form_staging_status
ON form_staging(status);

-- Comment the columns for documentation
COMMENT ON COLUMN form_staging.detected_fields IS 'Array of PDF field names detected by AI analysis';
COMMENT ON COLUMN form_staging.field_mapping IS 'JSON mapping of PDF field names to deal context paths (e.g., {"BuyerName": "deal.purchaser_name"})';
COMMENT ON COLUMN form_staging.mapping_confidence IS 'Percentage of fields mapped (0-100). Must be >= 99 to promote to library.';
COMMENT ON COLUMN form_staging.form_type IS 'Type of form: title, registration, bill_of_sale, disclosure, tax, lien_release, power_of_attorney, other';
COMMENT ON COLUMN form_staging.analyzed_at IS 'Timestamp when AI analysis was last performed';
