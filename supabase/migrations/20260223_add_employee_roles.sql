-- Add security access control to employees
-- NOTE: This is DIFFERENT from the existing 'roles' field
-- - roles = job titles (CEO, Sales, Finance) - already exists
-- - access_level = security permissions (employee, manager, admin) - NEW
-- - user_id = link to auth user for multi-user login - NEW

-- Add access_level for security permissions
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'employee' CHECK (access_level IN ('employee', 'manager', 'admin'));

COMMENT ON COLUMN employees.access_level IS 'Security access level: employee = basic access, manager = view reports, admin = full access to payroll/books (separate from job roles)';

-- Set existing employees to employee level by default
UPDATE employees
SET access_level = 'employee'
WHERE access_level IS NULL;

-- Add user_id for future multi-user authentication
-- When an employee needs to login, create an auth.users account and link it here
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees(user_id) WHERE user_id IS NOT NULL;

COMMENT ON COLUMN employees.user_id IS 'Links employee to auth.users for multi-user login (optional - dealer owner does not need this)';
