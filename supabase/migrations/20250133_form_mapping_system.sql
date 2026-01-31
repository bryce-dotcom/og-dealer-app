-- ============================================
-- FORM MAPPING SYSTEM FOR 50-STATE SCALABILITY
-- ============================================

-- 1. UNIVERSAL FIELDS TABLE
-- Master list of all data fields used across ALL forms
-- ============================================

CREATE TABLE IF NOT EXISTS universal_fields (
  id SERIAL PRIMARY KEY,
  field_key TEXT UNIQUE NOT NULL,
  field_label TEXT NOT NULL,
  field_type TEXT NOT NULL,
  category TEXT NOT NULL,
  source_table TEXT,
  source_column TEXT,
  description TEXT,
  format_hint TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add constraint for field types (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'universal_fields_type_check'
    ) THEN
        ALTER TABLE universal_fields
        ADD CONSTRAINT universal_fields_type_check
        CHECK (field_type IN ('text', 'number', 'currency', 'date', 'phone', 'email', 'address', 'ssn', 'ein', 'vin', 'boolean', 'select'));
    END IF;
END $$;

-- Add constraint for categories (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'universal_fields_category_check'
    ) THEN
        ALTER TABLE universal_fields
        ADD CONSTRAINT universal_fields_category_check
        CHECK (category IN ('buyer', 'co_buyer', 'dealer', 'vehicle', 'deal', 'financing', 'trade', 'lien', 'insurance', 'other'));
    END IF;
END $$;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_universal_fields_category ON universal_fields(category);
CREATE INDEX IF NOT EXISTS idx_universal_fields_source ON universal_fields(source_table);

-- ============================================
-- INSERT ALL UNIVERSAL FIELDS
-- ============================================

INSERT INTO universal_fields (field_key, field_label, field_type, category, source_table, source_column, description, format_hint) VALUES

-- BUYER FIELDS (Primary Purchaser)
('buyer_name', 'Buyer Full Name', 'text', 'buyer', 'customers', 'name', 'Full legal name of primary buyer', NULL),
('buyer_first_name', 'Buyer First Name', 'text', 'buyer', 'customers', 'first_name', 'First name only', NULL),
('buyer_last_name', 'Buyer Last Name', 'text', 'buyer', 'customers', 'last_name', 'Last name only', NULL),
('buyer_address', 'Buyer Street Address', 'address', 'buyer', 'customers', 'address', 'Street address line 1', NULL),
('buyer_address2', 'Buyer Address Line 2', 'text', 'buyer', 'customers', 'address2', 'Apt, Suite, Unit', NULL),
('buyer_city', 'Buyer City', 'text', 'buyer', 'customers', 'city', 'City name', NULL),
('buyer_state', 'Buyer State', 'text', 'buyer', 'customers', 'state', 'State abbreviation', 'XX'),
('buyer_zip', 'Buyer ZIP Code', 'text', 'buyer', 'customers', 'zip', 'ZIP or ZIP+4', '#####'),
('buyer_county', 'Buyer County', 'text', 'buyer', 'customers', 'county', 'County name', NULL),
('buyer_phone', 'Buyer Phone', 'phone', 'buyer', 'customers', 'phone', 'Primary phone number', '(###) ###-####'),
('buyer_phone_alt', 'Buyer Alt Phone', 'phone', 'buyer', 'customers', 'phone_alt', 'Secondary phone', '(###) ###-####'),
('buyer_email', 'Buyer Email', 'email', 'buyer', 'customers', 'email', 'Email address', NULL),
('buyer_dl_number', 'Buyer DL Number', 'text', 'buyer', 'customers', 'dl_number', 'Driver license number', NULL),
('buyer_dl_state', 'Buyer DL State', 'text', 'buyer', 'customers', 'dl_state', 'DL issuing state', 'XX'),
('buyer_dl_exp', 'Buyer DL Expiration', 'date', 'buyer', 'customers', 'dl_exp', 'DL expiration date', 'MM/DD/YYYY'),
('buyer_dob', 'Buyer Date of Birth', 'date', 'buyer', 'customers', 'dob', 'Date of birth', 'MM/DD/YYYY'),
('buyer_ssn', 'Buyer SSN', 'ssn', 'buyer', 'customers', 'ssn', 'Social Security Number', '###-##-####'),
('buyer_ssn_last4', 'Buyer SSN Last 4', 'text', 'buyer', 'customers', 'ssn', 'Last 4 digits of SSN', '####'),
('buyer_employer', 'Buyer Employer', 'text', 'buyer', 'customers', 'employer', 'Employer name', NULL),
('buyer_employer_phone', 'Buyer Employer Phone', 'phone', 'buyer', 'customers', 'employer_phone', 'Work phone', '(###) ###-####'),
('buyer_income', 'Buyer Monthly Income', 'currency', 'buyer', 'customers', 'monthly_income', 'Monthly gross income', '$#,###.##'),
('buyer_signature', 'Buyer Signature', 'text', 'buyer', NULL, NULL, 'Signature field placeholder', NULL),
('buyer_signature_date', 'Buyer Signature Date', 'date', 'buyer', NULL, NULL, 'Date buyer signed', 'MM/DD/YYYY'),

-- CO-BUYER FIELDS
('co_buyer_name', 'Co-Buyer Full Name', 'text', 'co_buyer', 'customers', 'co_buyer_name', 'Full legal name of co-buyer', NULL),
('co_buyer_first_name', 'Co-Buyer First Name', 'text', 'co_buyer', 'customers', 'co_buyer_first_name', 'First name only', NULL),
('co_buyer_last_name', 'Co-Buyer Last Name', 'text', 'co_buyer', 'customers', 'co_buyer_last_name', 'Last name only', NULL),
('co_buyer_address', 'Co-Buyer Street Address', 'address', 'co_buyer', 'customers', 'co_buyer_address', 'Street address', NULL),
('co_buyer_city', 'Co-Buyer City', 'text', 'co_buyer', 'customers', 'co_buyer_city', 'City name', NULL),
('co_buyer_state', 'Co-Buyer State', 'text', 'co_buyer', 'customers', 'co_buyer_state', 'State abbreviation', 'XX'),
('co_buyer_zip', 'Co-Buyer ZIP Code', 'text', 'co_buyer', 'customers', 'co_buyer_zip', 'ZIP code', '#####'),
('co_buyer_phone', 'Co-Buyer Phone', 'phone', 'co_buyer', 'customers', 'co_buyer_phone', 'Phone number', '(###) ###-####'),
('co_buyer_dl_number', 'Co-Buyer DL Number', 'text', 'co_buyer', 'customers', 'co_buyer_dl_number', 'Driver license number', NULL),
('co_buyer_dl_state', 'Co-Buyer DL State', 'text', 'co_buyer', 'customers', 'co_buyer_dl_state', 'DL issuing state', 'XX'),
('co_buyer_dob', 'Co-Buyer Date of Birth', 'date', 'co_buyer', 'customers', 'co_buyer_dob', 'Date of birth', 'MM/DD/YYYY'),
('co_buyer_ssn', 'Co-Buyer SSN', 'ssn', 'co_buyer', 'customers', 'co_buyer_ssn', 'Social Security Number', '###-##-####'),
('co_buyer_signature', 'Co-Buyer Signature', 'text', 'co_buyer', NULL, NULL, 'Signature field placeholder', NULL),
('co_buyer_signature_date', 'Co-Buyer Signature Date', 'date', 'co_buyer', NULL, NULL, 'Date co-buyer signed', 'MM/DD/YYYY'),

-- DEALER FIELDS
('dealer_name', 'Dealer Name', 'text', 'dealer', 'dealer_settings', 'dealer_name', 'Dealership business name', NULL),
('dealer_dba', 'Dealer DBA', 'text', 'dealer', 'dealer_settings', 'dba', 'Doing business as name', NULL),
('dealer_address', 'Dealer Street Address', 'address', 'dealer', 'dealer_settings', 'address', 'Business street address', NULL),
('dealer_city', 'Dealer City', 'text', 'dealer', 'dealer_settings', 'city', 'City', NULL),
('dealer_state', 'Dealer State', 'text', 'dealer', 'dealer_settings', 'state', 'State abbreviation', 'XX'),
('dealer_zip', 'Dealer ZIP Code', 'text', 'dealer', 'dealer_settings', 'zip', 'ZIP code', '#####'),
('dealer_county', 'Dealer County', 'text', 'dealer', 'dealer_settings', 'county', 'County name', NULL),
('dealer_phone', 'Dealer Phone', 'phone', 'dealer', 'dealer_settings', 'phone', 'Business phone', '(###) ###-####'),
('dealer_fax', 'Dealer Fax', 'phone', 'dealer', 'dealer_settings', 'fax', 'Fax number', '(###) ###-####'),
('dealer_email', 'Dealer Email', 'email', 'dealer', 'dealer_settings', 'email', 'Business email', NULL),
('dealer_license', 'Dealer License #', 'text', 'dealer', 'dealer_settings', 'dealer_license', 'State dealer license number', NULL),
('dealer_ein', 'Dealer EIN', 'ein', 'dealer', 'dealer_settings', 'ein', 'Employer ID Number', '##-#######'),
('dealer_sales_tax_id', 'Dealer Sales Tax ID', 'text', 'dealer', 'dealer_settings', 'sales_tax_id', 'State sales tax number', NULL),
('dealer_signature', 'Dealer Signature', 'text', 'dealer', NULL, NULL, 'Authorized signature', NULL),
('dealer_signature_date', 'Dealer Signature Date', 'date', 'dealer', NULL, NULL, 'Date dealer signed', 'MM/DD/YYYY'),
('salesperson_name', 'Salesperson Name', 'text', 'dealer', 'deals', 'salesperson', 'Sales rep name', NULL),
('salesperson_number', 'Salesperson Number', 'text', 'dealer', 'deals', 'salesperson_id', 'Sales rep ID/number', NULL),

-- VEHICLE FIELDS (Sold Vehicle)
('vehicle_year', 'Vehicle Year', 'number', 'vehicle', 'inventory', 'year', 'Model year', '####'),
('vehicle_make', 'Vehicle Make', 'text', 'vehicle', 'inventory', 'make', 'Manufacturer', NULL),
('vehicle_model', 'Vehicle Model', 'text', 'vehicle', 'inventory', 'model', 'Model name', NULL),
('vehicle_trim', 'Vehicle Trim', 'text', 'vehicle', 'inventory', 'trim', 'Trim level', NULL),
('vehicle_body', 'Vehicle Body Style', 'text', 'vehicle', 'inventory', 'body_style', 'Body type (Sedan, SUV, etc)', NULL),
('vehicle_vin', 'Vehicle VIN', 'vin', 'vehicle', 'inventory', 'vin', 'Vehicle Identification Number', NULL),
('vehicle_stock', 'Stock Number', 'text', 'vehicle', 'inventory', 'stock_number', 'Dealer stock number', NULL),
('vehicle_miles', 'Odometer Reading', 'number', 'vehicle', 'inventory', 'miles', 'Current mileage', '#,###'),
('vehicle_miles_exempt', 'Odometer Exempt', 'boolean', 'vehicle', 'inventory', 'miles_exempt', 'Odometer exempt (10+ years old)', NULL),
('vehicle_miles_exceeds', 'Odometer Exceeds', 'boolean', 'vehicle', 'inventory', 'miles_exceeds', 'Actual mileage exceeds mechanical limits', NULL),
('vehicle_miles_not_actual', 'Odometer Not Actual', 'boolean', 'vehicle', 'inventory', 'miles_not_actual', 'Odometer discrepancy exists', NULL),
('vehicle_color', 'Exterior Color', 'text', 'vehicle', 'inventory', 'exterior_color', 'Exterior color', NULL),
('vehicle_interior_color', 'Interior Color', 'text', 'vehicle', 'inventory', 'interior_color', 'Interior color', NULL),
('vehicle_engine', 'Engine', 'text', 'vehicle', 'inventory', 'engine', 'Engine description', NULL),
('vehicle_cylinders', 'Cylinders', 'number', 'vehicle', 'inventory', 'cylinders', 'Number of cylinders', NULL),
('vehicle_transmission', 'Transmission', 'text', 'vehicle', 'inventory', 'transmission', 'Transmission type', NULL),
('vehicle_drive', 'Drive Type', 'text', 'vehicle', 'inventory', 'drive_type', 'FWD, RWD, AWD, 4WD', NULL),
('vehicle_fuel', 'Fuel Type', 'text', 'vehicle', 'inventory', 'fuel_type', 'Gas, Diesel, Electric, Hybrid', NULL),
('vehicle_title_number', 'Title Number', 'text', 'vehicle', 'inventory', 'title_number', 'Current title number', NULL),
('vehicle_title_state', 'Title State', 'text', 'vehicle', 'inventory', 'title_state', 'State that issued title', 'XX'),
('vehicle_plate', 'License Plate', 'text', 'vehicle', 'inventory', 'plate_number', 'Current plate number', NULL),
('vehicle_weight', 'Vehicle Weight', 'number', 'vehicle', 'inventory', 'weight', 'Gross vehicle weight', '#,###'),
('vehicle_new_used', 'New/Used', 'select', 'vehicle', 'inventory', 'condition', 'New or Used', NULL),
('vehicle_warranty', 'Warranty Status', 'select', 'vehicle', 'deals', 'warranty_type', 'As-Is, Limited, Full', NULL),

-- DEAL FIELDS (Transaction Details)
('sale_date', 'Date of Sale', 'date', 'deal', 'deals', 'sale_date', 'Transaction date', 'MM/DD/YYYY'),
('delivery_date', 'Delivery Date', 'date', 'deal', 'deals', 'delivery_date', 'Vehicle delivery date', 'MM/DD/YYYY'),
('deal_number', 'Deal Number', 'text', 'deal', 'deals', 'deal_number', 'Internal deal/contract number', NULL),
('sale_price', 'Cash Price / Sale Price', 'currency', 'deal', 'deals', 'sale_price', 'Agreed vehicle price', '$#,###.##'),
('msrp', 'MSRP / Sticker Price', 'currency', 'deal', 'inventory', 'msrp', 'Manufacturer suggested price', '$#,###.##'),
('trade_allowance', 'Trade-In Allowance', 'currency', 'deal', 'deals', 'trade_allowance', 'Value given for trade', '$#,###.##'),
('trade_payoff', 'Trade Payoff Amount', 'currency', 'deal', 'deals', 'trade_payoff', 'Payoff on trade lien', '$#,###.##'),
('net_trade', 'Net Trade-In', 'currency', 'deal', 'deals', 'net_trade', 'Trade allowance minus payoff', '$#,###.##'),
('down_payment', 'Down Payment', 'currency', 'deal', 'deals', 'down_payment', 'Cash down payment', '$#,###.##'),
('rebate', 'Rebate Amount', 'currency', 'deal', 'deals', 'rebate', 'Manufacturer rebate', '$#,###.##'),
('doc_fee', 'Documentary Fee', 'currency', 'deal', 'deals', 'doc_fee', 'Document preparation fee', '$###.##'),
('title_fee', 'Title Fee', 'currency', 'deal', 'deals', 'title_fee', 'Title transfer fee', '$###.##'),
('registration_fee', 'Registration Fee', 'currency', 'deal', 'deals', 'registration_fee', 'Registration/plate fee', '$###.##'),
('smog_fee', 'Smog/Emissions Fee', 'currency', 'deal', 'deals', 'smog_fee', 'Emissions certification fee', '$###.##'),
('other_fees', 'Other Fees', 'currency', 'deal', 'deals', 'other_fees', 'Miscellaneous fees', '$###.##'),
('other_fees_desc', 'Other Fees Description', 'text', 'deal', 'deals', 'other_fees_desc', 'Description of other fees', NULL),
('total_fees', 'Total Fees', 'currency', 'deal', 'deals', 'total_fees', 'Sum of all fees', '$#,###.##'),
('subtotal', 'Subtotal', 'currency', 'deal', 'deals', 'subtotal', 'Price + fees before tax', '$#,###.##'),
('tax_rate', 'Tax Rate', 'number', 'deal', 'deals', 'tax_rate', 'Sales tax percentage', '#.###%'),
('tax_amount', 'Sales Tax', 'currency', 'deal', 'deals', 'tax_amount', 'Calculated sales tax', '$#,###.##'),
('total_price', 'Total Cash Price', 'currency', 'deal', 'deals', 'total_price', 'Total including tax', '$#,###.##'),
('amount_financed', 'Amount Financed', 'currency', 'deal', 'deals', 'amount_financed', 'Total - down payment - trade', '$#,###.##'),
('balance_due', 'Balance Due at Signing', 'currency', 'deal', 'deals', 'balance_due', 'Amount due at delivery', '$#,###.##'),

-- FINANCING FIELDS (BHPH / Loan Terms)
('apr', 'Annual Percentage Rate', 'number', 'financing', 'bhph_loans', 'apr', 'Interest rate (APR)', '#.##%'),
('term_months', 'Term (Months)', 'number', 'financing', 'bhph_loans', 'term_months', 'Loan duration in months', '##'),
('monthly_payment', 'Monthly Payment', 'currency', 'financing', 'bhph_loans', 'monthly_payment', 'Regular payment amount', '$#,###.##'),
('payment_frequency', 'Payment Frequency', 'select', 'financing', 'bhph_loans', 'payment_frequency', 'Weekly, Bi-weekly, Monthly', NULL),
('num_payments', 'Number of Payments', 'number', 'financing', 'bhph_loans', 'num_payments', 'Total scheduled payments', '###'),
('first_payment_date', 'First Payment Due', 'date', 'financing', 'bhph_loans', 'first_payment_date', 'Date of first payment', 'MM/DD/YYYY'),
('final_payment_date', 'Final Payment Due', 'date', 'financing', 'bhph_loans', 'final_payment_date', 'Maturity date', 'MM/DD/YYYY'),
('final_payment_amount', 'Final Payment Amount', 'currency', 'financing', 'bhph_loans', 'final_payment_amount', 'Last payment if different', '$#,###.##'),
('total_of_payments', 'Total of Payments', 'currency', 'financing', 'bhph_loans', 'total_of_payments', 'Sum of all scheduled payments', '$#,###.##'),
('finance_charge', 'Finance Charge', 'currency', 'financing', 'bhph_loans', 'finance_charge', 'Total interest cost', '$#,###.##'),
('total_sale_price', 'Total Sale Price', 'currency', 'financing', 'bhph_loans', 'total_sale_price', 'Amount financed + finance charge', '$#,###.##'),
('deferred_price', 'Deferred Payment Price', 'currency', 'financing', 'bhph_loans', 'deferred_price', 'Total with down payment', '$#,###.##'),
('late_fee', 'Late Charge', 'currency', 'financing', 'bhph_loans', 'late_fee', 'Fee for late payment', '$##.##'),
('late_days', 'Late After Days', 'number', 'financing', 'bhph_loans', 'late_days', 'Grace period days', '##'),
('prepayment_penalty', 'Prepayment Penalty', 'boolean', 'financing', 'bhph_loans', 'prepayment_penalty', 'Penalty for early payoff', NULL),

-- TRADE-IN VEHICLE FIELDS
('trade_year', 'Trade-In Year', 'number', 'trade', 'deals', 'trade_year', 'Trade vehicle year', '####'),
('trade_make', 'Trade-In Make', 'text', 'trade', 'deals', 'trade_make', 'Trade vehicle make', NULL),
('trade_model', 'Trade-In Model', 'text', 'trade', 'deals', 'trade_model', 'Trade vehicle model', NULL),
('trade_vin', 'Trade-In VIN', 'vin', 'trade', 'deals', 'trade_vin', 'Trade vehicle VIN', NULL),
('trade_miles', 'Trade-In Odometer', 'number', 'trade', 'deals', 'trade_miles', 'Trade vehicle mileage', '#,###'),
('trade_color', 'Trade-In Color', 'text', 'trade', 'deals', 'trade_color', 'Trade vehicle color', NULL),
('trade_title_number', 'Trade Title Number', 'text', 'trade', 'deals', 'trade_title_number', 'Trade title number', NULL),
('trade_plate', 'Trade License Plate', 'text', 'trade', 'deals', 'trade_plate', 'Trade plate number', NULL),
('trade_lienholder', 'Trade Lienholder', 'text', 'trade', 'deals', 'trade_lienholder', 'Name of lienholder on trade', NULL),
('trade_lienholder_address', 'Trade Lienholder Address', 'address', 'trade', 'deals', 'trade_lienholder_address', 'Lienholder address', NULL),
('trade_payoff_good_thru', 'Payoff Good Through', 'date', 'trade', 'deals', 'trade_payoff_date', 'Payoff quote expiration', 'MM/DD/YYYY'),

-- LIENHOLDER FIELDS (New Lien)
('lienholder_name', 'Lienholder Name', 'text', 'lien', 'bhph_loans', 'lienholder_name', 'Name on new lien', NULL),
('lienholder_address', 'Lienholder Address', 'address', 'lien', 'bhph_loans', 'lienholder_address', 'Lienholder street address', NULL),
('lienholder_city', 'Lienholder City', 'text', 'lien', 'bhph_loans', 'lienholder_city', 'City', NULL),
('lienholder_state', 'Lienholder State', 'text', 'lien', 'bhph_loans', 'lienholder_state', 'State', 'XX'),
('lienholder_zip', 'Lienholder ZIP', 'text', 'lien', 'bhph_loans', 'lienholder_zip', 'ZIP code', '#####'),
('lienholder_elt', 'Lienholder ELT Code', 'text', 'lien', 'bhph_loans', 'elt_code', 'Electronic lien code', NULL),

-- INSURANCE FIELDS
('insurance_company', 'Insurance Company', 'text', 'insurance', 'deals', 'insurance_company', 'Insurer name', NULL),
('insurance_policy', 'Policy Number', 'text', 'insurance', 'deals', 'insurance_policy', 'Policy number', NULL),
('insurance_agent', 'Insurance Agent', 'text', 'insurance', 'deals', 'insurance_agent', 'Agent name', NULL),
('insurance_phone', 'Insurance Phone', 'phone', 'insurance', 'deals', 'insurance_phone', 'Agent/company phone', '(###) ###-####'),
('insurance_exp', 'Insurance Expiration', 'date', 'insurance', 'deals', 'insurance_exp', 'Policy expiration date', 'MM/DD/YYYY')

ON CONFLICT (field_key) DO NOTHING;

-- ============================================
-- 2. ADD COLUMNS TO FORM_STAGING
-- ============================================

ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS field_mappings JSONB,
ADD COLUMN IF NOT EXISTS deal_types TEXT[],
ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS mapping_status TEXT DEFAULT 'pending';

-- Add constraint for mapping_status
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'form_staging_mapping_status_check'
    ) THEN
        ALTER TABLE form_staging
        ADD CONSTRAINT form_staging_mapping_status_check
        CHECK (mapping_status IN ('pending', 'ai_suggested', 'human_verified', 'production'));
    END IF;
