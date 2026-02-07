# Supabase Connection Audit

> **Generated:** 2026-02-06
> **Source:** All active `.jsx` and `.js` files imported by `App.jsx` routes + shared libs.
> **Schema Reference:** `DATABASE_SCHEMA.md` (from live Supabase OpenAPI spec, 78 tables)
> **Audit Method:** Automated grep of all `.from()` calls + manual review of FK joins, `.order()`, `.select()`.

---

## Summary

| Metric | Count |
|--------|-------|
| **Active source files with queries** | 18 |
| **Total `.from()` calls** | 200+ |
| **Unique tables queried** | 36 |
| **FK joins** | 11 |
| **Storage bucket references** | 7 |
| **Confirmed bugs (will 400)** | 3 |
| **Confirmed working (validated vs live schema)** | 4 previously reported as bugs |

---

## Corrections to Prior MISMATCH_REPORT.md

Based on live schema validation, these previously reported "bugs" are **NOT bugs**:

| # | Reported Issue | Actual Status |
|---|---------------|---------------|
| 1 | `document_packages.docs` does not exist | **FALSE** - `docs` (text[]) EXISTS alongside `form_ids` (jsonb) |
| 5 | `form_staging.promoted_at` does not exist | **FALSE** - `promoted_at` (timestamptz) EXISTS |
| 6 | `deals.generated_docs` may not exist | **FALSE** - BOTH `generated_docs` (jsonb) AND `docs_generated` (text[]) exist |
| 7 | `generated_documents` order by inconsistent columns | **FALSE** - BOTH `generated_at` AND `created_at` exist |

### Confirmed Real Bugs

| # | Issue | Status |
|---|-------|--------|
| 2 | `form_registry` has no `sort_order`, `deadline_days`, or `field_mapping` column | **CONFIRMED BUG** |
| 3 | `form_registry` select includes non-existent columns | **CONFIRMED BUG** |
| 4 | `.order('state, category')` is invalid Supabase syntax | **CONFIRMED BUG** |

### Newly Discovered Bug

| Issue | File | Line | Problem |
|-------|------|------|---------|
| `generated_documents` insert uses wrong columns | `src/lib/documentService.js` | 300-308 | Inserts `form_registry_id` and `file_name` - neither exists. Live schema has `form_library_id` and no `file_name` column |

---

## Queries by File

### src/lib/store.js (Global Store)

Central data fetching for 6 core tables. Used by all pages via `useStore()`.

| Line | Table | Operation | Columns | Filters | Order |
|------|-------|-----------|---------|---------|-------|
| 43 | `dealer_settings` | SELECT | `*` | `.eq('id', dealerId).single()` | - |
| 44 | `inventory` | SELECT | `*` | `.eq('dealer_id', dealerId)` | `created_at DESC` |
| 45 | `employees` | SELECT | `*` | `.eq('dealer_id', dealerId)` | - |
| 46 | `bhph_loans` | SELECT | `*` | `.eq('dealer_id', dealerId)` | - |
| 47 | `deals` | SELECT | `*` | `.eq('dealer_id', dealerId)` | `created_at DESC` |
| 48 | `customers` | SELECT | `*` | `.eq('dealer_id', dealerId)` | - |
| 65 | `inventory` | SELECT | `*` | `.eq('dealer_id', dealerId)` | `created_at DESC` |
| 72 | `employees` | SELECT | `*` | `.eq('dealer_id', dealerId)` | - |
| 79 | `bhph_loans` | SELECT | `*` | `.eq('dealer_id', dealerId)` | - |
| 86 | `deals` | SELECT | `*` | `.eq('dealer_id', dealerId)` | `created_at DESC` |

**Status:** All queries validated against live schema. No issues.

---

### src/lib/documentService.js

Document generation service. Contains confirmed bugs.

