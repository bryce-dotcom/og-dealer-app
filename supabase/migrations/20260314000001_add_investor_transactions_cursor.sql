-- Add plaid_transactions_cursor to investors table for incremental transaction sync
-- Also add pending_deposits JSONB array to track declared deposits awaiting confirmation

ALTER TABLE investors
  ADD COLUMN IF NOT EXISTS plaid_transactions_cursor text,
  ADD COLUMN IF NOT EXISTS pending_deposits jsonb DEFAULT '[]'::jsonb;

-- Add comment for clarity
COMMENT ON COLUMN investors.plaid_transactions_cursor IS 'Cursor for Plaid /transactions/sync incremental updates';
COMMENT ON COLUMN investors.pending_deposits IS 'Array of pending deposit declarations: [{id, amount, declared_at, status}]';
