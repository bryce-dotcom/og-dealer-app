-- Add HTML template fields to form_staging table (used as the forms library)
-- Note: form_staging is the main table; "library" is just approved forms from staging

ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS html_template_url TEXT,
ADD COLUMN IF NOT EXISTS template_status TEXT DEFAULT 'none';

-- Add constraint for template_status if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'form_staging_template_status_check'
    ) THEN
        ALTER TABLE form_staging
        ADD CONSTRAINT form_staging_template_status_check
        CHECK (template_status IN ('none', 'generating', 'ready', 'failed'));
    END IF;
END $$;

-- Add index for template status queries
CREATE INDEX IF NOT EXISTS idx_form_staging_template_status ON form_staging(template_status);

-- Comment for documentation
COMMENT ON COLUMN form_staging.html_template_url IS 'Path to HTML template in form-templates storage bucket';
COMMENT ON COLUMN form_staging.template_status IS 'Status of HTML template: none, generating, ready, failed';
