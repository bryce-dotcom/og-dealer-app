-- Create state_fee_schedules table for scalable fee discovery system
CREATE TABLE state_fee_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL,
  fee_type TEXT NOT NULL,
  fee_name TEXT,
  calculation_type TEXT,
  base_amount DECIMAL(10,2),
  formula JSONB,
  applies_to TEXT[],
  county_specific BOOLEAN DEFAULT false,
  source_url TEXT,
  source_agency TEXT,
  last_verified DATE,
  ai_discovered BOOLEAN DEFAULT false,
  human_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(state, fee_type)
);

-- Seed Utah fees (gold standard)
INSERT INTO state_fee_schedules (state, fee_type, fee_name, calculation_type, base_amount, formula, source_agency, human_verified) VALUES
('UT', 'registration', 'Registration Fee', 'flat', 44.00, '{"type":"flat","amount":44}', 'Utah DMV', true),
('UT', 'license', 'License Fee', 'flat', 6.00, '{"type":"flat","amount":6}', 'Utah DMV', true),
('UT', 'title', 'Title Fee', 'flat', 6.00, '{"type":"flat","amount":6}', 'Utah DMV', true),
('UT', 'property_tax', 'Age-Based Property Tax', 'age_based', null, '{"type":"age_based_percentage","base_field":"msrp","rates_by_age":{"0":0.01,"1":0.0085,"2":0.007,"3":0.0055,"4":0.004,"5":0.0025,"6+":0.001},"minimum":10}', 'Utah Tax Commission', true),
('UT', 'emissions', 'Emissions Fee', 'flat', 35.00, '{"type":"flat","amount":35}', 'Utah DMV', true),
('UT', 'waste_tire', 'Waste Tire Fee', 'flat', 1.00, '{"type":"flat","amount":1}', 'Utah DMV', true),
('UT', 'inspection', 'Safety Inspection', 'flat', 0, '{"type":"flat","amount":0}', 'Utah DMV', true);

-- Enable RLS
ALTER TABLE state_fee_schedules ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all authenticated users to read
CREATE POLICY "Allow authenticated read on state_fee_schedules"
ON state_fee_schedules FOR SELECT
TO authenticated
USING (true);

-- Policy: Allow service role to insert/update (for edge functions)
CREATE POLICY "Allow service role full access on state_fee_schedules"
ON state_fee_schedules FOR ALL
TO service_role
USING (true);
