-- Add description and metadata fields to investor_capital for better transfer tracking

ALTER TABLE investor_capital ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE investor_capital ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Create index on plaid_transfer_id for webhook lookups
CREATE INDEX IF NOT EXISTS idx_capital_plaid_transfer_id ON investor_capital(plaid_transfer_id);

COMMENT ON COLUMN investor_capital.description IS 'Human-readable description of the transaction';
COMMENT ON COLUMN investor_capital.metadata IS 'Additional data: transfer status, authorization_id, estimated settlement, etc';