END $$;

-- Index for deal type queries
CREATE INDEX IF NOT EXISTS idx_form_staging_deal_types ON form_staging USING GIN (deal_types);
CREATE INDEX IF NOT EXISTS idx_form_staging_mapping_status ON form_staging(mapping_status);
CREATE INDEX IF NOT EXISTS idx_form_staging_is_primary ON form_staging(is_primary) WHERE is_primary = true;

-- ============================================
-- 3. SHARED FORM MAPPINGS TABLE
-- Verified mappings shared across all dealers
-- ============================================

CREATE TABLE IF NOT EXISTS shared_form_mappings (
  id SERIAL PRIMARY KEY,
  state TEXT NOT NULL,
  form_name TEXT NOT NULL,
  form_number TEXT,
  field_mappings JSONB NOT NULL,
  pdf_fields_count INTEGER,
  mapped_fields_count INTEGER,
  unmapped_fields JSONB,
  verified_by_dealer_id UUID,  -- No FK constraint, dealers table may not exist
  verified_at TIMESTAMPTZ,
  verification_notes TEXT,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(state, form_name)
);

-- Indexes for shared mappings
CREATE INDEX IF NOT EXISTS idx_shared_form_mappings_state ON shared_form_mappings(state);
CREATE INDEX IF NOT EXISTS idx_shared_form_mappings_verified ON shared_form_mappings(verified_at) WHERE verified_at IS NOT NULL;

