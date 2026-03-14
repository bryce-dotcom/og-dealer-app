-- Add investor portal bank info to dealer_settings
-- This is the bank account investors should send deposits to

ALTER TABLE dealer_settings
  ADD COLUMN IF NOT EXISTS investor_bank_name text,
  ADD COLUMN IF NOT EXISTS investor_bank_account_name text,
  ADD COLUMN IF NOT EXISTS investor_bank_routing text,
  ADD COLUMN IF NOT EXISTS investor_bank_account text,
  ADD COLUMN IF NOT EXISTS investor_bank_type text DEFAULT 'checking',
  ADD COLUMN IF NOT EXISTS investor_portal_enabled boolean DEFAULT false;

COMMENT ON COLUMN dealer_settings.investor_bank_name IS 'Bank name for investor deposits (e.g. Chase, Wells Fargo)';
COMMENT ON COLUMN dealer_settings.investor_bank_account_name IS 'Account holder name shown to investors';
COMMENT ON COLUMN dealer_settings.investor_bank_routing IS 'Routing number for investor deposits';
COMMENT ON COLUMN dealer_settings.investor_bank_account IS 'Account number for investor deposits';
COMMENT ON COLUMN dealer_settings.investor_portal_enabled IS 'Whether the investor portal is active for this dealer';
