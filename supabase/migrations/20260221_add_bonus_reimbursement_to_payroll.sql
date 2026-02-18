-- Add bonus and reimbursement tracking to paystubs
ALTER TABLE paystubs
ADD COLUMN IF NOT EXISTS bonus_amount DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS reimbursement_amount DECIMAL(10,2) DEFAULT 0;

-- Add comments
COMMENT ON COLUMN paystubs.bonus_amount IS 'One-time bonus paid this period';
COMMENT ON COLUMN paystubs.reimbursement_amount IS 'Reimbursements (non-taxable)';
