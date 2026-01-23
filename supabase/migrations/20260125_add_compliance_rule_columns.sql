-- Add new columns for compliance rules discovered by AI

-- Filing cadence (monthly, quarterly, annually, per_transaction)
ALTER TABLE compliance_rules
ADD COLUMN IF NOT EXISTS filing_cadence text DEFAULT 'per_transaction';

-- Human-readable deadline description
ALTER TABLE compliance_rules
ADD COLUMN IF NOT EXISTS deadline_description text;

-- Penalty description beyond just the fee amount
ALTER TABLE compliance_rules
ADD COLUMN IF NOT EXISTS penalty_description text;

-- Days before deadline to send reminder
ALTER TABLE compliance_rules
ADD COLUMN IF NOT EXISTS reminder_days_before integer DEFAULT 7;

-- Track if rule was discovered by AI
ALTER TABLE compliance_rules
ADD COLUMN IF NOT EXISTS ai_discovered boolean DEFAULT false;

-- Required forms as JSONB array (if not already text[])
-- This allows linking rules to specific forms
ALTER TABLE compliance_rules
ADD COLUMN IF NOT EXISTS required_forms jsonb DEFAULT '[]'::jsonb;

-- Add comments for documentation
COMMENT ON COLUMN compliance_rules.filing_cadence IS 'Filing frequency: daily, weekly, monthly, quarterly, annually, per_transaction';
COMMENT ON COLUMN compliance_rules.deadline_description IS 'Human-readable deadline (e.g., "Due by 25th of following month")';
COMMENT ON COLUMN compliance_rules.penalty_description IS 'Description of penalties for non-compliance';
COMMENT ON COLUMN compliance_rules.reminder_days_before IS 'Days before deadline to trigger reminder notification';
COMMENT ON COLUMN compliance_rules.ai_discovered IS 'Whether this rule was discovered by AI analysis';
COMMENT ON COLUMN compliance_rules.required_forms IS 'JSON array of form numbers required for this compliance rule';

-- Index for faster queries by state and cadence
CREATE INDEX IF NOT EXISTS idx_compliance_rules_state_cadence
ON compliance_rules(state, filing_cadence);
