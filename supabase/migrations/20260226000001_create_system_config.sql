-- Create system_config table for storing system-wide configuration
CREATE TABLE IF NOT EXISTS system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add RLS policies (system config is admin-only)
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (we'll control access in app layer)
CREATE POLICY "Allow all operations for authenticated users" ON system_config
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Insert default credit costs
INSERT INTO system_config (key, value, description) VALUES
  ('CREDIT_COSTS',
   '{"VEHICLE_RESEARCH": 10, "DEAL_DOCTOR": 15, "MARKET_COMP_REPORT": 20, "AI_ARNIE_QUERY": 3, "VIN_DECODE": 1, "FORM_GENERATION": 5, "PLAID_SYNC": 5, "PAYROLL_RUN": 10}',
   'Credit costs for each feature type'
  )
ON CONFLICT (key) DO NOTHING;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_system_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER update_system_config_updated_at
  BEFORE UPDATE ON system_config
  FOR EACH ROW
  EXECUTE FUNCTION update_system_config_updated_at();

-- Add helpful comment
COMMENT ON TABLE system_config IS 'System-wide configuration settings (admin only)';
