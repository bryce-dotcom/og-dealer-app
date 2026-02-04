-- Fix mapping_confidence column type in form_library
-- The column was defined as NUMERIC(3,2) which only allows 0.00-9.99
-- We need INTEGER to store 0-100 percentage values

-- Drop the existing column and recreate as INTEGER
ALTER TABLE form_library
ALTER COLUMN mapping_confidence TYPE INTEGER USING (mapping_confidence * 100)::INTEGER;

-- Set default
ALTER TABLE form_library
ALTER COLUMN mapping_confidence SET DEFAULT 0;

-- Add comment
COMMENT ON COLUMN form_library.mapping_confidence IS 'Percentage of fields mapped (0-100)';
