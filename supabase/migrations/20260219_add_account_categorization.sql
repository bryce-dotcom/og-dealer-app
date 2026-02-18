-- Add manual account categorization for "accounting for dummies"
-- Users can specify if an account is money they OWE (liability) or money they OWN (asset)

ALTER TABLE bank_accounts
ADD COLUMN IF NOT EXISTS is_liability BOOLEAN DEFAULT NULL;

-- Add helpful comment
COMMENT ON COLUMN bank_accounts.is_liability IS 'Manual override: TRUE = money you owe (credit card, loan), FALSE = money you have (checking, savings). NULL = auto-detect from account_type';

-- Update existing credit cards to be liabilities by default
UPDATE bank_accounts
SET is_liability = TRUE
WHERE account_type IN ('credit_card', 'credit', 'loan', 'line_of_credit')
AND is_liability IS NULL;

-- Update existing checking/savings to be assets by default
UPDATE bank_accounts
SET is_liability = FALSE
WHERE account_type IN ('depository', 'checking', 'savings')
AND is_liability IS NULL;
