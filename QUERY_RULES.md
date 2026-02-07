# Supabase Query Rules

> **MANDATORY:** Follow these rules before writing or modifying ANY Supabase query in this codebase.
> Violation of these rules has caused production 400 errors. Reference `DATABASE_SCHEMA.md` for column names.

---

## Rule 1: Validate Column Names Against DATABASE_SCHEMA.md

Before using ANY column name in `.select()`, `.order()`, `.update()`, `.insert()`, or `.eq()`:

1. Open `DATABASE_SCHEMA.md`
2. Find the table section
3. Confirm the column name exists **exactly** as written (case-sensitive)
4. Confirm the column type matches your expected usage

**Why:** PostgREST returns 400 errors when selecting, ordering by, or filtering on non-existent columns. These are silent failures in dev but crash features in production.

**Known past violations:**
- `form_registry` was queried for `sort_order`, `deadline_days`, `field_mapping` - none exist
- `generated_documents` was inserted with `form_registry_id`, `file_name` - neither exists

---

## Rule 2: `.order()` Takes ONE Column Per Call

```javascript
// WRONG - treats "state, category" as a single column name
.order('state, category')

// CORRECT - chain multiple .order() calls
.order('state').order('category')
```

**Why:** Supabase `.order()` does NOT parse comma-separated column names. The string `'state, category'` is treated as one column name (including the comma and space), causing a 400 error.

---

## Rule 3: FK Joins Require Foreign Key Relationships

When using the `table(columns)` syntax in `.select()`:

```javascript
// This requires a FK: time_clock.employee_id -> employees.id
.from('time_clock').select('*, employees(name)')
```

Before adding a new FK join:
1. Confirm the FK column exists on the source table (e.g., `employee_id` on `time_clock`)
2. Confirm the FK relationship is defined in the database
3. If multiple FKs point to the same table, use `!hint` syntax to disambiguate

**Current FK joins in use (all verified):**
- `customer_vehicle_requests.customer_id -> customers.id`
- `time_clock.employee_id -> employees.id`
- `time_off_requests.employee_id -> employees.id`
- `paystubs.employee_id -> employees.id`
- `commissions.employee_id -> employees.id`
- `commissions.deal_id -> deals.id`

---

## Rule 4: Use Correct Column Names for Each Table

Several tables have similarly-named but different columns. Always verify:

| Table | Has These Columns | Does NOT Have |
|-------|------------------|---------------|
| `form_registry` | `field_mappings` (plural, jsonb) | ~~`field_mapping`~~, ~~`sort_order`~~, ~~`deadline_days`~~ |
| `form_staging` | `field_mapping` AND `field_mappings` | - |
| `form_library` | `field_mapping` AND `field_mappings` | - |
| `document_packages` | `docs` (text[]) AND `form_ids` (jsonb) | - |
| `deals` | `generated_docs` (jsonb) AND `docs_generated` (text[]) | - |
| `generated_documents` | `generated_at` AND `created_at` | ~~`file_name`~~, ~~`form_registry_id`~~ |
| `generated_documents` | `form_library_id` (uuid) | ~~`form_registry_id`~~ |

---

## Rule 5: `.single()` Throws When No Row Found

```javascript
// This throws an error if no matching row exists
.from('dealer_settings').select('*').eq('id', dealerId).single()
```

Only use `.single()` when you are certain exactly one row will match. For queries that might return zero rows, use `.maybeSingle()` or handle the array result.

---

## Rule 6: Confirm Table Existence

Before querying a table, confirm it exists in `DATABASE_SCHEMA.md`. The live database has 78 tables. Some tables referenced in dead code do NOT exist:

**Confirmed existing tables** (actively queried by frontend): `dealer_settings`, `inventory`, `employees`, `bhph_loans`, `deals`, `customers`, `bhph_payments`, `commissions`, `commission_roles`, `inventory_expenses`, `inventory_commissions`, `customer_vehicle_requests`, `time_clock`, `time_off_requests`, `employee_documents`, `payroll_runs`, `paystubs`, `bank_accounts`, `bank_transactions`, `manual_expenses`, `expense_categories`, `assets`, `liabilities`, `saved_reports`, `generated_documents`, `feedback`, `audit_log`, `promo_codes`, `message_templates`, `compliance_rules`, `state_updates`, `document_packages`, `form_staging`, `form_library`, `form_registry`

**Table NOT found in live schema:**
- `dealer_forms` (referenced in DevConsolePage.jsx:391 delete cascade)

---

## Rule 7: Insert/Update Column Validation

When inserting or updating rows, every key in the payload object must be a valid column name for that table. PostgREST behavior varies:
- In **strict mode**: unknown columns cause 400 errors
- In **default mode**: unknown columns may be silently ignored

Always validate column names regardless of mode to prevent data loss.

---

## Rule 8: Storage Bucket Names

These are the storage buckets used in the codebase:

| Bucket | Used By | Operations |
|--------|---------|------------|
| `vehicle-photos` | InventoryPage | upload, getPublicUrl |
| `employee-documents` | TeamPage | upload, getPublicUrl |
| `form-templates` | documentService | download |
| `form-pdfs` | DevConsolePage | upload, remove, getPublicUrl |
| `deal-documents` | documentService, DealsPage | upload, createSignedUrl, remove |
| `dealer-assets` | SettingsPage | upload |

Before using a new bucket name, verify it exists in Supabase Storage settings.

---

## Rule 9: Avoid Dynamic Table Names Without Validation

The DevConsolePage table browser (line 309) uses dynamic table names:
```javascript
await supabase.from(tableName).select('*').limit(200);
```

This is acceptable for dev-only tools but should never be used in user-facing code. Always use hardcoded table names in production queries.

---

## Rule 10: Check CONNECTION_AUDIT.md Before Refactoring

Before changing any query:
1. Find the query in `CONNECTION_AUDIT.md` to understand its full context
2. Check if other files query the same table with different column names
3. Ensure your change doesn't break consistency across files

---

## Quick Reference: Fix These Known Bugs

| Priority | File | Line | Current | Fix |
|----------|------|------|---------|-----|
| P0 | `src/lib/documentService.js` | 30 | `select('...field_mapping, deadline_days, sort_order')` | Remove `deadline_days, sort_order`. Change `field_mapping` to `field_mappings` |
| P0 | `src/lib/documentService.js` | 33 | `.order('sort_order')` | Remove or change to `.order('created_at')` |
| P0 | `src/lib/documentService.js` | 300-308 | `form_registry_id, file_name` | Change to `form_library_id`. Remove `file_name`. |
| P1 | `src/pages/DevConsolePage.jsx` | 276 | `.order('state, category')` | `.order('state').order('category')` |
| P2 | `src/pages/DevConsolePage.jsx` | 391 | `.from('dealer_forms').delete()` | Table may not exist - verify or remove |
