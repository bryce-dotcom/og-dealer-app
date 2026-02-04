-- Add storage columns to form_registry for tracking uploaded PDFs
-- These columns track where the actual PDF file is stored in Supabase storage

ALTER TABLE form_registry
ADD COLUMN IF NOT EXISTS storage_bucket VARCHAR(100),
ADD COLUMN IF NOT EXISTS storage_path VARCHAR(500);

-- Index for finding forms with uploaded PDFs
CREATE INDEX IF NOT EXISTS idx_form_registry_has_storage ON form_registry(storage_bucket) WHERE storage_bucket IS NOT NULL;

-- Comments
COMMENT ON COLUMN form_registry.storage_bucket IS 'Supabase storage bucket name where PDF is stored (e.g., form-templates)';
COMMENT ON COLUMN form_registry.storage_path IS 'Path within the bucket to the PDF file (e.g., UT/TC-656.pdf)';
