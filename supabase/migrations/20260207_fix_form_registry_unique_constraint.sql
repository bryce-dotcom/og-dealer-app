-- Fix unique constraint to include dealer_id
-- This allows same form for different dealers or global (null dealer_id)

-- Drop old constraint
DROP INDEX IF EXISTS idx_form_registry_unique_form;

-- Create new constraint that includes dealer_id
-- Using COALESCE to handle null dealer_id (global forms)
CREATE UNIQUE INDEX idx_form_registry_unique_form
ON form_registry(state, form_name, COALESCE(dealer_id, 0));

-- Also clean up any existing duplicate forms
-- Keep only forms with null dealer_id (global forms) for now
DELETE FROM form_registry a
USING form_registry b
WHERE a.id > b.id
  AND a.state = b.state
  AND a.form_name = b.form_name;
