-- Add calculated deal fields for document generation
-- These fields store calculated subtotals, tax breakdowns, and trade-in calculations

ALTER TABLE deals ADD COLUMN IF NOT EXISTS total_cash_price numeric(10,2);
ALTER TABLE deals ADD COLUMN IF NOT EXISTS subtotal_price numeric(10,2);
ALTER TABLE deals ADD COLUMN IF NOT EXISTS subtotal_taxable numeric(10,2);
ALTER TABLE deals ADD COLUMN IF NOT EXISTS net_trade_allowance numeric(10,2);
ALTER TABLE deals ADD COLUMN IF NOT EXISTS total_credits numeric(10,2);
ALTER TABLE deals ADD COLUMN IF NOT EXISTS net_taxable_amount numeric(10,2);
ALTER TABLE deals ADD COLUMN IF NOT EXISTS tax_amount numeric(10,2);
ALTER TABLE deals ADD COLUMN IF NOT EXISTS total_fees numeric(10,2);

COMMENT ON COLUMN deals.total_cash_price IS 'Vehicle cash price + accessories total';
COMMENT ON COLUMN deals.subtotal_price IS 'Total cash price - rebates applied';
COMMENT ON COLUMN deals.subtotal_taxable IS 'Subtotal + F&I products + doc fee (before tax)';
COMMENT ON COLUMN deals.net_trade_allowance IS 'Trade allowance - trade payoff';
COMMENT ON COLUMN deals.total_credits IS 'Down payment + net trade allowance';
COMMENT ON COLUMN deals.net_taxable_amount IS 'Subtotal taxable - trade credits';
COMMENT ON COLUMN deals.tax_amount IS 'Sales tax calculated amount';
COMMENT ON COLUMN deals.total_fees IS 'Sum of all government/DMV fees';
