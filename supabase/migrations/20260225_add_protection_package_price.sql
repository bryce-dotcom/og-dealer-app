-- Add protection_package_price column to deals table
-- Allows dealers to customize protection package pricing per deal

ALTER TABLE deals ADD COLUMN IF NOT EXISTS protection_package_price numeric(10,2) DEFAULT 895;

COMMENT ON COLUMN deals.protection_package_price IS 'Price charged for protection package (paint, interior, tire/wheel protection)';
