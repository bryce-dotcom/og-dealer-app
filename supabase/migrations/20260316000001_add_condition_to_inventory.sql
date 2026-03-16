-- Add condition column to inventory
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS condition text DEFAULT 'Good';
