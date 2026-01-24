-- Add compliance_notes for AI-generated form descriptions
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS compliance_notes text;

COMMENT ON COLUMN form_staging.compliance_notes IS 'AI-generated description of form purpose, when to use it, and compliance requirements';
