-- ============================================
-- FORM STAGING ENHANCEMENTS FOR 50-STATE SYSTEM
-- Adds form_number_confirmed tracking and coverage view
-- ============================================

-- 1. ADD form_number_confirmed COLUMN
ALTER TABLE form_staging
ADD COLUMN IF NOT EXISTS form_number_confirmed BOOLEAN DEFAULT false;

-- Index for finding forms that need form number
CREATE INDEX IF NOT EXISTS idx_form_staging_form_number_confirmed
ON form_staging(form_number_confirmed) WHERE form_number_confirmed = false;

-- 2. UPDATE workflow_status CONSTRAINT to include 'needs_form_number'
ALTER TABLE form_staging
DROP CONSTRAINT IF EXISTS form_staging_workflow_status_check;

ALTER TABLE form_staging
ADD CONSTRAINT form_staging_workflow_status_check
CHECK (workflow_status IN ('needs_form_number', 'needs_upload', 'staging', 'html_generated', 'mapped', 'production'));

-- 3. CREATE STATE FORM COVERAGE VIEW for admin dashboard
CREATE OR REPLACE VIEW state_form_coverage AS
SELECT
  sm.state_code,
  sm.state_name,
  sm.dmv_name,
  sm.dmv_forms_url,
  sm.forms_discovery_status,
  sm.last_discovery_at,

  -- Form counts
  COALESCE(counts.total_forms, 0) AS total_forms,
  COALESCE(counts.forms_with_number, 0) AS forms_with_confirmed_number,
  COALESCE(counts.forms_without_number, 0) AS forms_needing_number,
  COALESCE(counts.forms_with_mapping, 0) AS forms_with_mapping,
  COALESCE(counts.verified_forms, 0) AS verified_forms,
  COALESCE(counts.production_forms, 0) AS production_forms,

  -- Coverage percentage
  CASE
    WHEN COALESCE(counts.total_forms, 0) = 0 THEN 0
    ELSE ROUND(COALESCE(counts.forms_with_number, 0)::numeric / counts.total_forms * 100, 1)
  END AS form_number_coverage_pct,

  CASE
    WHEN COALESCE(counts.total_forms, 0) = 0 THEN 0
    ELSE ROUND(COALESCE(counts.verified_forms, 0)::numeric / counts.total_forms * 100, 1)
  END AS verified_coverage_pct,

  -- Status summary
  CASE
    WHEN sm.forms_discovery_status = 'not_started' THEN 'Not Started'
    WHEN COALESCE(counts.total_forms, 0) = 0 THEN 'No Forms'
    WHEN COALESCE(counts.forms_without_number, 0) = 0 AND COALESCE(counts.verified_forms, 0) = COALESCE(counts.total_forms, 0) THEN 'Complete'
    WHEN COALESCE(counts.forms_with_number, 0) > 0 THEN 'Partial'
    ELSE 'Needs Form Numbers'
  END AS status_summary

FROM state_metadata sm
LEFT JOIN (
  SELECT
    state,
    COUNT(*) AS total_forms,
    COUNT(*) FILTER (WHERE form_number_confirmed = true) AS forms_with_number,
    COUNT(*) FILTER (WHERE form_number_confirmed = false OR form_number_confirmed IS NULL) AS forms_without_number,
    COUNT(*) FILTER (WHERE field_mappings IS NOT NULL AND jsonb_array_length(field_mappings) > 0) AS forms_with_mapping,
    COUNT(*) FILTER (WHERE mapping_status = 'human_verified') AS verified_forms,
    COUNT(*) FILTER (WHERE workflow_status = 'production') AS production_forms
  FROM form_staging
  GROUP BY state
) counts ON sm.state_code = counts.state
ORDER BY sm.state_code;

-- 4. UPDATE EXISTING FORMS - Mark federal forms and known form numbers as confirmed
UPDATE form_staging
SET form_number_confirmed = true
WHERE form_number IS NOT NULL
  AND form_number NOT LIKE '%-%'  -- Not a placeholder like 'UT-DEAL'
  AND form_number != 'FEDERAL';

-- Federal forms are confirmed as federal
UPDATE form_staging
SET form_number_confirmed = true,
    form_number = 'FEDERAL'
WHERE description LIKE '%(Federal Requirement)%'
  OR description LIKE '%Federal%requirement%';

-- 5. HELPER FUNCTION - Get forms needing attention for a state
CREATE OR REPLACE FUNCTION get_forms_needing_attention(p_state TEXT)
RETURNS TABLE (
  id INTEGER,
  form_name TEXT,
  form_number TEXT,
  form_number_confirmed BOOLEAN,
  workflow_status TEXT,
  mapping_status TEXT,
  issue TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    fs.id,
    fs.form_name,
    fs.form_number,
    fs.form_number_confirmed,
    fs.workflow_status,
    fs.mapping_status,
    CASE
      WHEN fs.form_number_confirmed = false OR fs.form_number_confirmed IS NULL THEN 'Needs form number'
      WHEN fs.workflow_status = 'needs_upload' THEN 'Needs PDF upload'
      WHEN fs.mapping_status = 'pending' THEN 'Needs field mapping'
      WHEN fs.mapping_status = 'ai_suggested' THEN 'Needs mapping review'
      ELSE 'OK'
    END AS issue
  FROM form_staging fs
  WHERE fs.state = p_state
    AND (
      fs.form_number_confirmed = false
      OR fs.form_number_confirmed IS NULL
      OR fs.workflow_status IN ('needs_form_number', 'needs_upload')
      OR fs.mapping_status IN ('pending', 'ai_suggested')
    )
  ORDER BY
    CASE
      WHEN fs.form_number_confirmed = false OR fs.form_number_confirmed IS NULL THEN 1
      WHEN fs.workflow_status = 'needs_upload' THEN 2
      WHEN fs.mapping_status = 'pending' THEN 3
      ELSE 4
    END,
    fs.form_name;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON COLUMN form_staging.form_number_confirmed IS 'True if form number is official/verified, false if placeholder or unknown';
COMMENT ON VIEW state_form_coverage IS 'Admin view showing form coverage status for each state';
