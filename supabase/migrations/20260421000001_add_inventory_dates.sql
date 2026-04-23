-- Add purchase + sale date tracking to inventory for analytics
-- Feedback from OG DiX Motor Club (3/26 + 4/5): need purchase/trade-in date, sold date,
-- and days-in-inventory counter for analytics and glance info.

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS date_acquired date;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS sale_date date;

-- Backfill date_acquired from created_at for existing rows so days-in-inventory works immediately.
UPDATE inventory SET date_acquired = created_at::date WHERE date_acquired IS NULL;
