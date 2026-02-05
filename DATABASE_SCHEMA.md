# OGDealer Database Schema

> **Last Updated:** 2026-02-05
>
> **IMPORTANT:** Reference this file before writing ANY Supabase query. Regenerate after schema changes.

## Tables Overview

| Table | Purpose |
|-------|---------|
| `form_staging` | Discovered forms in staging (pre-production) |
| `form_library` | Production-ready forms (promoted from staging) |
| `form_registry` | Master registry of state DMV forms |
| `document_packages` | Dealer-specific document package configurations |
| `state_metadata` | State DMV info, tax authority, deadlines |
| `universal_fields` | Master list of all data fields for form mapping |
| `shared_form_mappings` | Verified PDF field mappings shared across dealers |
| `state_form_requirements` | Which forms are required for each deal type by state |
| `dealer_automation_rules` | Automation rules for document generation |

---

## form_staging

Discovered forms in staging area before promotion to library.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | Primary key |
| `state` | VARCHAR(2) | NO | | State code (e.g., 'UT') |
| `form_number` | VARCHAR(50) | YES | | Official form number |
| `form_name` | VARCHAR(255) | NO | | Form name/title |
| `category` | VARCHAR(50) | YES | 'deal' | deal, title, financing, tax, disclosure, registration, compliance, other |
| `description` | TEXT | YES | | Form description |
| `source_url` | TEXT | YES | | Original source URL |
| `source_agency` | TEXT | YES | | Agency that provides the form |
| `download_url` | TEXT | YES | | Direct PDF download URL |
| `storage_bucket` | TEXT | YES | | Supabase storage bucket name |
| `storage_path` | TEXT | YES | | Path within storage bucket |
| `is_fillable` | BOOLEAN | YES | false | Has fillable form fields |
| `detected_fields` | JSONB | YES | '[]' | Array of PDF field names |
| `field_mappings` | JSONB | YES | '[]' | Array of {pdf_field, universal_field, confidence} |
| `field_mapping` | JSONB | YES | '{}' | Legacy mapping object |
| `mapping_confidence` | INTEGER | YES | 0 | Percentage mapped (0-100) |
| `mapping_status` | TEXT | YES | 'pending' | pending, ai_suggested, human_verified, production |
| `workflow_status` | TEXT | YES | 'staging' | staging, needs_upload, html_generated, mapped, production |
| `form_number_confirmed` | BOOLEAN | YES | false | Is form number verified |
| `form_type` | TEXT | YES | | title, registration, bill_of_sale, etc. |
| `deal_types` | TEXT[] | YES | | Which deal types use this form |
| `is_primary` | BOOLEAN | YES | false | Primary form for deal type |
| `status` | TEXT | YES | 'pending' | pending, approved, rejected |
| `dismissed_fields` | JSONB | YES | '{}' | Fields marked as not needed |
| `pdf_validated` | BOOLEAN | YES | false | PDF has been validated |
| `url_validated` | BOOLEAN | YES | false | URL has been validated |
| `url_validated_at` | TIMESTAMPTZ | YES | | When URL was validated |
| `url_error` | TEXT | YES | | URL validation error message |
| `analyzed_at` | TIMESTAMPTZ | YES | | When form was analyzed |
| `created_at` | TIMESTAMPTZ | YES | NOW() | Created timestamp |
| `updated_at` | TIMESTAMPTZ | YES | NOW() | Updated timestamp |

**Constraints:**
- `mapping_status` IN ('pending', 'ai_suggested', 'human_verified', 'production')
- `workflow_status` IN ('needs_form_number', 'needs_upload', 'staging', 'html_generated', 'mapped', 'production')

---

## form_library

Production-ready forms promoted from staging.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | Primary key |
| `state` | VARCHAR(2) | NO | | State code |
| `form_number` | VARCHAR(50) | YES | | Official form number |
| `form_name` | VARCHAR(255) | NO | | Form name/title |
| `category` | TEXT | YES | 'deal' | Form category |
| `description` | TEXT | YES | | Form description |
| `source_url` | TEXT | YES | | Original source URL |
| `source_agency` | TEXT | NO | | Agency that provides the form |
| `download_url` | TEXT | YES | | Direct PDF download URL |
| `storage_bucket` | TEXT | YES | | Supabase storage bucket |
| `storage_path` | TEXT | YES | | Path in storage bucket |
| `is_fillable` | BOOLEAN | YES | false | Has fillable fields |
| `detected_fields` | JSONB | YES | '[]' | Array of PDF field names |
| `field_mappings` | JSONB | YES | '[]' | Field mapping array |
| `field_mapping` | JSONB | YES | '{}' | Legacy mapping object |
| `mapping_confidence` | INTEGER | YES | 0 | Mapping percentage (0-100) |
| `mapping_status` | TEXT | YES | 'pending' | Mapping status |
| `status` | TEXT | YES | 'active' | active, inactive, deprecated |
| `is_active` | BOOLEAN | YES | true | Is form active |
| `county` | TEXT | YES | | County-specific form |
| `promoted_from` | UUID | YES | | form_staging.id this was promoted from |
| `created_at` | TIMESTAMPTZ | YES | NOW() | Created timestamp |
| `updated_at` | TIMESTAMPTZ | YES | NOW() | Updated timestamp |

