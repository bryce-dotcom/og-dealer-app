-- Add commission tracking to paystubs
ALTER TABLE paystubs
ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(10,2) DEFAULT 0;

-- Add helpful comment
COMMENT ON COLUMN paystubs.commission_amount IS 'Total commissions earned during this pay period from vehicle sales';

-- Add index for faster commission queries
CREATE INDEX IF NOT EXISTS idx_inventory_commissions_employee_created
ON inventory_commissions(employee_id, created_at);
