-- Add dismissed_fields column to form_staging for tracking fields user has dismissed
ALTER TABLE form_staging ADD COLUMN IF NOT EXISTS dismissed_fields JSONB DEFAULT '{}';

-- Also ensure field_mapping column exists (for UI state)
ALTER TABLE form_staging ADD COLUMN IF NOT EXISTS field_mapping JSONB DEFAULT '{}';

-- Add comment
COMMENT ON COLUMN form_staging.dismissed_fields IS 'Tracks which PDF fields the user has dismissed (not needed for this form)';
COMMENT ON COLUMN form_staging.field_mapping IS 'UI-friendly format of field mappings { pdf_field: { fields: [], separator } }';