---

## form_registry

Master registry of state DMV forms (alternative to form_library).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | Primary key |
| `state` | VARCHAR(2) | NO | | State code |
| `form_number` | VARCHAR(50) | YES | | Official form number |
| `form_name` | VARCHAR(255) | NO | | Form name/title |
| `category` | VARCHAR(50) | YES | 'deal' | Form category |
| `required_for` | TEXT[] | YES | | Deal types: cash, bhph, financing, wholesale, trade-in |
| `description` | TEXT | YES | | Form description |
| `source_url` | TEXT | YES | | Original source URL |
| `download_url` | TEXT | YES | | PDF download URL |
| `storage_bucket` | TEXT | YES | | Storage bucket |
| `storage_path` | TEXT | YES | | Storage path |
| `is_gov_source` | BOOLEAN | YES | false | From government source |
| `is_fillable` | BOOLEAN | YES | false | Has fillable fields |
| `detected_fields` | JSONB | YES | '[]' | PDF field names |
| `field_mappings` | JSONB | YES | '[]' | Field mappings |
| `mapping_confidence` | INTEGER | YES | 0 | Mapping percentage |
| `ai_discovered` | BOOLEAN | YES | false | Discovered by AI |
| `ai_confidence` | DECIMAL(3,2) | YES | 0 | AI confidence score |
| `status` | VARCHAR(20) | YES | 'pending' | pending, active, deprecated |
| `dealer_id` | UUID | YES | | Associated dealer |
| `last_verified_at` | TIMESTAMPTZ | YES | | Last verification date |
| `created_at` | TIMESTAMPTZ | YES | NOW() | Created timestamp |
| `updated_at` | TIMESTAMPTZ | YES | NOW() | Updated timestamp |

**Constraints:**
- `category` IN ('deal', 'title', 'financing', 'tax', 'disclosure', 'registration', 'compliance', 'other')
- `status` IN ('pending', 'active', 'deprecated')
- UNIQUE(state, form_name)

---

## document_packages

Dealer-specific document package configurations.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | gen_random_uuid() | Primary key |
| `dealer_id` | UUID | NO | | References dealer_settings.id |
| `state` | VARCHAR(2) | NO | | State code |
| `deal_type` | VARCHAR(50) | NO | | Cash, BHPH, Financing, Wholesale, Trade-In |
| `form_ids` | UUID[] | YES | | Array of form_registry/form_library IDs |
| `is_default` | BOOLEAN | YES | false | Is default package |
| `created_at` | TIMESTAMPTZ | YES | NOW() | Created timestamp |
| `updated_at` | TIMESTAMPTZ | YES | NOW() | Updated timestamp |

**Constraints:**
- `deal_type` IN ('Cash', 'BHPH', 'Financing', 'Wholesale', 'Trade-In')

---

## state_metadata

Metadata for all 50 US states + DC.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `state_code` | TEXT | NO | | Primary key (e.g., 'UT') |
| `state_name` | TEXT | NO | | Full state name |
| `dmv_name` | TEXT | YES | | DMV agency name |
| `dmv_url` | TEXT | YES | | DMV website URL |
| `dmv_forms_url` | TEXT | YES | | DMV forms page URL |
| `tax_authority_name` | TEXT | YES | | Tax authority name |
| `tax_authority_url` | TEXT | YES | | Tax authority URL |
| `title_work_deadline_days` | INTEGER | YES | | Days to complete title work |
| `temp_tag_validity_days` | INTEGER | YES | | Temp tag validity in days |
| `sales_tax_filing` | TEXT | YES | | monthly, quarterly, annual, varies |
| `forms_discovery_status` | TEXT | YES | 'not_started' | not_started, in_progress, partial, complete |
| `forms_verified_count` | INTEGER | YES | 0 | Count of verified forms |
| `forms_pending_count` | INTEGER | YES | 0 | Count of pending forms |
| `forms_needs_form_number_count` | INTEGER | YES | 0 | Forms needing form numbers |
| `last_discovery_at` | TIMESTAMPTZ | YES | | Last discovery run |
| `created_at` | TIMESTAMPTZ | YES | NOW() | Created timestamp |
| `updated_at` | TIMESTAMPTZ | YES | NOW() | Updated timestamp |

---

## universal_fields

Master list of all data fields used across forms.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | SERIAL | NO | | Primary key |
| `field_key` | TEXT | NO | | Unique field identifier (e.g., 'buyer_name') |
| `field_label` | TEXT | NO | | Human-readable label |
| `field_type` | TEXT | NO | | text, number, currency, date, phone, email, address, ssn, ein, vin, boolean, select |
| `category` | TEXT | NO | | buyer, co_buyer, dealer, vehicle, deal, financing, trade, lien, insurance, other |
| `source_table` | TEXT | YES | | Source database table |
| `source_column` | TEXT | YES | | Source column name |
| `description` | TEXT | YES | | Field description |
| `format_hint` | TEXT | YES | | Format pattern (e.g., '###-##-####') |
| `created_at` | TIMESTAMPTZ | YES | NOW() | Created timestamp |