-- ============================================
-- 4. STATE FORM REQUIREMENTS TABLE
-- Which forms are required for each deal type by state
-- ============================================

CREATE TABLE IF NOT EXISTS state_form_requirements (
  id SERIAL PRIMARY KEY,
  state TEXT NOT NULL,
  deal_type TEXT NOT NULL,
  form_name TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  is_required BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 100,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(state, deal_type, form_name)
);

-- Add constraint for deal types (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'state_form_requirements_deal_type_check'
    ) THEN
        ALTER TABLE state_form_requirements
        ADD CONSTRAINT state_form_requirements_deal_type_check
        CHECK (deal_type IN ('cash', 'bhph', 'traditional', 'wholesale', 'lease'));
    END IF;
END $$;

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_state_form_requirements_lookup ON state_form_requirements(state, deal_type);

-- ============================================
-- 5. INSERT DEFAULT STATE FORM REQUIREMENTS
-- ============================================

-- Cash Deal Requirements (all states)
INSERT INTO state_form_requirements (state, deal_type, form_name, is_primary, display_order) VALUES
('*', 'cash', 'Motor Vehicle Contract of Sale', true, 1),
('*', 'cash', 'Bill of Sale', false, 2),
('*', 'cash', 'Buyers Order', false, 3),
('*', 'cash', 'FTC Buyers Guide', false, 10),
('*', 'cash', 'Odometer Disclosure Statement', false, 11),
('*', 'cash', 'As-Is No Warranty Disclosure', false, 12),
('*', 'cash', 'Title Application', false, 20),
('*', 'cash', 'Dealer Report of Sale', false, 21),
('*', 'cash', 'Vehicle Delivery Receipt', false, 30)
ON CONFLICT DO NOTHING;