| Line | Table | Operation | Columns | Filters | Status |
|------|-------|-----------|---------|---------|--------|
| 17 | `document_packages` | SELECT | `docs` | `.eq('dealer_id').eq('deal_type').single()` | OK - `docs` column exists (text[]) |
| 30 | `form_registry` | SELECT | `id, form_number, form_name, storage_path, field_mapping, deadline_days, sort_order` | `.or(...).not(...)` | **BUG** - `field_mapping`, `deadline_days`, `sort_order` do NOT exist |
| 33 | `form_registry` | ORDER | - | `.order('sort_order')` | **BUG** - `sort_order` does not exist, returns 400 |
| 225 | `deals` | SELECT | `*` | `.eq('id', dealId).single()` | OK |
| 234 | `inventory` | SELECT | `*` | `.eq('id', vehicleId).single()` | OK |
| 241 | `dealer_settings` | SELECT | `*` | `.eq('id', dealerId).single()` | OK |
| 250 | `customers` | SELECT | `*` | `.eq('id', customerId).single()` | OK |
| 300 | `generated_documents` | INSERT | `deal_id, form_registry_id, form_number, form_name, storage_path, file_name, generated_by` | - | **BUG** - `form_registry_id` and `file_name` don't exist. Use `form_library_id` |
| 326 | `deals` | UPDATE | `generated_docs, updated_at` | `.eq('id', dealId)` | OK - both columns exist |
| 342 | `generated_documents` | SELECT | `*` | `.eq('deal_id', dealId)` | OK |
| 342 | `generated_documents` | ORDER | - | `.order('created_at')` | OK - `created_at` exists |

**Storage Buckets:**
| Line | Bucket | Operation |
|------|--------|-----------|
| 274 | `form-templates` | download |
| 291 | `deal-documents` | upload |
| 353 | `deal-documents` | createSignedUrl |

---

### src/pages/Login.jsx

| Line | Table | Operation | Columns | Filters |
|------|-------|-----------|---------|---------|
| 32 | `dealer_settings` | SELECT | `*` | `.eq('owner_user_id', userId).single()` |
| 62 | `dealer_settings` | SELECT | `*` | `.eq('owner_user_id', userId)` |
| 131 | `dealer_settings` | SELECT | `*` | `.eq('owner_user_id', userId).single()` |

**Status:** All OK.

---

### src/pages/Dashboard.jsx

| Line | Table | Operation | Columns | Filters | FK Join |
|------|-------|-----------|---------|---------|--------|
| 25 | `customer_vehicle_requests` | SELECT | `*, customers(id,name,phone,email)` | `.eq('dealer_id', dealerId).eq('status', 'Looking')` | **FK: customer_vehicle_requests.customer_id -> customers.id** |

**Status:** FK join needs `customer_id` FK relationship to exist.

---

### src/pages/InventoryPage.jsx

| Line | Table | Operation | Columns | Filters | Order |
|------|-------|-----------|---------|---------|-------|
| 81 | `commission_roles` | SELECT | `*` | `.eq('dealer_id', dealerId)` | `role_name` |
| 90 | `inventory_expenses` | SELECT | `*` | `.eq('inventory_id', id)` | `expense_date DESC` |
| 100 | `inventory_commissions` | SELECT | `*` | `.eq('inventory_id', id)` | `created_at DESC` |
| 159 | `inventory` | UPDATE | `photos` | `.eq('id', vehicleId)` | - |
| 167 | `inventory_expenses` | INSERT | full row | - | - |
| 185 | `inventory_expenses` | DELETE | - | `.eq('id', id)` | - |
| 214 | `inventory_commissions` | INSERT | full row | - | - |
| 235 | `inventory_commissions` | DELETE | - | `.eq('id', id)` | - |
| 346 | `inventory` | UPDATE | `photos` | `.eq('id', vehicleId)` | - |
| 400 | `inventory` | UPDATE | payload | `.eq('id', vehicleId)` | - |
| 402 | `inventory` | INSERT | payload | - | - |
| 419 | `inventory` | DELETE | - | `.eq('id', id)` | - |

**Storage:** `vehicle-photos` bucket (upload, getPublicUrl)

**Status:** All validated. `commission_roles.role_name` confirmed exists.

---

### src/pages/DealsPage.jsx

