-- Add 'invited' to investors status check constraint
ALTER TABLE investors DROP CONSTRAINT IF EXISTS investors_status_check;
ALTER TABLE investors ADD CONSTRAINT investors_status_check
  CHECK (status IN ('pending', 'invited', 'active', 'suspended', 'closed'));
