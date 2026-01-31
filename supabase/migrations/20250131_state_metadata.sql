-- ============================================
-- STATE METADATA TABLE FOR 50-STATE SCALABILITY
-- Stores DMV info, tax authority, deadlines, and progress tracking
-- ============================================

-- 1. CREATE STATE METADATA TABLE
CREATE TABLE IF NOT EXISTS state_metadata (
  state_code TEXT PRIMARY KEY,
  state_name TEXT NOT NULL,

  -- DMV Information
  dmv_name TEXT,
  dmv_url TEXT,
  dmv_forms_url TEXT,

  -- Tax Authority
  tax_authority_name TEXT,
  tax_authority_url TEXT,

  -- Deadlines and Rules
  title_work_deadline_days INTEGER,
  temp_tag_validity_days INTEGER,
  sales_tax_filing TEXT, -- 'monthly', 'quarterly', 'annual'

  -- Progress Tracking
  forms_discovery_status TEXT DEFAULT 'not_started',
  forms_verified_count INTEGER DEFAULT 0,
  forms_pending_count INTEGER DEFAULT 0,
  forms_needs_form_number_count INTEGER DEFAULT 0,

  -- Timestamps
  last_discovery_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add constraint for discovery status (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'state_metadata_discovery_status_check'
    ) THEN
        ALTER TABLE state_metadata
        ADD CONSTRAINT state_metadata_discovery_status_check
        CHECK (forms_discovery_status IN ('not_started', 'in_progress', 'partial', 'complete'));
    END IF;
END $$;

-- Add constraint for sales tax filing (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'state_metadata_sales_tax_filing_check'
    ) THEN
        ALTER TABLE state_metadata
        ADD CONSTRAINT state_metadata_sales_tax_filing_check
        CHECK (sales_tax_filing IN ('monthly', 'quarterly', 'annual', 'varies') OR sales_tax_filing IS NULL);
    END IF;
END $$;

-- Index for progress queries
CREATE INDEX IF NOT EXISTS idx_state_metadata_discovery_status ON state_metadata(forms_discovery_status);

-- ============================================
-- 2. SEED ALL 50 STATES + DC
-- ============================================

INSERT INTO state_metadata (state_code, state_name, dmv_name, dmv_url, dmv_forms_url, tax_authority_name, tax_authority_url, title_work_deadline_days, temp_tag_validity_days, sales_tax_filing) VALUES
-- Tier 1 States (Full form numbers available) - High volume dealer states
('AL', 'Alabama', 'Alabama Department of Revenue - Motor Vehicle Division', 'https://revenue.alabama.gov/motor-vehicle/', 'https://revenue.alabama.gov/motor-vehicle/forms/', 'Alabama Department of Revenue', 'https://revenue.alabama.gov/', 20, 30, 'monthly'),
('AK', 'Alaska', 'Alaska Division of Motor Vehicles', 'https://doa.alaska.gov/dmv/', 'https://doa.alaska.gov/dmv/forms/', 'Alaska Department of Revenue', 'https://tax.alaska.gov/', 30, 60, NULL), -- No state sales tax
('AZ', 'Arizona', 'Arizona Department of Transportation - MVD', 'https://azdot.gov/mvd', 'https://azdot.gov/mvd/vehicle-services', 'Arizona Department of Revenue', 'https://azdor.gov/', 15, 30, 'monthly'),
('AR', 'Arkansas', 'Arkansas Department of Finance and Administration', 'https://www.dfa.arkansas.gov/motor-vehicle', 'https://www.dfa.arkansas.gov/motor-vehicle/forms/', 'Arkansas Department of Finance and Administration', 'https://www.dfa.arkansas.gov/excise-tax/', 30, 30, 'monthly'),
('CA', 'California', 'California Department of Motor Vehicles', 'https://www.dmv.ca.gov/', 'https://www.dmv.ca.gov/portal/vehicle-industry-services/', 'California Department of Tax and Fee Administration', 'https://www.cdtfa.ca.gov/', 10, 90, 'quarterly'),
('CO', 'Colorado', 'Colorado Division of Motor Vehicles', 'https://dmv.colorado.gov/', 'https://dmv.colorado.gov/dealer-forms', 'Colorado Department of Revenue', 'https://tax.colorado.gov/', 60, 60, 'monthly'),
('CT', 'Connecticut', 'Connecticut Department of Motor Vehicles', 'https://portal.ct.gov/dmv', 'https://portal.ct.gov/dmv/dealer-services/dealer-services', 'Connecticut Department of Revenue Services', 'https://portal.ct.gov/drs', 30, 60, 'monthly'),
('DE', 'Delaware', 'Delaware Division of Motor Vehicles', 'https://dmv.de.gov/', 'https://dmv.de.gov/services/vehicle_services/', 'Delaware Division of Revenue', 'https://revenue.delaware.gov/', 30, 30, NULL), -- No state sales tax
('DC', 'District of Columbia', 'DC Department of Motor Vehicles', 'https://dmv.dc.gov/', 'https://dmv.dc.gov/service/dealer-services', 'DC Office of Tax and Revenue', 'https://otr.cfo.dc.gov/', 30, 45, 'monthly'),
('FL', 'Florida', 'Florida Department of Highway Safety and Motor Vehicles', 'https://www.flhsmv.gov/', 'https://www.flhsmv.gov/motor-vehicles-tags-titles/', 'Florida Department of Revenue', 'https://floridarevenue.com/', 30, 30, 'monthly'),
('GA', 'Georgia', 'Georgia Department of Revenue - Motor Vehicle Division', 'https://dor.georgia.gov/motor-vehicles', 'https://dor.georgia.gov/motor-vehicle-forms', 'Georgia Department of Revenue', 'https://dor.georgia.gov/', 30, 30, 'monthly'),
('HI', 'Hawaii', 'Hawaii County Departments of Finance', 'https://hidot.hawaii.gov/', 'https://hidot.hawaii.gov/highways/other/motor-vehicle/', 'Hawaii Department of Taxation', 'https://tax.hawaii.gov/', 30, 30, 'monthly'),
('ID', 'Idaho', 'Idaho Transportation Department', 'https://itd.idaho.gov/dmv/', 'https://itd.idaho.gov/dmv/vehicles/', 'Idaho State Tax Commission', 'https://tax.idaho.gov/', 30, 45, 'monthly'),
('IL', 'Illinois', 'Illinois Secretary of State', 'https://www.ilsos.gov/', 'https://www.ilsos.gov/departments/vehicles/dealer_services/', 'Illinois Department of Revenue', 'https://tax.illinois.gov/', 20, 90, 'monthly'),
('IN', 'Indiana', 'Indiana Bureau of Motor Vehicles', 'https://www.in.gov/bmv/', 'https://www.in.gov/bmv/dealers/', 'Indiana Department of Revenue', 'https://www.in.gov/dor/', 31, 45, 'monthly'),
('IA', 'Iowa', 'Iowa Department of Transportation', 'https://iowadot.gov/mvd/', 'https://iowadot.gov/mvd/vehicleregistration/', 'Iowa Department of Revenue', 'https://tax.iowa.gov/', 30, 45, 'monthly'),
('KS', 'Kansas', 'Kansas Department of Revenue - Division of Vehicles', 'https://www.ksrevenue.org/dovindex.html', 'https://www.ksrevenue.org/dovforms.html', 'Kansas Department of Revenue', 'https://www.ksrevenue.org/', 60, 60, 'monthly'),
('KY', 'Kentucky', 'Kentucky Transportation Cabinet', 'https://drive.ky.gov/', 'https://drive.ky.gov/motor-vehicle-licensing/', 'Kentucky Department of Revenue', 'https://revenue.ky.gov/', 30, 30, 'monthly'),
('LA', 'Louisiana', 'Louisiana Office of Motor Vehicles', 'https://expresslane.org/', 'https://expresslane.org/forms/', 'Louisiana Department of Revenue', 'https://revenue.louisiana.gov/', 40, 30, 'monthly'),
('ME', 'Maine', 'Maine Bureau of Motor Vehicles', 'https://www.maine.gov/sos/bmv/', 'https://www.maine.gov/sos/bmv/forms/', 'Maine Revenue Services', 'https://www.maine.gov/revenue/', 30, 30, 'monthly'),
('MD', 'Maryland', 'Maryland Motor Vehicle Administration', 'https://mva.maryland.gov/', 'https://mva.maryland.gov/Pages/dealers.aspx', 'Maryland Comptroller', 'https://www.marylandtaxes.gov/', 30, 60, 'monthly'),
('MA', 'Massachusetts', 'Massachusetts Registry of Motor Vehicles', 'https://www.mass.gov/orgs/massachusetts-registry-of-motor-vehicles', 'https://www.mass.gov/lists/rmv-forms-for-dealers', 'Massachusetts Department of Revenue', 'https://www.mass.gov/orgs/massachusetts-department-of-revenue', 10, 7, 'monthly'),
('MI', 'Michigan', 'Michigan Secretary of State', 'https://www.michigan.gov/sos/', 'https://www.michigan.gov/sos/vehicle/dealers', 'Michigan Department of Treasury', 'https://www.michigan.gov/treasury/', 15, 15, 'monthly'),
('MN', 'Minnesota', 'Minnesota Driver and Vehicle Services', 'https://dps.mn.gov/divisions/dvs/', 'https://dps.mn.gov/divisions/dvs/Pages/dealers.aspx', 'Minnesota Department of Revenue', 'https://www.revenue.state.mn.us/', 10, 21, 'monthly'),
('MS', 'Mississippi', 'Mississippi Department of Revenue - Motor Vehicle Division', 'https://www.dor.ms.gov/motor-vehicle', 'https://www.dor.ms.gov/motor-vehicle/forms-motor-vehicle', 'Mississippi Department of Revenue', 'https://www.dor.ms.gov/', 30, 30, 'monthly'),
('MO', 'Missouri', 'Missouri Department of Revenue - Motor Vehicle Bureau', 'https://dor.mo.gov/motor-vehicle/', 'https://dor.mo.gov/motor-vehicle/forms/', 'Missouri Department of Revenue', 'https://dor.mo.gov/', 30, 30, 'monthly'),
('MT', 'Montana', 'Montana Motor Vehicle Division', 'https://dojmt.gov/driving/', 'https://dojmt.gov/driving/motor-vehicle-titling/', 'Montana Department of Revenue', 'https://mtrevenue.gov/', 30, 40, NULL), -- No state sales tax
('NE', 'Nebraska', 'Nebraska Department of Motor Vehicles', 'https://dmv.nebraska.gov/', 'https://dmv.nebraska.gov/dvr/forms', 'Nebraska Department of Revenue', 'https://revenue.nebraska.gov/', 30, 30, 'monthly'),
('NV', 'Nevada', 'Nevada Department of Motor Vehicles', 'https://dmv.nv.gov/', 'https://dmv.nv.gov/dealer.htm', 'Nevada Department of Taxation', 'https://tax.nv.gov/', 30, 30, 'monthly'),
('NH', 'New Hampshire', 'New Hampshire Division of Motor Vehicles', 'https://www.nh.gov/dmv/', 'https://www.nh.gov/dmv/forms/', 'New Hampshire Department of Revenue Administration', 'https://www.revenue.nh.gov/', 15, 20, NULL), -- No state sales tax
('NJ', 'New Jersey', 'New Jersey Motor Vehicle Commission', 'https://www.nj.gov/mvc/', 'https://www.nj.gov/mvc/vehicles/dealers.htm', 'New Jersey Division of Taxation', 'https://www.nj.gov/treasury/taxation/', 10, 30, 'monthly'),
('NM', 'New Mexico', 'New Mexico Motor Vehicle Division', 'https://www.mvd.newmexico.gov/', 'https://www.mvd.newmexico.gov/dealers/', 'New Mexico Taxation and Revenue Department', 'https://www.tax.newmexico.gov/', 30, 30, 'monthly'),
('NY', 'New York', 'New York Department of Motor Vehicles', 'https://dmv.ny.gov/', 'https://dmv.ny.gov/dealer-services', 'New York Department of Taxation and Finance', 'https://www.tax.ny.gov/', 10, 30, 'quarterly'),
('NC', 'North Carolina', 'North Carolina Division of Motor Vehicles', 'https://www.ncdot.gov/dmv/', 'https://www.ncdot.gov/dmv/title-registration/', 'North Carolina Department of Revenue', 'https://www.ncdor.gov/', 28, 30, 'monthly'),
('ND', 'North Dakota', 'North Dakota Department of Transportation', 'https://www.dot.nd.gov/divisions/mv/', 'https://www.dot.nd.gov/divisions/mv/forms.htm', 'North Dakota Office of State Tax Commissioner', 'https://www.tax.nd.gov/', 30, 30, 'monthly'),
('OH', 'Ohio', 'Ohio Bureau of Motor Vehicles', 'https://bmv.ohio.gov/', 'https://bmv.ohio.gov/dealer-services/', 'Ohio Department of Taxation', 'https://tax.ohio.gov/', 30, 45, 'monthly'),
('OK', 'Oklahoma', 'Oklahoma Tax Commission - Motor Vehicle Division', 'https://oklahoma.gov/tax/motor-vehicle.html', 'https://oklahoma.gov/tax/forms/motor-vehicle.html', 'Oklahoma Tax Commission', 'https://oklahoma.gov/tax/', 30, 30, 'monthly'),
('OR', 'Oregon', 'Oregon Driver and Motor Vehicle Services', 'https://www.oregon.gov/odot/dmv/', 'https://www.oregon.gov/odot/dmv/pages/dealer.aspx', 'Oregon Department of Revenue', 'https://www.oregon.gov/dor/', 30, 21, NULL), -- No state sales tax
('PA', 'Pennsylvania', 'Pennsylvania Department of Transportation', 'https://www.dmv.pa.gov/', 'https://www.dmv.pa.gov/DEALER-SERVICES/', 'Pennsylvania Department of Revenue', 'https://www.revenue.pa.gov/', 20, 90, 'monthly'),
('RI', 'Rhode Island', 'Rhode Island Division of Motor Vehicles', 'http://www.dmv.ri.gov/', 'http://www.dmv.ri.gov/registrations/', 'Rhode Island Division of Taxation', 'https://tax.ri.gov/', 30, 20, 'monthly'),
('SC', 'South Carolina', 'South Carolina Department of Motor Vehicles', 'https://scdmvonline.com/', 'https://scdmvonline.com/Vehicle-Owners/Dealers', 'South Carolina Department of Revenue', 'https://dor.sc.gov/', 45, 45, 'monthly'),
('SD', 'South Dakota', 'South Dakota Division of Motor Vehicles', 'https://dor.sd.gov/motor-vehicles/', 'https://dor.sd.gov/motor-vehicles/dealers/', 'South Dakota Department of Revenue', 'https://dor.sd.gov/', 30, 30, 'monthly'),
('TN', 'Tennessee', 'Tennessee Department of Revenue - Vehicle Services', 'https://www.tn.gov/revenue/title-and-registration.html', 'https://www.tn.gov/revenue/title-and-registration/dealers.html', 'Tennessee Department of Revenue', 'https://www.tn.gov/revenue/', 30, 30, 'monthly'),
('TX', 'Texas', 'Texas Department of Motor Vehicles', 'https://www.txdmv.gov/', 'https://www.txdmv.gov/motorists/buying-or-selling-a-vehicle', 'Texas Comptroller of Public Accounts', 'https://comptroller.texas.gov/', 30, 30, 'monthly'),
('UT', 'Utah', 'Utah Division of Motor Vehicles', 'https://dmv.utah.gov/', 'https://dmv.utah.gov/vehicles/dealers', 'Utah State Tax Commission', 'https://tax.utah.gov/', 30, 45, 'monthly'),
('VT', 'Vermont', 'Vermont Department of Motor Vehicles', 'https://dmv.vermont.gov/', 'https://dmv.vermont.gov/registrations/dealers', 'Vermont Department of Taxes', 'https://tax.vermont.gov/', 15, 60, 'quarterly'),
('VA', 'Virginia', 'Virginia Department of Motor Vehicles', 'https://www.dmv.virginia.gov/', 'https://www.dmv.virginia.gov/vehicles/dealers/', 'Virginia Department of Taxation', 'https://www.tax.virginia.gov/', 30, 30, 'monthly'),
('WA', 'Washington', 'Washington Department of Licensing', 'https://www.dol.wa.gov/', 'https://www.dol.wa.gov/vehicleregistration/vehdealer.html', 'Washington Department of Revenue', 'https://dor.wa.gov/', 45, 45, 'monthly'),
('WV', 'West Virginia', 'West Virginia Division of Motor Vehicles', 'https://transportation.wv.gov/DMV/', 'https://transportation.wv.gov/DMV/Dealers/', 'West Virginia State Tax Department', 'https://tax.wv.gov/', 30, 30, 'monthly'),
('WI', 'Wisconsin', 'Wisconsin Division of Motor Vehicles', 'https://wisconsindot.gov/Pages/dmv/dmv.aspx', 'https://wisconsindot.gov/Pages/dmv/dlr-info/dlr-info.aspx', 'Wisconsin Department of Revenue', 'https://www.revenue.wi.gov/', 15, 30, 'monthly'),
('WY', 'Wyoming', 'Wyoming Department of Transportation', 'https://www.dot.state.wy.us/', 'https://www.dot.state.wy.us/home/driver_license_records/plates_titles.html', 'Wyoming Department of Revenue', 'https://revenue.wyo.gov/', 30, 30, 'monthly')
ON CONFLICT (state_code) DO UPDATE SET
  state_name = EXCLUDED.state_name,
  dmv_name = EXCLUDED.dmv_name,
  dmv_url = EXCLUDED.dmv_url,
  dmv_forms_url = EXCLUDED.dmv_forms_url,
  tax_authority_name = EXCLUDED.tax_authority_name,
  tax_authority_url = EXCLUDED.tax_authority_url,
  title_work_deadline_days = EXCLUDED.title_work_deadline_days,
  temp_tag_validity_days = EXCLUDED.temp_tag_validity_days,
  sales_tax_filing = EXCLUDED.sales_tax_filing,
  updated_at = NOW();

-- ============================================
-- 3. HELPER FUNCTIONS
-- ============================================

-- Function to update state form counts
CREATE OR REPLACE FUNCTION update_state_form_counts(p_state TEXT)
RETURNS void AS $$
BEGIN
  UPDATE state_metadata
  SET
    forms_verified_count = (
      SELECT COUNT(*) FROM form_staging
      WHERE state = p_state AND mapping_status = 'human_verified'
    ),
    forms_pending_count = (
      SELECT COUNT(*) FROM form_staging
      WHERE state = p_state AND mapping_status IN ('pending', 'ai_suggested')
    ),
    forms_needs_form_number_count = (
      SELECT COUNT(*) FROM form_staging
      WHERE state = p_state AND form_number_confirmed = false
    ),
    updated_at = NOW()
  WHERE state_code = p_state;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update counts when form_staging changes
CREATE OR REPLACE FUNCTION trigger_update_state_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM update_state_form_counts(OLD.state);
    RETURN OLD;
  ELSE
    PERFORM update_state_form_counts(NEW.state);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_state_counts ON form_staging;
CREATE TRIGGER trg_update_state_counts
AFTER INSERT OR UPDATE OR DELETE ON form_staging
FOR EACH ROW EXECUTE FUNCTION trigger_update_state_counts();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE state_metadata IS 'Metadata for all 50 US states + DC including DMV info, tax authority, and form discovery progress';
COMMENT ON COLUMN state_metadata.forms_discovery_status IS 'Progress: not_started -> in_progress -> partial -> complete';
COMMENT ON COLUMN state_metadata.title_work_deadline_days IS 'Days dealer has to complete title work after sale';
COMMENT ON COLUMN state_metadata.temp_tag_validity_days IS 'How long temporary tags are valid';
COMMENT ON COLUMN state_metadata.sales_tax_filing IS 'Frequency of sales tax filing: monthly, quarterly, annual, or varies';