-- BHPH Deal Requirements (adds financing forms)
INSERT INTO state_form_requirements (state, deal_type, form_name, is_primary, display_order) VALUES
('*', 'bhph', 'Retail Installment Contract', true, 1),
('*', 'bhph', 'Bill of Sale', false, 2),
('*', 'bhph', 'Buyers Order', false, 3),
('*', 'bhph', 'Truth in Lending Disclosure', false, 5),
('*', 'bhph', 'Security Agreement', false, 6),
('*', 'bhph', 'Payment Schedule', false, 7),
('*', 'bhph', 'FTC Buyers Guide', false, 10),
('*', 'bhph', 'Odometer Disclosure Statement', false, 11),
('*', 'bhph', 'As-Is No Warranty Disclosure', false, 12),
('*', 'bhph', 'Title Application', false, 20),
('*', 'bhph', 'Power of Attorney for Title', false, 21),
('*', 'bhph', 'Dealer Report of Sale', false, 22),
('*', 'bhph', 'Privacy Notice', false, 25),
('*', 'bhph', 'Arbitration Agreement', false, 26),
('*', 'bhph', 'Vehicle Delivery Receipt', false, 30),
('*', 'bhph', 'GAP Waiver Agreement', false, 35),
('*', 'bhph', 'Credit Application', false, 40)
ON CONFLICT DO NOTHING;