| Line | Table | Operation | Columns | Filters | Notes |
|------|-------|-----------|---------|---------|-------|
| 157 | `document_packages` | SELECT | `deal_type, form_ids` | `.eq('dealer_id', dealerId)` | OK |
| 166 | `form_staging` | SELECT | `id, form_number, form_name` | `.eq('state', state).eq('status', 'approved')` | OK |
| 220 | `generated_documents` | SELECT | `*` | `.eq('deal_id', dealId)` | OK |
| 223 | `generated_documents` | ORDER | - | `.order('generated_at', { ascending: false })` | OK - `generated_at` exists |
| 486 | `deals` | UPDATE | `stage` | `.eq('id', dealId)` | OK |
| 622 | `deals` | UPDATE | full dealData | `.eq('id', dealId)` | OK |
| 627 | `deals` | INSERT | full dealData | - | OK |
| 643 | `deals` | DELETE | - | `.eq('id', dealId)` | OK |
| 656 | `deals` | UPDATE | `locked, locked_at` | `.eq('id', dealId)` | OK |
| 668 | `deals` | UPDATE | `archived, archived_at` | `.eq('id', dealId)` | OK |
| 693 | `customers` | INSERT | full row | - | OK |
| 733 | `deals` | UPDATE | `docs_generated, docs_generated_at` | `.eq('id', dealId)` | OK - both exist |
| 774 | `generated_documents` | DELETE | - | `.eq('id', docId)` | OK |
| 796 | `generated_documents` | DELETE | - | `.eq('deal_id', dealId)` | OK |

**Storage:** `deal-documents` bucket (remove)

---

### src/pages/BHPHPage.jsx

| Line | Table | Operation | Columns | Filters | Order |
|------|-------|-----------|---------|---------|-------|
| 71 | `bhph_payments` | SELECT | `*` | `.eq('loan_id', loanId)` | `payment_date DESC` |
| 90 | `bhph_payments` | INSERT | full row | - | - |
| 107 | `bhph_loans` | UPDATE | balance, status, etc. | `.eq('id', loanId)` | - |
| 141 | `bhph_loans` | INSERT/UPDATE | full row | - | - |
| 159 | `inventory` | UPDATE | `status: 'BHPH'` | `.eq('id', vehicleId)` | - |

**Status:** All validated. `bhph_payments.payment_date` confirmed exists.

---

### src/pages/CustomersPage.jsx

| Line | Table | Operation | Columns | FK Join | Filters |
|------|-------|-----------|---------|--------|---------|
| 36 | `customer_vehicle_requests` | SELECT | `*, customers(name)` | **FK: customer_id -> customers.id** | `.eq('dealer_id').eq('status', 'Looking')` |
| 41 | `customer_vehicle_requests` | SELECT | `*` | - | `.eq('customer_id', id)` |
| 50 | `customers` | INSERT | full row | - | - |
| 58 | `customer_vehicle_requests` | INSERT | full row | - | - |
| 66 | `customer_vehicle_requests` | UPDATE | `status` | - | `.eq('id', id)` |
| 73 | `customer_vehicle_requests` | DELETE | - | - | `.eq('id', id)` |

---

### src/pages/TeamPage.jsx

| Line | Table | Operation | Columns | FK Join | Filters |
|------|-------|-----------|---------|--------|---------|
| 49 | `employee_documents` | SELECT | `*` | - | `.eq('employee_id', empId)` |
| 54 | `paystubs` | SELECT | `*` | - | `.eq('employee_id', empId)` |
| 59 | `time_off_requests` | SELECT | `*, employees(name)` | **FK: employee_id -> employees.id** | `.eq('dealer_id', dealerId)` |
| 83 | `employees` | UPDATE | full row | - | `.eq('id', empId)` |
| 102 | `employees` | INSERT | full row | - | - |
| 122 | `employee_documents` | INSERT | full row | - | - |
| 152 | `time_off_requests` | INSERT | full row | - | - |

**Storage:** `employee-documents` bucket (upload, getPublicUrl)

---

### src/pages/TimeClockPage.jsx