**Constraints:**
- UNIQUE(field_key)
- `field_type` IN ('text', 'number', 'currency', 'date', 'phone', 'email', 'address', 'ssn', 'ein', 'vin', 'boolean', 'select')
- `category` IN ('buyer', 'co_buyer', 'dealer', 'vehicle', 'deal', 'financing', 'trade', 'lien', 'insurance', 'other')

---

## shared_form_mappings

Verified PDF field mappings shared across dealers.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | SERIAL | NO | | Primary key |
| `state` | TEXT | NO | | State code |
| `form_name` | TEXT | NO | | Form name |
| `form_number` | TEXT | YES | | Form number |
| `field_mappings` | JSONB | NO | | Verified field mappings |
| `pdf_fields_count` | INTEGER | YES | | Total PDF fields |
| `mapped_fields_count` | INTEGER | YES | | Mapped fields count |
| `unmapped_fields` | JSONB | YES | | Unmapped field list |
| `verified_by_dealer_id` | UUID | YES | | Dealer who verified |
| `verified_at` | TIMESTAMPTZ | YES | | Verification timestamp |
| `verification_notes` | TEXT | YES | | Notes on verification |
| `usage_count` | INTEGER | YES | 0 | Times mapping was used |
| `last_used_at` | TIMESTAMPTZ | YES | | Last usage timestamp |
| `created_at` | TIMESTAMPTZ | YES | NOW() | Created timestamp |
| `updated_at` | TIMESTAMPTZ | YES | NOW() | Updated timestamp |

**Constraints:**
- UNIQUE(state, form_name)

---

## state_form_requirements

Which forms are required for each deal type by state.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | SERIAL | NO | | Primary key |
| `state` | TEXT | NO | | State code (* = all states) |
| `deal_type` | TEXT | NO | | cash, bhph, traditional, wholesale, lease |
| `form_name` | TEXT | NO | | Form name |
| `is_primary` | BOOLEAN | YES | false | Primary form for deal type |
| `is_required` | BOOLEAN | YES | true | Is form required |
| `display_order` | INTEGER | YES | 100 | Sort order |
| `notes` | TEXT | YES | | Notes |
| `created_at` | TIMESTAMPTZ | YES | NOW() | Created timestamp |

**Constraints:**
- UNIQUE(state, deal_type, form_name)
- `deal_type` IN ('cash', 'bhph', 'traditional', 'wholesale', 'lease')

---

## dealer_automation_rules

Automation rules for document generation and compliance reminders.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | BIGSERIAL | NO | | Primary key |
| `dealer_id` | BIGINT | NO | | Dealer ID |
| `rule_type` | TEXT | NO | | Type of rule |
| `trigger_event` | TEXT | NO | | Event that triggers rule |
| `action_type` | TEXT | NO | | Action to take |
| `config` | JSONB | YES | '{}' | Rule configuration |
| `is_enabled` | BOOLEAN | YES | true | Is rule active |
| `created_at` | TIMESTAMPTZ | YES | NOW() | Created timestamp |
| `updated_at` | TIMESTAMPTZ | YES | NOW() | Updated timestamp |

---

## Storage Buckets

| Bucket | Public | Purpose |
|--------|--------|---------|
| `form-pdfs` | Yes | PDF form templates |
| `form-templates` | Yes | Form template files |

---

## Views

### state_form_coverage
Admin view showing form coverage status for each state.

```sql
SELECT state_code, state_name, total_forms, forms_with_confirmed_number,
       forms_needing_number, forms_with_mapping, verified_forms, production_forms,
       form_number_coverage_pct, verified_coverage_pct, status_summary
FROM state_form_coverage;
```

---

## Helper Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `get_forms_for_deal` | p_state TEXT, p_deal_type TEXT | TABLE | Get forms needed for a deal type in a state |
| `get_forms_needing_attention` | p_state TEXT | TABLE | Get forms that need attention |
| `use_shared_mapping` | p_state TEXT, p_form_name TEXT | JSONB | Get and increment usage of shared mapping |
| `update_state_form_counts` | p_state TEXT | void | Update state form counts |

---

## Common Query Patterns

### Get forms for a state
```javascript
const { data, error } = await supabase
  .from('form_library')
  .select('*')
  .eq('state', 'UT')
  .eq('status', 'active');
```

### Get staging forms
```javascript
const { data, error } = await supabase
  .from('form_staging')
  .select('*')
  .eq('state', 'UT')
  .order('created_at', { ascending: false });
```

### Get document packages for dealer
```javascript
const { data, error } = await supabase
  .from('document_packages')
  .select('*')
  .eq('dealer_id', dealerId);
```

### Update form mapping
```javascript
const { error } = await supabase
  .from('form_staging')
  .update({
    field_mappings: mappings,
    mapping_confidence: confidence,
    mapping_status: 'ai_suggested',
    analyzed_at: new Date().toISOString()
  })
  .eq('id', formId);
```
