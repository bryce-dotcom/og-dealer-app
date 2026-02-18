// Temporary migration runner
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabaseUrl = 'https://rlzudfinlxonpbwacxpt.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsenVkZmlubHhvbnBid2FjeHB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5OTkzOSwiZXhwIjoyMDg0MTc1OTM5fQ.lLCGtdJ7VbXGGJuK6r0Bwz0dKm4FRRQYbB8S8lFJHnU';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const migrationSQL = `
-- Create state_fee_schedules table for scalable fee discovery system
CREATE TABLE IF NOT EXISTS state_fee_schedules (
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
('UT', 'inspection', 'Safety Inspection', 'flat', 0, '{"type":"flat","amount":0}', 'Utah DMV', true)
ON CONFLICT (state, fee_type) DO NOTHING;

-- Enable RLS
ALTER TABLE state_fee_schedules ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all authenticated users to read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'state_fee_schedules' AND policyname = 'Allow authenticated read on state_fee_schedules'
  ) THEN
    CREATE POLICY "Allow authenticated read on state_fee_schedules"
    ON state_fee_schedules FOR SELECT
    TO authenticated
    USING (true);
  END IF;
END $$;

-- Policy: Allow service role to insert/update (for edge functions)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'state_fee_schedules' AND policyname = 'Allow service role full access on state_fee_schedules'
  ) THEN
    CREATE POLICY "Allow service role full access on state_fee_schedules"
    ON state_fee_schedules FOR ALL
    TO service_role
    USING (true);
  END IF;
END $$;
`;

console.log('Running migration...');

const { data, error } = await supabase.rpc('exec_sql', { query: migrationSQL });

if (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}

console.log('Migration completed successfully!');
console.log('Verifying...');

const { data: fees, error: checkError } = await supabase
  .from('state_fee_schedules')
  .select('state, fee_type, fee_name')
  .limit(10);

if (checkError) {
  console.error('Verification failed:', checkError);
} else {
  console.log(`✅ Found ${fees.length} fee schedules:`);
  fees.forEach(f => console.log(`  - ${f.state}: ${f.fee_name}`));
}
