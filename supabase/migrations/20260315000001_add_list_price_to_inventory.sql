-- Add list_price column to inventory table
-- list_price = what you're asking for the vehicle (sticker price)
-- sale_price = what you actually sold it for (final negotiated price)
-- purchase_price = what you paid for the vehicle (cost)

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS list_price numeric;

-- Backfill: set list_price = sale_price for existing records where sale_price exists
-- This preserves existing data since sale_price was previously used as the asking price
UPDATE inventory SET list_price = sale_price WHERE list_price IS NULL AND sale_price IS NOT NULL;
