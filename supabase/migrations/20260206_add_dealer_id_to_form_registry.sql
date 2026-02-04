-- Add dealer_id column to form_registry for dealer-specific forms
-- This allows forms to be scoped to specific dealers
-- Note: dealer_settings.id is INTEGER, not UUID

ALTER TABLE form_registry
ADD COLUMN IF NOT EXISTS dealer_id INTEGER REFERENCES dealer_settings(id) ON DELETE CASCADE;

-- Index for dealer lookups
CREATE INDEX IF NOT EXISTS idx_form_registry_dealer_id ON form_registry(dealer_id);
CREATE INDEX IF NOT EXISTS idx_form_registry_dealer_state ON form_registry(dealer_id, state);

-- Allow null dealer_id for global/shared forms
COMMENT ON COLUMN form_registry.dealer_id IS 'Optional dealer ID - null means global form available to all dealers';
