-- Add pool type support: profit_share (existing) and fixed_return (new)
ALTER TABLE investment_pools ADD COLUMN IF NOT EXISTS pool_type text NOT NULL DEFAULT 'profit_share';
ALTER TABLE investment_pools ADD COLUMN IF NOT EXISTS annual_return_rate numeric(5,2) DEFAULT NULL;
ALTER TABLE investment_pools ADD COLUMN IF NOT EXISTS payout_frequency text DEFAULT NULL;
-- payout_frequency: 'monthly', 'quarterly', 'annually'
