-- Drop existing tables to recreate with full schema
DROP TABLE IF EXISTS dealer_compliance_tasks CASCADE;
DROP TABLE IF EXISTS form_requirements CASCADE;
DROP TABLE IF EXISTS compliance_rules CASCADE;

CREATE TABLE compliance_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL,
  rule_code TEXT,
  rule_name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  trigger_event TEXT,
  frequency TEXT,
  deadline_days INTEGER,
  deadline_day_of_month INTEGER,
  deadline_description TEXT,
  reminder_days_before INTEGER[],
  reporting_period TEXT,
  aggregation_type TEXT,
  applies_to TEXT[],
  required_form_numbers TEXT[],
  required_form_names TEXT[],
  form_template_id UUID,
  penalty_type TEXT,
  penalty_amount DECIMAL,
  penalty_percentage DECIMAL,
  penalty_description TEXT,
  source_url TEXT,
  source_agency TEXT,
  legal_citation TEXT,
  is_federal BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE form_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL,
  deal_type TEXT NOT NULL,
  form_number TEXT,
  form_name TEXT NOT NULL,
  is_required BOOLEAN DEFAULT true,
  is_federal BOOLEAN DEFAULT false,
  category TEXT,
  data_fields_needed TEXT[],
  compliance_rule_id UUID REFERENCES compliance_rules(id),
  sort_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE dealer_compliance_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id INTEGER REFERENCES dealer_settings(id),
  rule_id UUID REFERENCES compliance_rules(id),
  task_name TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  period_label TEXT,
  due_date DATE NOT NULL,
  status TEXT DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  related_deal_ids UUID[],
  transaction_count INTEGER,
  total_amount DECIMAL,
  total_tax DECIMAL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
