-- Add pool type support: merchant_rate (default), profit_share, fixed_return
-- merchant_rate: flat % earned per transaction when investor capital is used
-- profit_share: split vehicle transaction profit between investor, platform, dealer
-- fixed_return: fixed annual %, paid on a schedule
ALTER TABLE investment_pools ADD COLUMN IF NOT EXISTS pool_type text NOT NULL DEFAULT 'merchant_rate';
ALTER TABLE investment_pools ADD COLUMN IF NOT EXISTS annual_return_rate numeric(5,2) DEFAULT NULL;
ALTER TABLE investment_pools ADD COLUMN IF NOT EXISTS payout_frequency text DEFAULT NULL;
-- payout_frequency: 'monthly', 'quarterly', 'annually'