| Line | Table | Operation | Columns | FK Join | Filters |
|------|-------|-----------|---------|--------|---------|
| 39 | `time_clock` | SELECT | `*, employees(name)` | **FK: employee_id -> employees.id** | `.eq('dealer_id', dealerId)` |
| 52 | `time_off_requests` | SELECT | `*, employees(name)` | **FK: employee_id -> employees.id** | `.eq('dealer_id', dealerId)` |
| 80 | `time_clock` | INSERT | full row | - | - |
| 101 | `employees` | UPDATE | `pto_accrued` | - | `.eq('id', empId)` |
| 105 | `time_clock` | UPDATE | `clock_out, total_hours, etc.` | - | `.eq('id', entryId)` |
| 115 | `time_clock` | UPDATE | `lunch_start` | - | `.eq('id', entryId)` |
| 122 | `time_clock` | UPDATE | `lunch_end` | - | `.eq('id', entryId)` |
| 139 | `time_off_requests` | INSERT | full row | - | - |

---

### src/pages/PayrollPage.jsx

| Line | Table | Operation | Columns | FK Join | Order |
|------|-------|-----------|---------|--------|-------|
| 58 | `time_clock` | SELECT | `*, employees(name, hourly_rate, salary, pay_type)` | **FK: employee_id -> employees.id** | `clock_in ASC` |
| 65 | `time_off_requests` | SELECT | `*, employees(name)` | **FK: employee_id -> employees.id** | `created_at DESC` |
| 71 | `payroll_runs` | SELECT | `*` | - | `pay_date DESC` |
| 77 | `paystubs` | SELECT | `*` | - | `pay_date DESC` |
| 85 | `dealer_settings` | UPDATE | `pay_frequency, pay_day, next_pay_date` | - | `.eq('id', dealerId)` |
| 199 | `payroll_runs` | INSERT | full row | - | - |
| 221 | `paystubs` | INSERT | full row | - | - |
| 237 | `payroll_runs` | UPDATE | `total_gross, total_net` | - | `.eq('id', runId)` |
| 281 | `time_off_requests` | INSERT | full row | - | - |
| 295 | `employees` | UPDATE | `pto_used` | - | `.eq('id', empId)` |
| 298 | `time_off_requests` | UPDATE | `status, approved_at` | - | `.eq('id', requestId)` |

**Status:** All validated. `payroll_runs.pay_date`, `time_clock.clock_in` confirmed exist.

---

### src/pages/BooksPage.jsx

| Line | Table | Operation | Columns | Filters | Order |
|------|-------|-----------|---------|---------|-------|
| 33 | `expense_categories` | SELECT | `*` | `.or('dealer_id.eq.X,dealer_id.is.null')` | `sort_order` |
| 34 | `bank_accounts` | SELECT | `*` | `.eq('dealer_id', dealerId)` | - |
| 35 | `bank_transactions` | SELECT | `*` | `.eq('dealer_id', dealerId)` | `transaction_date DESC` |
| 36 | `manual_expenses` | SELECT | `*` | `.eq('dealer_id', dealerId)` | `expense_date DESC` |
| 37 | `assets` | SELECT | `*` | `.eq('dealer_id').eq('status', 'active')` | - |
| 38 | `liabilities` | SELECT | `*` | `.eq('dealer_id').eq('status', 'active')` | - |
| 93 | `bank_transactions` | UPDATE | `status, category_id` | `.eq('id', txnId)` | - |
| 94 | `bank_transactions` | UPDATE | `status: 'ignored'` | `.eq('id', txnId)` | - |
| 95 | `manual_expenses` | INSERT | full row | - | - |
| 96 | `assets` | INSERT | full row | - | - |
| 97 | `liabilities` | INSERT | full row | - | - |

**Status:** All validated. `expense_categories.sort_order` confirmed exists.

---

### src/pages/ReportsPage.jsx

