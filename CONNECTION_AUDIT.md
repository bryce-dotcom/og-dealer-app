# Supabase Connection Audit

> **Generated:** 2026-02-06 | **ALL ISSUES RESOLVED:** 2026-02-06
> **Source:** All active `.jsx` and `.js` files imported by `App.jsx` routes + shared libs.
> **Schema Reference:** `DATABASE_SCHEMA.md` (from live Supabase OpenAPI spec, 78 tables)
> **Audit Method:** Automated grep of all `.from()` calls + manual review of FK joins, `.order()`, `.select()`.

---

## Summary

| Metric | Count |
|--------|-------|
| **Active source files with queries** | 17 |
| **Total `.from()` calls** | 200+ |
| **Unique tables queried** | 35 |
| **FK joins** | 10 |
| **Storage bucket references** | 7 |
| **Bugs found** | 6 total |
| **Bugs fixed** | 6 (all resolved) |
| **False positives reclassified** | 4 |
| **Dead code files deleted** | 64 files (21,394 lines) |

---

## All Bugs - Resolution Status

### False Positives (not bugs - validated against live schema)

| # | Reported Issue | Resolution |
|---|---------------|------------|
| 1 | `document_packages.docs` does not exist | `docs` (text[]) EXISTS alongside `form_ids` (jsonb) |
| 5 | `form_staging.promoted_at` does not exist | `promoted_at` (timestamptz) EXISTS |
| 6 | `deals.generated_docs` may not exist | BOTH `generated_docs` (jsonb) AND `docs_generated` (text[]) exist |
| 7 | `generated_documents` order by inconsistent columns | BOTH `generated_at` AND `created_at` exist |

### Bugs Fixed

