-- Add account_status to dealer_settings for tracking beta testers, trials, etc.

ALTER TABLE dealer_settings
ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active';

-- Set current dealers to 'active' by default
UPDATE dealer_settings
SET account_status = 'active'
WHERE account_status IS NULL;

-- Add index for filtering by status
CREATE INDEX IF NOT EXISTS idx_dealer_settings_account_status
ON dealer_settings(account_status);

COMMENT ON COLUMN dealer_settings.account_status IS
'Account status: beta (beta tester), active (paying customer), trial (trial period), suspended (account suspended)';