| Line | Table | Operation | Columns | FK Join | Filters |
|------|-------|-----------|---------|--------|---------|
| 37 | `bank_transactions` | SELECT | `*` | - | `.eq('dealer_id', dealerId)` |
| 38 | `expense_categories` | SELECT | `*` | - | `.or('dealer_id.eq.X,dealer_id.is.null')` |
| 39 | `time_clock` | SELECT | `*, employees(name)` | **FK: employee_id -> employees.id** | `.eq('dealer_id', dealerId)` |
| 40 | `paystubs` | SELECT | `*, employees(name)` | **FK: employee_id -> employees.id** | `.eq('dealer_id', dealerId)` |
| 41 | `commissions` | SELECT | `*, employees(name), deals(*)` | **FK: employee_id -> employees.id AND deal_id -> deals.id** | `.eq('dealer_id', dealerId)` |
| 42 | `saved_reports` | SELECT | `*` | - | `.eq('dealer_id', dealerId)` |
| 235 | `saved_reports` | INSERT | full row | - | - |
| 252 | `saved_reports` | DELETE | - | - | `.eq('id', id)` |

**Note:** Line 41 has a **double FK join** - requires both `commissions.employee_id -> employees.id` AND `commissions.deal_id -> deals.id`.

---

### src/pages/DocumentRulesPage.jsx

| Line | Table | Operation | Columns | Filters |
|------|-------|-----------|---------|---------|
| 73 | `form_library` | SELECT | `*` | `.eq('state', state).eq('status', 'active')` |
| 89 | `document_packages` | SELECT | `*` | `.eq('dealer_id', dealerId)` |
| 152 | `document_packages` | UPDATE | full row | `.eq('id', pkgId)` |
| 154 | `document_packages` | INSERT | full row | - |

---

### src/pages/SettingsPage.jsx

| Line | Table | Operation | Columns | Filters |
|------|-------|-----------|---------|---------|
| 84 | `dealer_settings` | UPDATE | full row | `.eq('id', dealerId)` |
| 152 | `dealer_settings` | UPDATE | `logo_url` | `.eq('id', dealerId)` |
| 179 | `dealer_settings` | UPDATE | theme/display settings | `.eq('id', dealerId)` |
| 209 | `dealer_settings` | UPDATE | various | `.eq('id', dealerId)` |
| 226 | `inventory` | SELECT | `*` | `.eq('dealer_id', dealerId)` |
| 227 | `deals` | SELECT | `*` | `.eq('dealer_id', dealerId)` |
| 228 | `customers` | SELECT | `*` | `.eq('dealer_id', dealerId)` |
| 229 | `employees` | SELECT | `*` | `.eq('dealer_id', dealerId)` |
| 230 | `bhph_loans` | SELECT | `*` | `.eq('dealer_id', dealerId)` |

**Storage:** `dealer-assets` bucket (upload), `public` bucket (createSignedUrl, getPublicUrl)

---

### src/pages/StateUpdatesPage.jsx

| Line | Table | Operation | Columns | Filters |
|------|-------|-----------|---------|---------|
| 46 | `state_updates` | SELECT | `*` | `.order('created_at', { ascending: false })` |
| 68 | `state_updates` | UPDATE | `is_read: true` | `.eq('id', id)` |
| 85 | `state_updates` | INSERT | full row | - |
| 101 | `state_updates` | DELETE | - | `.eq('id', id)` |

---

### src/pages/EmbedInventory.jsx

| Line | Table | Operation | Columns | Filters |
|------|-------|-----------|---------|---------|
| 36 | `dealer_settings` | SELECT | `dealer_name, logo_url, phone, email, state` | `.eq('id', dealerId).single()` |
| 46 | `inventory` | SELECT | `*` | `.eq('dealer_id', dealerId).eq('status', 'In Stock')` |

**Note:** Creates its own Supabase client (public embed).

---

### src/pages/EmbedFindRig.jsx

| Line | Table | Operation | Columns | Filters |
|------|-------|-----------|---------|---------|
| 42 | `dealer_settings` | SELECT | `dealer_name, logo_url, phone` | `.eq('id', dealerId).single()` |
| 149 | `customers` | INSERT | `name, phone, email, dealer_id` | - |
| 163 | `customer_vehicle_requests` | INSERT | full row | - |

