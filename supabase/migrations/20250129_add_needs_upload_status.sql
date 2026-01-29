-- Add 'needs_upload' to workflow_status constraint
-- This allows forms to be discovered even if PDF isn't available online

-- Drop existing constraint
ALTER TABLE form_staging
DROP CONSTRAINT IF EXISTS form_staging_workflow_status_check;

-- Add updated constraint with 'needs_upload' status
ALTER TABLE form_staging
ADD CONSTRAINT form_staging_workflow_status_check
CHECK (workflow_status IN ('needs_upload', 'staging', 'html_generated', 'mapped', 'production'));

-- Add extended metadata columns for compliance tracking
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS issuing_authority TEXT,
ADD COLUMN IF NOT EXISTS required_for JSONB,
ADD COLUMN IF NOT EXISTS frequency TEXT,
ADD COLUMN IF NOT EXISTS deadline_info TEXT;

-- Add index for filtering by pdf_validated
CREATE INDEX IF NOT EXISTS idx_form_staging_pdf_validated ON form_staging(pdf_validated);

-- Comments
COMMENT ON COLUMN form_staging.workflow_status IS 'Form lifecycle: needs_upload -> staging -> html_generated -> mapped -> production';
COMMENT ON COLUMN form_staging.issuing_authority IS 'Agency that issues the form (DMV, Tax Commission, FTC, etc)';
COMMENT ON COLUMN form_staging.required_for IS 'Array of scenarios requiring this form: [cash_deal, bhph_deal, trade_in, etc]';
COMMENT ON COLUMN form_staging.frequency IS 'How often form is needed: per_deal, monthly, quarterly, annually, as_needed';
COMMENT ON COLUMN form_staging.deadline_info IS 'Filing deadline information';
