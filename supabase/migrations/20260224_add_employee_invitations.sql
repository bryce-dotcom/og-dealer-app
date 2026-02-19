-- Add employee invitation tracking
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;

COMMENT ON COLUMN employees.invited_at IS 'Timestamp when invitation email was sent to employee';

CREATE INDEX IF NOT EXISTS idx_employees_invited_at ON employees(invited_at) WHERE invited_at IS NOT NULL;