-- Traditional (Bank) Financing
INSERT INTO state_form_requirements (state, deal_type, form_name, is_primary, display_order) VALUES
('*', 'traditional', 'Motor Vehicle Contract of Sale', true, 1),
('*', 'traditional', 'Bill of Sale', false, 2),
('*', 'traditional', 'Buyers Order', false, 3),
('*', 'traditional', 'Credit Application', false, 5),
('*', 'traditional', 'FTC Buyers Guide', false, 10),
('*', 'traditional', 'Odometer Disclosure Statement', false, 11),
('*', 'traditional', 'Title Application', false, 20),
('*', 'traditional', 'Dealer Report of Sale', false, 21),
('*', 'traditional', 'Vehicle Delivery Receipt', false, 30),
('*', 'traditional', 'Privacy Notice', false, 35)
ON CONFLICT DO NOTHING;

-- Wholesale (Dealer-to-Dealer)
INSERT INTO state_form_requirements (state, deal_type, form_name, is_primary, display_order) VALUES
('*', 'wholesale', 'Dealer Bill of Sale', true, 1),
('*', 'wholesale', 'Odometer Disclosure Statement', false, 10),
('*', 'wholesale', 'Power of Attorney for Title', false, 20),
('*', 'wholesale', 'Resale Certificate', false, 30)
ON CONFLICT DO NOTHING;

