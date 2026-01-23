-- Add doc_type and deadline/cadence tracking to form_staging
-- This enables the Rules view (forms with deadlines) vs Library view (all forms)

-- Doc type categorization
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS doc_type text DEFAULT 'deal';

-- Deadline tracking (for per-transaction docs like title transfer)
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS has_deadline boolean DEFAULT false;

ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS deadline_days integer;

ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS deadline_description text;

-- Cadence tracking (for periodic filings like sales tax)
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS cadence text;

-- Comments for documentation
COMMENT ON COLUMN form_staging.doc_type IS 'Document category: deal, finance, licensing, tax, reporting';
COMMENT ON COLUMN form_staging.has_deadline IS 'True if this form has a compliance deadline';
COMMENT ON COLUMN form_staging.deadline_days IS 'Days after sale/event when form is due';
COMMENT ON COLUMN form_staging.deadline_description IS 'Human-readable deadline (e.g., "Within 30 days of sale")';
COMMENT ON COLUMN form_staging.cadence IS 'Filing frequency: per_transaction, monthly, quarterly, annually';

-- Index for faster filtering
CREATE INDEX IF NOT EXISTS idx_form_staging_doc_type ON form_staging(doc_type);
CREATE INDEX IF NOT EXISTS idx_form_staging_has_deadline ON form_staging(has_deadline);
