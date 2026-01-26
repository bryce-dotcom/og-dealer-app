-- Add missing columns to document_packages if they don't exist
ALTER TABLE document_packages ADD COLUMN IF NOT EXISTS form_ids jsonb DEFAULT '[]'::jsonb;
ALTER TABLE document_packages ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE document_packages ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Create dealer_automation_rules table if it doesn't exist
CREATE TABLE IF NOT EXISTS dealer_automation_rules (
  id bigserial PRIMARY KEY,
  dealer_id bigint NOT NULL,
  rule_type text NOT NULL,
  trigger_event text NOT NULL,
  action_type text NOT NULL,
  config jsonb DEFAULT '{}'::jsonb,
  is_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add comments
COMMENT ON TABLE dealer_automation_rules IS 'Automation rules for document generation and compliance reminders';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_dealer_automation_rules_dealer ON dealer_automation_rules(dealer_id);

-- Enable RLS
ALTER TABLE dealer_automation_rules ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for dealer_automation_rules
DROP POLICY IF EXISTS "Users can view their dealer automation rules" ON dealer_automation_rules;
CREATE POLICY "Users can view their dealer automation rules" ON dealer_automation_rules
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their dealer automation rules" ON dealer_automation_rules;
CREATE POLICY "Users can insert their dealer automation rules" ON dealer_automation_rules
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update their dealer automation rules" ON dealer_automation_rules;
CREATE POLICY "Users can update their dealer automation rules" ON dealer_automation_rules
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Users can delete their dealer automation rules" ON dealer_automation_rules;
CREATE POLICY "Users can delete their dealer automation rules" ON dealer_automation_rules
  FOR DELETE USING (true);