-- ============================================
-- 6. HELPER FUNCTIONS
-- ============================================

-- Function to get forms needed for a deal type in a state
CREATE OR REPLACE FUNCTION get_forms_for_deal(p_state TEXT, p_deal_type TEXT)
RETURNS TABLE (
  form_name TEXT,
  is_primary BOOLEAN,
  is_required BOOLEAN,
  display_order INTEGER,
  form_staging_id INTEGER,
  has_mapping BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(sfr.form_name, sfr_default.form_name) as form_name,
    COALESCE(sfr.is_primary, sfr_default.is_primary) as is_primary,
    COALESCE(sfr.is_required, sfr_default.is_required) as is_required,
    COALESCE(sfr.display_order, sfr_default.display_order) as display_order,
    fs.id as form_staging_id,
    (fs.field_mappings IS NOT NULL AND jsonb_array_length(fs.field_mappings) > 0) as has_mapping
  FROM state_form_requirements sfr_default
  LEFT JOIN state_form_requirements sfr
    ON sfr.state = p_state
    AND sfr.deal_type = p_deal_type
    AND sfr.form_name = sfr_default.form_name
  LEFT JOIN form_staging fs
    ON fs.state = p_state
    AND fs.form_name = COALESCE(sfr.form_name, sfr_default.form_name)
  WHERE sfr_default.state = '*'
    AND sfr_default.deal_type = p_deal_type
  ORDER BY COALESCE(sfr.display_order, sfr_default.display_order);
END;
$$ LANGUAGE plpgsql;

-- Function to increment shared mapping usage
CREATE OR REPLACE FUNCTION use_shared_mapping(p_state TEXT, p_form_name TEXT)
RETURNS JSONB AS $$
DECLARE
  mapping JSONB;
BEGIN
  UPDATE shared_form_mappings
  SET usage_count = usage_count + 1,
      last_used_at = NOW()
  WHERE state = p_state AND form_name = p_form_name
  RETURNING field_mappings INTO mapping;

  RETURN mapping;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE universal_fields IS 'Master list of all data fields used across all forms in OGDealer';
COMMENT ON TABLE shared_form_mappings IS 'Verified PDF field mappings shared across all dealers - reduces duplicate work';
COMMENT ON TABLE state_form_requirements IS 'Which forms are required for each deal type by state (* = all states)';
COMMENT ON COLUMN form_staging.field_mappings IS 'Array of {universal_field, pdf_field, page, coordinates} objects';
COMMENT ON COLUMN form_staging.deal_types IS 'Which deal types use this form: cash, bhph, traditional, wholesale';
COMMENT ON COLUMN form_staging.is_primary IS 'True if this is the main contract for a deal type';
COMMENT ON COLUMN form_staging.mapping_status IS 'Mapping workflow: pending -> ai_suggested -> human_verified -> production';
