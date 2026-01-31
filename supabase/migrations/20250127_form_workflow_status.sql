-- Add workflow_status column for new form lifecycle
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS workflow_status TEXT DEFAULT 'staging';

-- Add constraint for workflow_status values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'form_staging_workflow_status_check'
    ) THEN
        ALTER TABLE form_staging
        ADD CONSTRAINT form_staging_workflow_status_check
        CHECK (workflow_status IN ('staging', 'html_generated', 'mapped', 'production'));
    END IF;
END $$;

-- Add index for workflow queries
CREATE INDEX IF NOT EXISTS idx_form_staging_workflow_status ON form_staging(workflow_status);

-- Add url_validated column to track if PDF URL was verified
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS url_validated BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS url_validated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS url_error TEXT;

-- Update existing approved forms to production status
UPDATE form_staging
SET workflow_status = 'production'
WHERE status = 'approved' AND workflow_status IS NULL;

-- Update existing pending/analyzed forms to staging status
UPDATE form_staging
SET workflow_status = 'staging'
WHERE status IN ('pending', 'analyzed') AND workflow_status IS NULL;

COMMENT ON COLUMN form_staging.workflow_status IS 'Form lifecycle: staging -> html_generated -> mapped -> production';
COMMENT ON COLUMN form_staging.url_validated IS 'Whether the PDF URL has been validated as accessible';