**Note:** Creates its own Supabase client (public embed).

---

### src/pages/DevConsolePage.jsx

Dev-only admin console. Most queries here.

| Line | Table | Operation | Columns | Filters | Notes |
|------|-------|-----------|---------|---------|-------|
| 270 | `dealer_settings` | SELECT | `*` | `.order('id')` | OK |
| 271 | `employees` | SELECT | `*` | `.order('name')` | OK |
| 272 | `feedback` | SELECT | `*` | `.order('created_at', { ascending: false })` | OK |
| 273 | `audit_log` | SELECT | `*` | `.order('created_at', { ascending: false }).limit(100)` | OK |
| 274 | `promo_codes` | SELECT | `*` | `.order('created_at', { ascending: false })` | OK |
| 275 | `message_templates` | SELECT | `*` | `.order('name')` | OK |
| 276 | `compliance_rules` | SELECT | `*` | `.order('state, category')` | **BUG** - invalid multi-column syntax |
| 277 | `form_staging` | SELECT | `*` | `.order('created_at', { ascending: false })` | OK |
| 278 | `form_library` | SELECT | `*` | `.order('created_at', { ascending: false })` | OK |
| 309 | (dynamic) | SELECT | `*` | `.limit(200)` | Table browser |
| 342 | `audit_log` | INSERT | full row | - | OK |
| 351 | `feedback` | UPDATE | `status` | `.eq('id', id)` | OK |
| 357 | `feedback` | DELETE | - | `.eq('id', id)` | OK |
| 375 | `employees` | DELETE | - | `.eq('id', id)` | OK |
| 391 | `dealer_forms` | DELETE | - | `.eq('dealer_id', id)` | Table not in live schema! |
| 513 | `compliance_rules` | UPDATE | full ruleData | `.eq('id', ruleId)` | OK |
| 517 | `compliance_rules` | INSERT | full ruleData | - | OK |
| 533 | `compliance_rules` | DELETE | - | `.eq('id', id)` | OK |
| 590 | `form_staging` | UPDATE | storage fields | `.eq('id', formId)` | OK |
| 1050 | `form_library` | INSERT | promote payload | - | OK |
| 1058 | `form_staging` | UPDATE | `status: 'promoted'` | `.eq('id', formId)` | OK |
| 1137 | `form_staging` | DELETE | - | `.eq('id', formId)` | OK |
| 1205 | `form_staging` | INSERT | new form row | - | OK |
| 1400 | `form_staging` | INSERT | from discovery | - | OK |
| 1426 | `state_updates` | INSERT | update record | - | OK |
| 1616 | `form_staging` | DELETE | - | `.eq('state', state)` | OK (bulk) |
| 1645 | `form_library` | UPDATE | full formData | `.eq('id', formId)` | OK |
| 1670 | `form_library` | SELECT | `promoted_from` | `.eq('id', id).single()` | OK |
| 1673 | `form_library` | DELETE | - | `.eq('id', id)` | OK |
| 1677 | `form_staging` | UPDATE | `status, promoted_at` | `.eq('id', promotedFrom)` | OK - `promoted_at` exists |

**Storage:** `form-pdfs` bucket (upload, remove, getPublicUrl)

---

### src/pages/AdminDevConsole.jsx

No direct table queries. Only calls Supabase edge functions.

---

### src/pages/CommissionsPage.jsx

No direct Supabase queries. Uses `useStore()` data only.

---

### src/pages/ResearchPage.jsx

No Supabase table queries (uses external API).

---

## FK Join Summary

All FK joins in the codebase:

