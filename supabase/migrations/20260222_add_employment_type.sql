-- Add employment type classification to employees
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'W2' CHECK (employment_type IN ('W2', '1099'));

-- Add comment
COMMENT ON COLUMN employees.employment_type IS 'W2 = employee with tax withholding, 1099 = independent contractor (no tax withholding)';

-- Update existing employees to W2 by default
UPDATE employees
SET employment_type = 'W2'
WHERE employment_type IS NULL;
