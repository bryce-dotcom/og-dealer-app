-- Remove the rigid profit split constraint that requires shares to sum to 100
-- This constraint only makes sense for profit_share pools, not merchant_rate or fixed_return
ALTER TABLE investment_pools DROP CONSTRAINT IF EXISTS valid_profit_split;

-- Add a conditional constraint: only enforce for profit_share pools
ALTER TABLE investment_pools ADD CONSTRAINT valid_profit_split CHECK (
  pool_type != 'profit_share' OR
  (investor_profit_share + platform_fee_share + dealer_profit_share = 100.00)
);
