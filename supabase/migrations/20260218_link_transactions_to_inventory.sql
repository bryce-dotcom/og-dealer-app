-- Add inventory_id to bank_transactions to link expenses to vehicles
-- Note: Using TEXT type to match inventory.id column type
ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS inventory_id TEXT REFERENCES inventory(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bank_transactions_inventory_id ON bank_transactions(inventory_id);

-- Add comment
COMMENT ON COLUMN bank_transactions.inventory_id IS 'Links transaction to a specific vehicle for expense tracking and profit calculation';
