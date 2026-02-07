# Query vs Schema Mismatches

Generated: 2026-02-06 | **ALL ISSUES RESOLVED: 2026-02-06**

> **Audit Scope:** All active `.jsx` and `.js` files imported by `App.jsx` routes + shared libs.
> Schema reference: `DATABASE_SCHEMA.md` (78 tables from live Supabase OpenAPI spec)
> See `CONNECTION_AUDIT.md` for the full query-level audit.
> See `QUERY_RULES.md` for rules to prevent future mismatches.

---

## Status: ALL RESOLVED

Every issue from this report has been either **fixed in code** or **reclassified as not a bug** after validating against the live Supabase schema (78 tables via OpenAPI endpoint).

| Category | Original | Resolved |
|----------|----------|----------|
| Critical errors (400s) | 7 reported | 4 false positives, 3 fixed |
| Additional bugs found during live validation | 3 | 3 fixed |
| Column name inconsistencies | 2 | 2 fixed |
| FK joins needing verification | 11 | 10 validated (1 removed with dead file) |
| Undocumented tables | 27 | All 78 tables now in DATABASE_SCHEMA.md |
| Order-by columns needing verification | 9 | All validated against live schema |
| Dead code files | 60+ | All deleted (21,394 lines removed) |

---

## Critical Errors - Resolution Details

### 1. `document_packages.docs` column does NOT exist
**Status: NOT A BUG** - `docs` (text[]) EXISTS in live schema alongside `form_ids` (jsonb). Original report was based on incomplete DATABASE_SCHEMA.md which only had 9 tables.

---

### 2. `form_registry` order by non-existent `sort_order` column
**Status: FIXED** in commit `ebb226a`
- Removed `.order('sort_order')`, changed to `.order('form_name')`
- File: `src/lib/documentService.js:33`

---

### 3. `form_registry` select includes non-existent columns
**Status: FIXED** in commit `ebb226a`
- Removed `field_mapping`, `deadline_days`, `sort_order` from select
- Changed to `.select('id, form_number, form_name, storage_path, field_mappings')`
- Also fixed downstream `fillPdfForm()` call to use `form.field_mappings` (plural)
- File: `src/lib/documentService.js:30`

---

### 4. `compliance_rules` order by invalid multi-column string
**Status: FIXED** in commit `ebb226a`
- Changed `.order('state, category')` to `.order('state').order('category')`
- File: `src/pages/DevConsolePage.jsx:276`

---

### 5. `form_staging.promoted_at` column does NOT exist
**Status: NOT A BUG** - `promoted_at` (timestamptz) EXISTS in live schema. Original report was based on incomplete DATABASE_SCHEMA.md.

---

### 6. `deals` column name inconsistencies
**Status: FIXED** in commit `7e3b145`
- `documentService.js` was updating `updated_at` on `deals` - column does NOT exist
- Changed to update `docs_generated_at` (which exists) and also populate `docs_generated` (text[]) with form numbers, matching DealsPage behavior
- Both `generated_docs` (jsonb) and `docs_generated` (text[]) exist and are now both populated
- File: `src/lib/documentService.js:323-328`

---

### 7. `generated_documents` order by inconsistent column names
**Status: NOT A BUG** - Both `generated_at` AND `created_at` exist on `generated_documents` in the live schema. DealsPage orders by `generated_at`, documentService orders by `created_at`. Both are valid.

---

## Additional Bugs Found During Live Validation - Resolution Details

### 8. `generated_documents` insert uses wrong columns
**Status: FIXED** in commit `ebb226a`
- Changed `form_registry_id` to `form_library_id` (correct column name)
- Removed `file_name` (column doesn't exist)
- File: `src/lib/documentService.js:300-307`

---

### 9. `generated_documents` insert missing required NOT NULL columns
**Status: FIXED** in commit `7e3b145`
- Added `state: dealer?.state || 'UT'` (NOT NULL column was missing)
- Added `dealer_id: dealerId` (useful for filtering)
- File: `src/lib/documentService.js:300-309`

---

### 10. `dealer_forms` table does not exist
**Status: FIXED** in commit `7e3b145`
- Removed `await supabase.from('dealer_forms').delete()` from dealer cascade delete
- Table does not exist in live schema (78 tables checked)
- File: `src/pages/DevConsolePage.jsx:391`

---

## High Priority Warnings - Resolution Details

### FK Joins
**Status: VALIDATED** - All 10 FK join patterns in active code use tables that have the required FK columns (`customer_id`, `employee_id`, `deal_id`). The 11th (`src/pages/index.ts`) was deleted as a misplaced edge function file.

### Undocumented Tables
**Status: RESOLVED** - `DATABASE_SCHEMA.md` now contains all 78 tables from the live Supabase OpenAPI spec, organized by category with active-query markers.

### Order-By Columns
**Status: ALL VALIDATED** against live schema. Every `.order()` column exists:
- `expense_categories.sort_order` - EXISTS
- `bank_transactions.transaction_date` - EXISTS
- `manual_expenses.expense_date` - EXISTS
- `bhph_payments.payment_date` - EXISTS
- `commission_roles.role_name` - EXISTS
- `generated_documents.generated_at` - EXISTS
- `time_clock.clock_in` - EXISTS
- `payroll_runs.pay_date` - EXISTS
- `paystubs.pay_date` - EXISTS

---

## Dead Code Cleanup
**Status: DELETED** in commit `7e3b145` (21,394 lines removed)

| Category | Count | Action |
|----------|-------|--------|
| Root `src/*.jsx` dead files | 21 files | Deleted |
| `src/pages/*.txt` stale backups | 38 files | Deleted |
| `src/pages/*.backup` stale backups | 1 file | Deleted |
| `src/pages/documentService.js` (stale duplicate) | 1 file | Deleted |
| `src/pages/store.js` (identical duplicate) | 1 file | Deleted |
| `src/pages/index.ts` (misplaced edge function) | 1 file | Deleted |
| **.env.txt** (duplicate credentials) | 1 file | Deleted |
| **Total** | **64 files, 21,394 lines** | **All deleted** |

---

## Commit History

| Commit | Description |
|--------|-------------|
| `218a209` | Add comprehensive database documentation suite (78 tables from live schema) |
| `ebb226a` | FIX: 3 confirmed Supabase query bugs (400 errors) |
| `7e3b145` | FIX: Remaining mismatch report bugs + remove 21K lines of dead code |
