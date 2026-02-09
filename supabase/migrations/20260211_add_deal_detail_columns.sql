-- Add missing detail columns to deals table for document generation
-- These columns support: buyer ID, trade-in details, and lienholder info

ALTER TABLE deals ADD COLUMN IF NOT EXISTS purchaser_dl text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS purchaser_dl_state text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS purchaser_dob date;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS trade_year integer;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS trade_make text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS trade_model text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS lienholder_name text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS lienholder_address text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS lienholder_city text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS lienholder_state text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS lienholder_zip text;
