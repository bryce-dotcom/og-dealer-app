-- Add mapping_attempt_count column to track AI retry attempts for alternative suggestions

-- Add to form_library
ALTER TABLE form_library
ADD COLUMN IF NOT EXISTS mapping_attempt_count INTEGER DEFAULT 0;

-- Add to form_staging
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS mapping_attempt_count INTEGER DEFAULT 0;

-- Add to dealer_custom_forms
ALTER TABLE dealer_custom_forms
ADD COLUMN IF NOT EXISTS mapping_attempt_count INTEGER DEFAULT 0;

-- Add to form_registry
ALTER TABLE form_registry
ADD COLUMN IF NOT EXISTS mapping_attempt_count INTEGER DEFAULT 0;