| # | Issue | Fix | Commit |
|---|-------|-----|--------|
| 2 | `form_registry` select/order by non-existent `sort_order`, `deadline_days`, `field_mapping` | Removed missing columns, changed to `field_mappings`, order by `form_name` | `ebb226a` |
| 3 | `form_registry` select includes non-existent columns | Same as #2 | `ebb226a` |
| 4 | `.order('state, category')` invalid syntax | Changed to `.order('state').order('category')` | `ebb226a` |
| 8 | `generated_documents` insert uses `form_registry_id`, `file_name` (don't exist) | Changed to `form_library_id`, removed `file_name` | `ebb226a` |
| 9 | `generated_documents` insert missing required NOT NULL `state` column | Added `state` and `dealer_id` | `7e3b145` |
| 10 | `deals` update uses `updated_at` (doesn't exist) | Changed to `docs_generated_at`, also populates `docs_generated` | `7e3b145` |
| 11 | `dealer_forms` table doesn't exist (delete in cascade) | Removed the delete call | `7e3b145` |

---

## Queries by File

### src/lib/store.js (Global Store)

Central data fetching for 6 core tables. Used by all pages via `useStore()`.

| Line | Table | Operation | Columns | Filters | Order | Status |
|------|-------|-----------|---------|---------|-------|--------|
| 43 | `dealer_settings` | SELECT | `*` | `.eq('id', dealerId).single()` | - | OK |
| 44 | `inventory` | SELECT | `*` | `.eq('dealer_id', dealerId)` | `created_at DESC` | OK |
| 45 | `employees` | SELECT | `*` | `.eq('dealer_id', dealerId)` | - | OK |
| 46 | `bhph_loans` | SELECT | `*` | `.eq('dealer_id', dealerId)` | - | OK |
| 47 | `deals` | SELECT | `*` | `.eq('dealer_id', dealerId)` | `created_at DESC` | OK |
| 48 | `customers` | SELECT | `*` | `.eq('dealer_id', dealerId)` | - | OK |
| 65 | `inventory` | SELECT | `*` | `.eq('dealer_id', dealerId)` | `created_at DESC` | OK |
| 72 | `employees` | SELECT | `*` | `.eq('dealer_id', dealerId)` | - | OK |
| 79 | `bhph_loans` | SELECT | `*` | `.eq('dealer_id', dealerId)` | - | OK |
| 86 | `deals` | SELECT | `*` | `.eq('dealer_id', dealerId)` | `created_at DESC` | OK |

---

### src/lib/documentService.js

Document generation service. All bugs fixed.

| Line | Table | Operation | Columns | Filters | Status |
|------|-------|-----------|---------|---------|--------|
| 17 | `document_packages` | SELECT | `docs` | `.eq('dealer_id').eq('deal_type').single()` | OK |
| 30 | `form_registry` | SELECT | `id, form_number, form_name, storage_path, field_mappings` | `.or(...).not(...)` | FIXED - was `field_mapping, deadline_days, sort_order` |
| 33 | `form_registry` | ORDER | - | `.order('form_name')` | FIXED - was `.order('sort_order')` |
| 225 | `deals` | SELECT | `*` | `.eq('id', dealId).single()` | OK |
| 234 | `inventory` | SELECT | `*` | `.eq('id', vehicleId).single()` | OK |
| 241 | `dealer_settings` | SELECT | `*` | `.eq('id', dealerId).single()` | OK |
| 250 | `customers` | SELECT | `*` | `.eq('id', customerId).single()` | OK |
| 284 | (fillPdfForm call) | - | `form.field_mappings` | - | FIXED - was `form.field_mapping` |
| 300 | `generated_documents` | INSERT | `deal_id, dealer_id, form_library_id, form_number, form_name, state, storage_path, generated_by` | - | FIXED - was `form_registry_id, file_name`; added `state, dealer_id` |
| 325 | `deals` | UPDATE | `generated_docs, docs_generated, docs_generated_at` | `.eq('id', dealId)` | FIXED - was `generated_docs, updated_at` |
| 342 | `generated_documents` | SELECT | `*` | `.eq('deal_id', dealId)` | OK |
| 342 | `generated_documents` | ORDER | - | `.order('created_at')` | OK |

**Storage Buckets:**
| Line | Bucket | Operation |
|------|--------|-----------|
| 274 | `form-templates` | download |
| 291 | `deal-documents` | upload |
| 353 | `deal-documents` | createSignedUrl |

---

### src/pages/Login.jsx

| Line | Table | Operation | Columns | Filters | Status |
|------|-------|-----------|---------|---------|--------|
| 32 | `dealer_settings` | SELECT | `*` | `.eq('owner_user_id', userId).single()` | OK |
| 62 | `dealer_settings` | SELECT | `*` | `.eq('owner_user_id', userId)` | OK |
| 131 | `dealer_settings` | SELECT | `*` | `.eq('owner_user_id', userId).single()` | OK |

---

### src/pages/Dashboard.jsx

| Line | Table | Operation | Columns | Filters | FK Join | Status |
|------|-------|-----------|---------|---------|--------|--------|
| 25 | `customer_vehicle_requests` | SELECT | `*, customers(id,name,phone,email)` | `.eq('dealer_id', dealerId).eq('status', 'Looking')` | `customer_vehicle_requests.customer_id -> customers.id` | OK |

---

### src/pages/InventoryPage.jsx

| Line | Table | Operation | Columns | Filters | Order | Status |
|------|-------|-----------|---------|---------|-------|--------|
| 81 | `commission_roles` | SELECT | `*` | `.eq('dealer_id', dealerId)` | `role_name` | OK |
| 90 | `inventory_expenses` | SELECT | `*` | `.eq('inventory_id', id)` | `expense_date DESC` | OK |
| 100 | `inventory_commissions` | SELECT | `*` | `.eq('inventory_id', id)` | `created_at DESC` | OK |
| 159 | `inventory` | UPDATE | `photos` | `.eq('id', vehicleId)` | - | OK |
| 167 | `inventory_expenses` | INSERT | full row | - | - | OK |
| 185 | `inventory_expenses` | DELETE | - | `.eq('id', id)` | - | OK |
| 214 | `inventory_commissions` | INSERT | full row | - | - | OK |
| 235 | `inventory_commissions` | DELETE | - | `.eq('id', id)` | - | OK |
| 346 | `inventory` | UPDATE | `photos` | `.eq('id', vehicleId)` | - | OK |
| 400 | `inventory` | UPDATE | payload | `.eq('id', vehicleId)` | - | OK |
| 402 | `inventory` | INSERT | payload | - | - | OK |
| 419 | `inventory` | DELETE | - | `.eq('id', id)` | - | OK |

**Storage:** `vehicle-photos` bucket (upload, getPublicUrl)

---

### src/pages/DealsPage.jsx

| Line | Table | Operation | Columns | Filters | Status |
|------|-------|-----------|---------|---------|--------|
| 157 | `document_packages` | SELECT | `deal_type, form_ids` | `.eq('dealer_id', dealerId)` | OK |
| 166 | `form_staging` | SELECT | `id, form_number, form_name` | `.eq('state', state).eq('status', 'approved')` | OK |
| 220 | `generated_documents` | SELECT | `*` | `.eq('deal_id', dealId)` | OK |
| 223 | `generated_documents` | ORDER | - | `.order('generated_at', { ascending: false })` | OK |
| 486 | `deals` | UPDATE | `stage` | `.eq('id', dealId)` | OK |
| 622 | `deals` | UPDATE | full dealData | `.eq('id', dealId)` | OK |
| 627 | `deals` | INSERT | full dealData | - | OK |
| 643 | `deals` | DELETE | - | `.eq('id', dealId)` | OK |
| 656 | `deals` | UPDATE | `locked, locked_at` | `.eq('id', dealId)` | OK |
| 668 | `deals` | UPDATE | `archived, archived_at` | `.eq('id', dealId)` | OK |
| 693 | `customers` | INSERT | full row | - | OK |
| 733 | `deals` | UPDATE | `docs_generated, docs_generated_at` | `.eq('id', dealId)` | OK |
| 774 | `generated_documents` | DELETE | - | `.eq('id', docId)` | OK |
| 796 | `generated_documents` | DELETE | - | `.eq('deal_id', dealId)` | OK |

**Storage:** `deal-documents` bucket (remove)

---

### src/pages/BHPHPage.jsx

| Line | Table | Operation | Columns | Filters | Order | Status |
|------|-------|-----------|---------|---------|-------|--------|
| 71 | `bhph_payments` | SELECT | `*` | `.eq('loan_id', loanId)` | `payment_date DESC` | OK |
| 90 | `bhph_payments` | INSERT | full row | - | - | OK |
| 107 | `bhph_loans` | UPDATE | balance, status, etc. | `.eq('id', loanId)` | - | OK |
| 141 | `bhph_loans` | INSERT/UPDATE | full row | - | - | OK |
| 159 | `inventory` | UPDATE | `status: 'BHPH'` | `.eq('id', vehicleId)` | - | OK |

---

### src/pages/CustomersPage.jsx

| Line | Table | Operation | Columns | FK Join | Filters | Status |
|------|-------|-----------|---------|--------|---------|--------|
| 36 | `customer_vehicle_requests` | SELECT | `*, customers(name)` | `customer_id -> customers.id` | `.eq('dealer_id').eq('status', 'Looking')` | OK |
| 41 | `customer_vehicle_requests` | SELECT | `*` | - | `.eq('customer_id', id)` | OK |
| 50 | `customers` | INSERT | full row | - | - | OK |
| 58 | `customer_vehicle_requests` | INSERT | full row | - | - | OK |
| 66 | `customer_vehicle_requests` | UPDATE | `status` | - | `.eq('id', id)` | OK |
| 73 | `customer_vehicle_requests` | DELETE | - | - | `.eq('id', id)` | OK |

---

### src/pages/TeamPage.jsx

| Line | Table | Operation | Columns | FK Join | Filters | Status |
|------|-------|-----------|---------|--------|---------|--------|
| 49 | `employee_documents` | SELECT | `*` | - | `.eq('employee_id', empId)` | OK |
| 54 | `paystubs` | SELECT | `*` | - | `.eq('employee_id', empId)` | OK |
| 59 | `time_off_requests` | SELECT | `*, employees(name)` | `employee_id -> employees.id` | `.eq('dealer_id', dealerId)` | OK |
| 83 | `employees` | UPDATE | full row | - | `.eq('id', empId)` | OK |
| 102 | `employees` | INSERT | full row | - | - | OK |
| 122 | `employee_documents` | INSERT | full row | - | - | OK |
| 152 | `time_off_requests` | INSERT | full row | - | - | OK |

**Storage:** `employee-documents` bucket (upload, getPublicUrl)

---

### src/pages/TimeClockPage.jsx

| Line | Table | Operation | Columns | FK Join | Filters | Status |
|------|-------|-----------|---------|--------|---------|--------|
| 39 | `time_clock` | SELECT | `*, employees(name)` | `employee_id -> employees.id` | `.eq('dealer_id', dealerId)` | OK |
| 52 | `time_off_requests` | SELECT | `*, employees(name)` | `employee_id -> employees.id` | `.eq('dealer_id', dealerId)` | OK |
| 80 | `time_clock` | INSERT | full row | - | - | OK |
| 101 | `employees` | UPDATE | `pto_accrued` | - | `.eq('id', empId)` | OK |
| 105 | `time_clock` | UPDATE | `clock_out, total_hours, etc.` | - | `.eq('id', entryId)` | OK |
| 115 | `time_clock` | UPDATE | `lunch_start` | - | `.eq('id', entryId)` | OK |
| 122 | `time_clock` | UPDATE | `lunch_end` | - | `.eq('id', entryId)` | OK |
| 139 | `time_off_requests` | INSERT | full row | - | - | OK |

---

### src/pages/PayrollPage.jsx

| Line | Table | Operation | Columns | FK Join | Order | Status |
|------|-------|-----------|---------|--------|-------|--------|
| 58 | `time_clock` | SELECT | `*, employees(name, hourly_rate, salary, pay_type)` | `employee_id -> employees.id` | `clock_in ASC` | OK |
| 65 | `time_off_requests` | SELECT | `*, employees(name)` | `employee_id -> employees.id` | `created_at DESC` | OK |
| 71 | `payroll_runs` | SELECT | `*` | - | `pay_date DESC` | OK |
| 77 | `paystubs` | SELECT | `*` | - | `pay_date DESC` | OK |
| 85 | `dealer_settings` | UPDATE | `pay_frequency, pay_day, next_pay_date` | - | `.eq('id', dealerId)` | OK |
| 199 | `payroll_runs` | INSERT | full row | - | - | OK |
| 221 | `paystubs` | INSERT | full row | - | - | OK |
| 237 | `payroll_runs` | UPDATE | `total_gross, total_net` | - | `.eq('id', runId)` | OK |
| 281 | `time_off_requests` | INSERT | full row | - | - | OK |
| 295 | `employees` | UPDATE | `pto_used` | - | `.eq('id', empId)` | OK |
| 298 | `time_off_requests` | UPDATE | `status, approved_at` | - | `.eq('id', requestId)` | OK |

---

### src/pages/BooksPage.jsx

| Line | Table | Operation | Columns | Filters | Order | Status |
|------|-------|-----------|---------|---------|-------|--------|
| 33 | `expense_categories` | SELECT | `*` | `.or('dealer_id.eq.X,dealer_id.is.null')` | `sort_order` | OK |
| 34 | `bank_accounts` | SELECT | `*` | `.eq('dealer_id', dealerId)` | - | OK |
| 35 | `bank_transactions` | SELECT | `*` | `.eq('dealer_id', dealerId)` | `transaction_date DESC` | OK |
| 36 | `manual_expenses` | SELECT | `*` | `.eq('dealer_id', dealerId)` | `expense_date DESC` | OK |
| 37 | `assets` | SELECT | `*` | `.eq('dealer_id').eq('status', 'active')` | - | OK |
| 38 | `liabilities` | SELECT | `*` | `.eq('dealer_id').eq('status', 'active')` | - | OK |
| 93 | `bank_transactions` | UPDATE | `status, category_id` | `.eq('id', txnId)` | - | OK |
| 94 | `bank_transactions` | UPDATE | `status: 'ignored'` | `.eq('id', txnId)` | - | OK |
| 95 | `manual_expenses` | INSERT | full row | - | - | OK |
| 96 | `assets` | INSERT | full row | - | - | OK |
| 97 | `liabilities` | INSERT | full row | - | - | OK |

---

### src/pages/ReportsPage.jsx

| Line | Table | Operation | Columns | FK Join | Filters | Status |
|------|-------|-----------|---------|--------|---------|--------|
| 37 | `bank_transactions` | SELECT | `*` | - | `.eq('dealer_id', dealerId)` | OK |
| 38 | `expense_categories` | SELECT | `*` | - | `.or('dealer_id.eq.X,dealer_id.is.null')` | OK |
| 39 | `time_clock` | SELECT | `*, employees(name)` | `employee_id -> employees.id` | `.eq('dealer_id', dealerId)` | OK |
| 40 | `paystubs` | SELECT | `*, employees(name)` | `employee_id -> employees.id` | `.eq('dealer_id', dealerId)` | OK |
| 41 | `commissions` | SELECT | `*, employees(name), deals(*)` | `employee_id -> employees.id` + `deal_id -> deals.id` | `.eq('dealer_id', dealerId)` | OK |
| 42 | `saved_reports` | SELECT | `*` | - | `.eq('dealer_id', dealerId)` | OK |
| 235 | `saved_reports` | INSERT | full row | - | - | OK |
| 252 | `saved_reports` | DELETE | - | - | `.eq('id', id)` | OK |

**Note:** Line 41 has a **double FK join** - requires both `commissions.employee_id -> employees.id` AND `commissions.deal_id -> deals.id`.

---

### src/pages/DocumentRulesPage.jsx

| Line | Table | Operation | Columns | Filters | Status |
|------|-------|-----------|---------|---------|--------|
| 73 | `form_library` | SELECT | `*` | `.eq('state', state).eq('status', 'active')` | OK |
| 89 | `document_packages` | SELECT | `*` | `.eq('dealer_id', dealerId)` | OK |
| 152 | `document_packages` | UPDATE | full row | `.eq('id', pkgId)` | OK |
| 154 | `document_packages` | INSERT | full row | - | OK |

---

### src/pages/SettingsPage.jsx

| Line | Table | Operation | Columns | Filters | Status |
|------|-------|-----------|---------|---------|--------|
| 84 | `dealer_settings` | UPDATE | full row | `.eq('id', dealerId)` | OK |
| 152 | `dealer_settings` | UPDATE | `logo_url` | `.eq('id', dealerId)` | OK |
| 179 | `dealer_settings` | UPDATE | theme/display settings | `.eq('id', dealerId)` | OK |
| 209 | `dealer_settings` | UPDATE | various | `.eq('id', dealerId)` | OK |
| 226 | `inventory` | SELECT | `*` | `.eq('dealer_id', dealerId)` | OK |
| 227 | `deals` | SELECT | `*` | `.eq('dealer_id', dealerId)` | OK |
| 228 | `customers` | SELECT | `*` | `.eq('dealer_id', dealerId)` | OK |
| 229 | `employees` | SELECT | `*` | `.eq('dealer_id', dealerId)` | OK |
| 230 | `bhph_loans` | SELECT | `*` | `.eq('dealer_id', dealerId)` | OK |

**Storage:** `dealer-assets` bucket (upload), `public` bucket (createSignedUrl, getPublicUrl)

---

### src/pages/StateUpdatesPage.jsx

| Line | Table | Operation | Columns | Filters | Status |
|------|-------|-----------|---------|---------|--------|
| 46 | `state_updates` | SELECT | `*` | `.order('created_at', { ascending: false })` | OK |
| 68 | `state_updates` | UPDATE | `is_read: true` | `.eq('id', id)` | OK |
| 85 | `state_updates` | INSERT | full row | - | OK |
| 101 | `state_updates` | DELETE | - | `.eq('id', id)` | OK |

---

### src/pages/EmbedInventory.jsx

| Line | Table | Operation | Columns | Filters | Status |
|------|-------|-----------|---------|---------|--------|
| 36 | `dealer_settings` | SELECT | `dealer_name, logo_url, phone, email, state` | `.eq('id', dealerId).single()` | OK |
| 46 | `inventory` | SELECT | `*` | `.eq('dealer_id', dealerId).eq('status', 'In Stock')` | OK |

**Note:** Creates its own Supabase client (public embed).

---

### src/pages/EmbedFindRig.jsx

| Line | Table | Operation | Columns | Filters | Status |
|------|-------|-----------|---------|---------|--------|
| 42 | `dealer_settings` | SELECT | `dealer_name, logo_url, phone` | `.eq('id', dealerId).single()` | OK |
| 149 | `customers` | INSERT | `name, phone, email, dealer_id` | - | OK |
| 163 | `customer_vehicle_requests` | INSERT | full row | - | OK |

**Note:** Creates its own Supabase client (public embed).

---

### src/pages/DevConsolePage.jsx

Dev-only admin console. All bugs fixed.

| Line | Table | Operation | Columns | Filters | Status |
|------|-------|-----------|---------|---------|--------|
| 270 | `dealer_settings` | SELECT | `*` | `.order('id')` | OK |
| 271 | `employees` | SELECT | `*` | `.order('name')` | OK |
| 272 | `feedback` | SELECT | `*` | `.order('created_at', { ascending: false })` | OK |
| 273 | `audit_log` | SELECT | `*` | `.order('created_at', { ascending: false }).limit(100)` | OK |
| 274 | `promo_codes` | SELECT | `*` | `.order('created_at', { ascending: false })` | OK |
| 275 | `message_templates` | SELECT | `*` | `.order('name')` | OK |
| 276 | `compliance_rules` | SELECT | `*` | `.order('state').order('category')` | FIXED - was `.order('state, category')` |
| 277 | `form_staging` | SELECT | `*` | `.order('created_at', { ascending: false })` | OK |
| 278 | `form_library` | SELECT | `*` | `.order('created_at', { ascending: false })` | OK |
| 309 | (dynamic) | SELECT | `*` | `.limit(200)` | OK (table browser, dev-only) |
| 342 | `audit_log` | INSERT | full row | - | OK |
| 351 | `feedback` | UPDATE | `status` | `.eq('id', id)` | OK |
| 357 | `feedback` | DELETE | - | `.eq('id', id)` | OK |
| 375 | `employees` | DELETE | - | `.eq('id', id)` | OK |
| 392 | `inventory` | DELETE | - | `.eq('dealer_id', id)` | OK (dealer cascade) |
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
| 1677 | `form_staging` | UPDATE | `status, promoted_at` | `.eq('id', promotedFrom)` | OK |

**Note:** `dealer_forms` delete (previously line 391) was REMOVED - table doesn't exist.

**Storage:** `form-pdfs` bucket (upload, remove, getPublicUrl)

---

### src/pages/AdminDevConsole.jsx

No direct table queries. Only calls Supabase edge functions. OK.

---

### src/pages/CommissionsPage.jsx

No direct Supabase queries. Uses `useStore()` data only. OK.

---

### src/pages/ResearchPage.jsx

No Supabase table queries (uses external API). OK.

---

## FK Join Summary

All FK joins validated - required FK columns exist on all source tables.

| File | Line | Query Pattern | FK Needed | Status |
|------|------|---------------|-----------|--------|
| Dashboard.jsx | 25 | `customer_vehicle_requests ... customers(id,name,phone,email)` | `customer_vehicle_requests.customer_id -> customers.id` | OK |
| CustomersPage.jsx | 36 | `customer_vehicle_requests ... customers(name)` | `customer_vehicle_requests.customer_id -> customers.id` | OK |
| TeamPage.jsx | 59 | `time_off_requests ... employees(name)` | `time_off_requests.employee_id -> employees.id` | OK |
| TimeClockPage.jsx | 39 | `time_clock ... employees(name)` | `time_clock.employee_id -> employees.id` | OK |
| TimeClockPage.jsx | 52 | `time_off_requests ... employees(name)` | `time_off_requests.employee_id -> employees.id` | OK |
| PayrollPage.jsx | 58 | `time_clock ... employees(name, hourly_rate, salary, pay_type)` | `time_clock.employee_id -> employees.id` | OK |
| PayrollPage.jsx | 65 | `time_off_requests ... employees(name)` | `time_off_requests.employee_id -> employees.id` | OK |
| ReportsPage.jsx | 39 | `time_clock ... employees(name)` | `time_clock.employee_id -> employees.id` | OK |
| ReportsPage.jsx | 40 | `paystubs ... employees(name)` | `paystubs.employee_id -> employees.id` | OK |
| ReportsPage.jsx | 41 | `commissions ... employees(name), deals(*)` | `commissions.employee_id -> employees.id` + `commissions.deal_id -> deals.id` | OK |

---

## Order-By Column Validation

All `.order()` calls validated against live schema - all columns exist.

| File | Line | Table | Order Column | Status |
|------|------|-------|-------------|--------|
| store.js | 44 | `inventory` | `created_at` | OK |
| store.js | 47 | `deals` | `created_at` | OK |
| BooksPage.jsx | 33 | `expense_categories` | `sort_order` | OK |
| BooksPage.jsx | 35 | `bank_transactions` | `transaction_date` | OK |
| BooksPage.jsx | 36 | `manual_expenses` | `expense_date` | OK |
| BHPHPage.jsx | 71 | `bhph_payments` | `payment_date` | OK |
| InventoryPage.jsx | 81 | `commission_roles` | `role_name` | OK |
| DealsPage.jsx | 223 | `generated_documents` | `generated_at` | OK |
| PayrollPage.jsx | 58 | `time_clock` | `clock_in` | OK |
| PayrollPage.jsx | 71 | `payroll_runs` | `pay_date` | OK |
| PayrollPage.jsx | 77 | `paystubs` | `pay_date` | OK |
| documentService.js | 33 | `form_registry` | `form_name` | FIXED - was `sort_order` |
| documentService.js | 342 | `generated_documents` | `created_at` | OK |
| DevConsolePage.jsx | 276 | `compliance_rules` | `state` then `category` | FIXED - was `'state, category'` |

---

## Tables in Live DB But NOT Queried by Frontend

42 of 78 tables are not directly queried by any frontend code:

`ai_conversations`, `ai_research_log`, `announcements`, `api_keys`, `bhph_contracts`, `businesses`, `categories`, `commission_defaults`, `compliance_alerts`, `compliance_tasks`, `customer_notes`, `deal_activity`, `deal_documents`, `dealer_automation_rules`, `dealer_document_packages`, `dealer_profiles`, `dealer_reports`, `document_rules`, `document_templates`, `esignature_settings`, `feature_flags`, `financing_settings`, `form_templates`, `master_forms`, `message_history`, `payments`, `payroll`, `plaid_transactions`, `reporting_requirements`, `scheduled_jobs`, `shared_form_mappings`, `state_compliance`, `state_compliance_rules`, `state_configurations`, `state_form_coverage`, `state_form_requirements`, `state_metadata`, `tax_jurisdictions`, `transactions`, `universal_fields`, `user_settings`, `utah_fees`, `vehicle_requests`

Some of these may be used by edge functions or backend processes.

---

## Dead Code Cleanup

All dead code files have been **deleted** in commit `7e3b145` (21,394 lines removed):

| Category | Count | Status |
|----------|-------|--------|
| Root `src/*.jsx` dead files | 21 files | DELETED |
| `src/pages/*.txt` stale backups | 38 files | DELETED |
| `src/pages/*.backup` stale backups | 1 file | DELETED |
| `src/pages/documentService.js` (stale duplicate) | 1 file | DELETED |
| `src/pages/store.js` (identical duplicate) | 1 file | DELETED |
| `src/pages/index.ts` (misplaced edge function) | 1 file | DELETED |
| `.env.txt` (duplicate credentials) | 1 file | DELETED |
| **Total** | **64 files** | **All deleted** |

---

## Commit History

| Commit | Description |
|--------|-------------|
| `218a209` | Add comprehensive database documentation suite (78 tables from live schema) |
| `ebb226a` | FIX: 3 confirmed Supabase query bugs (400 errors) |
| `7e3b145` | FIX: Remaining mismatch report bugs + remove 21K lines of dead code |
| `287d981` | Update MISMATCH_REPORT.md - all issues resolved |
