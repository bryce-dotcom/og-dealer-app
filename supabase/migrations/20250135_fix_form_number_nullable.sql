-- Fix form_number column to allow NULL values
-- This is needed for forms where we don't yet know the official form number

ALTER TABLE form_staging
ALTER COLUMN form_number DROP NOT NULL;

-- Add comment explaining the field
COMMENT ON COLUMN form_staging.form_number IS 'Official form number (e.g., TC-656, 130-U). NULL if not yet known. Check form_number_confirmed to see if verified.';
