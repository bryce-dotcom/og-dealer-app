-- Add missing columns to form_library table for promote functionality
-- These columns mirror form_staging to allow seamless promotion

-- Storage location columns
ALTER TABLE form_library
ADD COLUMN IF NOT EXISTS download_url TEXT;

ALTER TABLE form_library
ADD COLUMN IF NOT EXISTS storage_bucket TEXT;

ALTER TABLE form_library
ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- PDF analysis columns
ALTER TABLE form_library
ADD COLUMN IF NOT EXISTS is_fillable BOOLEAN DEFAULT false;

ALTER TABLE form_library
ADD COLUMN IF NOT EXISTS field_mappings JSONB DEFAULT '[]'::jsonb;

-- Track which staging record this was promoted from
ALTER TABLE form_library
ADD COLUMN IF NOT EXISTS promoted_from UUID;

-- Source URL (original download location)
ALTER TABLE form_library
ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Status column
ALTER TABLE form_library
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_form_library_state ON form_library(state);
CREATE INDEX IF NOT EXISTS idx_form_library_category ON form_library(category);
CREATE INDEX IF NOT EXISTS idx_form_library_status ON form_library(status);

-- Comments
COMMENT ON COLUMN form_library.download_url IS 'URL where the PDF was originally downloaded from';
COMMENT ON COLUMN form_library.storage_bucket IS 'Supabase storage bucket name';
COMMENT ON COLUMN form_library.storage_path IS 'Path within the storage bucket';
COMMENT ON COLUMN form_library.is_fillable IS 'Whether the PDF has fillable form fields';
COMMENT ON COLUMN form_library.field_mappings IS 'Array of field mappings from PDF fields to universal schema';
COMMENT ON COLUMN form_library.promoted_from IS 'UUID of the form_staging record this was promoted from';
