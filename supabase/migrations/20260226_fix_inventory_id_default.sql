-- Fix inventory table id column to auto-generate UUIDs
-- This resolves: "null value in column 'id' violates not-null constraint"

-- Set default value for id column to auto-generate UUIDs
ALTER TABLE inventory ALTER COLUMN id SET DEFAULT gen_random_uuid();

COMMENT ON COLUMN inventory.id IS 'Auto-generated UUID primary key';