| File | Line | Query Pattern | FK Needed |
|------|------|---------------|-----------|
| Dashboard.jsx | 25 | `customer_vehicle_requests ... customers(id,name,phone,email)` | `customer_vehicle_requests.customer_id -> customers.id` |
| CustomersPage.jsx | 36 | `customer_vehicle_requests ... customers(name)` | `customer_vehicle_requests.customer_id -> customers.id` |
| TeamPage.jsx | 59 | `time_off_requests ... employees(name)` | `time_off_requests.employee_id -> employees.id` |
| TimeClockPage.jsx | 39 | `time_clock ... employees(name)` | `time_clock.employee_id -> employees.id` |
| TimeClockPage.jsx | 52 | `time_off_requests ... employees(name)` | `time_off_requests.employee_id -> employees.id` |
| PayrollPage.jsx | 58 | `time_clock ... employees(name, hourly_rate, salary, pay_type)` | `time_clock.employee_id -> employees.id` |
| PayrollPage.jsx | 65 | `time_off_requests ... employees(name)` | `time_off_requests.employee_id -> employees.id` |
| ReportsPage.jsx | 39 | `time_clock ... employees(name)` | `time_clock.employee_id -> employees.id` |
| ReportsPage.jsx | 40 | `paystubs ... employees(name)` | `paystubs.employee_id -> employees.id` |
| ReportsPage.jsx | 41 | `commissions ... employees(name), deals(*)` | `commissions.employee_id -> employees.id` + `commissions.deal_id -> deals.id` |

---

## Order-By Column Validation

All `.order()` calls validated against live schema:

| File | Line | Table | Order Column | Exists? |
|------|------|-------|-------------|---------|
| store.js | 44 | `inventory` | `created_at` | YES |
| store.js | 47 | `deals` | `created_at` | YES |
| BooksPage.jsx | 33 | `expense_categories` | `sort_order` | YES |
| BooksPage.jsx | 35 | `bank_transactions` | `transaction_date` | YES |
| BooksPage.jsx | 36 | `manual_expenses` | `expense_date` | YES |
| BHPHPage.jsx | 71 | `bhph_payments` | `payment_date` | YES |
| InventoryPage.jsx | 81 | `commission_roles` | `role_name` | YES |
| DealsPage.jsx | 223 | `generated_documents` | `generated_at` | YES |
| PayrollPage.jsx | 58 | `time_clock` | `clock_in` | YES |
| PayrollPage.jsx | 71 | `payroll_runs` | `pay_date` | YES |
| PayrollPage.jsx | 77 | `paystubs` | `pay_date` | YES |
| documentService.js | 33 | `form_registry` | `sort_order` | **NO - BUG** |
| documentService.js | 342 | `generated_documents` | `created_at` | YES |
| DevConsolePage.jsx | 276 | `compliance_rules` | `state, category` | **INVALID SYNTAX** |

---

## Tables in Live DB But NOT Queried by Frontend

42 of 78 tables are not directly queried by any frontend code:

`ai_conversations`, `ai_research_log`, `announcements`, `api_keys`, `bhph_contracts`, `businesses`, `categories`, `commission_defaults`, `compliance_alerts`, `compliance_tasks`, `customer_notes`, `deal_activity`, `deal_documents`, `dealer_automation_rules`, `dealer_document_packages`, `dealer_profiles`, `dealer_reports`, `document_rules`, `document_templates`, `esignature_settings`, `feature_flags`, `financing_settings`, `form_templates`, `master_forms`, `message_history`, `payments`, `payroll`, `plaid_transactions`, `reporting_requirements`, `scheduled_jobs`, `shared_form_mappings`, `state_compliance`, `state_compliance_rules`, `state_configurations`, `state_form_coverage`, `state_form_requirements`, `state_metadata`, `tax_jurisdictions`, `transactions`, `universal_fields`, `user_settings`, `utah_fees`, `vehicle_requests`

Some of these may be used by edge functions or backend processes.

---

## Dead Code Files

These root-level `src/*.jsx` files are NOT imported by `App.jsx` and contain stale queries:

| File | Stale Tables |
|------|-------------|
| `src/BooksPage.jsx` | `transactions`, `categories` |
| `src/BHPHDashboard.jsx` | `payments` |
| `src/CommissionsPage.jsx` | `commissions`, `commission_defaults` |
| `src/DocumentRulesPage.jsx` | `document_rules`, `form_registry` |
| `src/CustomersPage.jsx` | `customers` |
| `src/InventoryPage.jsx` | `inventory` |

**Recommendation:** Delete these files to prevent confusion.
