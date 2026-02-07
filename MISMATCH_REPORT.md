# Query vs Schema Mismatches
Generated: 2026-02-06 | **Updated: 2026-02-06 (validated against live Supabase schema)**

> **Audit Scope:** All active `.jsx` and `.js` files imported by `App.jsx` routes + shared libs.
> Excludes `.txt`, `.backup`, and root `src/*.jsx` (dead code not imported by any route).
> Schema reference: `DATABASE_SCHEMA.md` (78 tables from live Supabase OpenAPI spec)
>
> **UPDATE:** Original report was based on incomplete `DATABASE_SCHEMA.md` (9 tables only).
> After pulling the full live schema via the OpenAPI endpoint, several issues were **reclassified**.
> See `CONNECTION_AUDIT.md` for the corrected full audit.

## CORRECTIONS (from live schema validation)

| # | Original Finding | Correction |
|---|-----------------|------------|
| 1 | `document_packages.docs` does not exist | **FALSE** - `docs` (text[]) EXISTS in live schema alongside `form_ids` (jsonb) |
| 5 | `form_staging.promoted_at` does not exist | **FALSE** - `promoted_at` (timestamptz) EXISTS in live schema |
| 6 | `deals.generated_docs` may not exist | **FALSE** - BOTH `generated_docs` (jsonb) AND `docs_generated` (text[]) exist |
| 7 | `generated_documents` order by inconsistent | **FALSE** - BOTH `generated_at` AND `created_at` exist in live schema |

### New Bug Found During Live Validation
| Issue | File | Line | Problem |
|-------|------|------|---------|
| `generated_documents` insert uses wrong columns | `src/lib/documentService.js` | 300-308 | Inserts `form_registry_id` and `file_name` - neither exists. Live schema has `form_library_id` (uuid) and no `file_name` column |

---

## Critical Errors (will cause 400s or return wrong data)

### 1. `document_packages.docs` column does NOT exist
| File | Line | Query | Problem |
|------|------|-------|---------|
| `src/lib/documentService.js` | 17 | `.from('document_packages').select('docs')` | Column `docs` does not exist. Schema has `form_ids` (UUID[]). This returns null for that field, breaking the entire `getDealForms()` function. |

**Impact:** Document generation via `executeDeal()` will fail - no forms loaded for any deal type from this code path.

---

### 2. `form_registry` order by non-existent `sort_order` column
| File | Line | Table | Column Used | Schema Columns |
|------|------|-------|-------------|----------------|
| `src/lib/documentService.js` | 33 | `form_registry` | `sort_order` | id, state, form_number, form_name, category, required_for, description, source_url, download_url, storage_bucket, storage_path, is_gov_source, is_fillable, detected_fields, field_mappings, mapping_confidence, ai_discovered, ai_confidence, status, dealer_id, last_verified_at, created_at, updated_at |

**Impact:** `.order('sort_order')` on a non-existent column returns a **400 error** from PostgREST. The entire `getDealForms()` query fails.

---

### 3. `form_registry` select includes non-existent columns
| File | Line | Query | Problem |
|------|------|-------|---------|
| `src/lib/documentService.js` | 30 | `.select('id, form_number, form_name, storage_path, field_mapping, deadline_days, sort_order')` | `deadline_days` and `sort_order` do NOT exist on `form_registry` per schema. Supabase returns 400 when selecting non-existent columns explicitly. |

**Impact:** Query returns 400 error. Combined with issue #2, the document service is non-functional for the `form_registry` code path.

---

### 4. `compliance_rules` order by invalid multi-column string
| File | Line | Query | Problem |
|------|------|-------|---------|
| `src/pages/DevConsolePage.jsx` | 276 | `.from('compliance_rules').select('*').order('state, category')` | Supabase `.order()` takes a single column name. `'state, category'` is treated as one column name (including the comma and space), which doesn't exist. |

**Impact:** Returns 400 error. Compliance rules will fail to load in Dev Console.

---

### 5. `form_staging.promoted_at` column does NOT exist
| File | Line | Query | Problem |
|------|------|-------|---------|
| `src/pages/DevConsolePage.jsx` | 1677 | `.from('form_staging').update({ status: 'pending', promoted_at: null })` | `promoted_at` is NOT in the `form_staging` schema. Column does not exist. |

**Impact:** Update will fail with 400 error when un-promoting a form from the library.

---

### 6. `deals.generated_docs` column may not exist
| File | Line | Query | Problem |
|------|------|-------|---------|
| `src/lib/documentService.js` | 326 | `.from('deals').update({ generated_docs: [...], updated_at: ... })` | `generated_docs` column not documented. `DealsPage.jsx:734` also updates `docs_generated` (different name!) and `docs_generated_at`. |
| `src/pages/DealsPage.jsx` | 734 | `.from('deals').update({ docs_generated: [...], docs_generated_at: ... })` | Uses `docs_generated` vs documentService using `generated_docs`. **Inconsistent column names.** |

**Impact:** One or both updates will silently fail (PostgREST ignores unknown columns in updates unless strict mode is on) or throw errors. Document generation tracking is broken.

---

### 7. `generated_documents` order by inconsistent column names
| File | Line | Table | Column Used |
|------|------|-------|-------------|
| `src/pages/DealsPage.jsx` | 223 | `generated_documents` | `generated_at` |
| `src/lib/documentService.js` | 342 | `generated_documents` | `created_at` |

**Impact:** If only one of these columns exists, one query will fail with 400. If both exist, ordering is inconsistent across the app.

---

## High Priority Warnings

### FK Joins That Need Verification

These FK joins require foreign key relationships to exist in the database. If the FK doesn't exist or there are multiple FKs to the same table, these will return 400 errors.

| File | Line | Query | FK Relationship Needed |
|------|------|-------|----------------------|
| `src/pages/Dashboard.jsx` | 25-33 | `customer_vehicle_requests.select('*, customers(id,name,phone,email)')` | `customer_vehicle_requests.customer_id → customers.id` |
| `src/pages/CustomersPage.jsx` | 36 | `customer_vehicle_requests.select('*, customers(name)')` | Same FK |
| `src/pages/TeamPage.jsx` | 59 | `time_off_requests.select('*, employees(name)')` | `time_off_requests.employee_id → employees.id` |
| `src/pages/PayrollPage.jsx` | 58 | `time_clock.select('*, employees(name, hourly_rate, salary, pay_type)')` | `time_clock.employee_id → employees.id` |
| `src/pages/PayrollPage.jsx` | 65 | `time_off_requests.select('*, employees(name)')` | `time_off_requests.employee_id → employees.id` |
| `src/pages/TimeClockPage.jsx` | 39 | `time_clock.select('*, employees(name)')` | Same FK |
| `src/pages/TimeClockPage.jsx` | 52 | `time_off_requests.select('*, employees(name)')` | Same FK |
| `src/pages/ReportsPage.jsx` | 39 | `time_clock.select('*, employees(name)')` | Same FK |
| `src/pages/ReportsPage.jsx` | 40 | `paystubs.select('*, employees(name)')` | `paystubs.employee_id → employees.id` |
| `src/pages/ReportsPage.jsx` | 41 | `commissions.select('*, employees(name), deals(*)')` | `commissions.employee_id → employees.id` AND `commissions.deal_id → deals.id` |
| `src/pages/index.ts` | 54 | `deals.select('*, inventory(make, model)')` | `deals.vehicle_id → inventory.id` |

**Special concern:** `ReportsPage.jsx:41` - The `commissions` table does a **double FK join** to both `employees` AND `deals`. If either FK is missing or ambiguous, this will 400.

---

### Tables NOT in DATABASE_SCHEMA.md (Undocumented)

These 27 tables are actively queried but not documented. They likely exist but should be added to DATABASE_SCHEMA.md:

| Table | Used By |
|-------|---------|
| `dealer_settings` | Login, store, Settings, Payroll, DevConsole, Embeds |
| `inventory` | store, InventoryPage, BHPHPage, DealsPage, Settings, Embeds |
| `employees` | store, TeamPage, TimeClockPage, PayrollPage, DevConsole |
| `deals` | store, DealsPage, documentService, Settings, ReportsPage |
| `customers` | store, CustomersPage, DealsPage, EmbedFindRig, Settings |
| `bhph_loans` | store, BHPHPage, DevConsole, Settings |
| `bhph_payments` | BHPHPage |
| `commissions` | ReportsPage |
| `commission_roles` | InventoryPage |
| `inventory_expenses` | InventoryPage |
| `inventory_commissions` | InventoryPage |
| `customer_vehicle_requests` | CustomersPage, Dashboard, EmbedFindRig |
| `time_clock` | TimeClockPage, PayrollPage, ReportsPage |
| `time_off_requests` | TeamPage, TimeClockPage, PayrollPage, PTORequestModal |
| `employee_documents` | TeamPage |
| `payroll_runs` | PayrollPage |
| `paystubs` | TeamPage, PayrollPage, ReportsPage |
| `bank_accounts` | BooksPage |
| `bank_transactions` | BooksPage, ReportsPage |
| `manual_expenses` | BooksPage |
| `expense_categories` | BooksPage, ReportsPage |
| `assets` | BooksPage |
| `liabilities` | BooksPage |
| `saved_reports` | ReportsPage |
| `generated_documents` | DealsPage, documentService |
| `feedback` | FeedbackButton, DevConsole |
| `audit_log` | DevConsole |
| `promo_codes` | DevConsole |
| `message_templates` | DevConsole |
| `compliance_rules` | DevConsole |
| `dealer_forms` | DealerOnboarding, DevConsole |
| `state_updates` | DevConsole, StateUpdatesPage |

---

### Order By Columns Needing Verification

These `.order()` calls use columns not present in DATABASE_SCHEMA.md (because the tables themselves aren't documented). They need verification against the actual DB:

| File | Line | Table | Order Column | Risk |
|------|------|-------|-------------|------|
| `src/pages/BooksPage.jsx` | 33 | `expense_categories` | `sort_order` | Medium - column may not exist |
| `src/pages/BooksPage.jsx` | 35 | `bank_transactions` | `transaction_date` | Low - likely exists |
| `src/pages/BooksPage.jsx` | 36 | `manual_expenses` | `expense_date` | Low - likely exists |
| `src/pages/BHPHPage.jsx` | 74 | `bhph_payments` | `payment_date` | Low - likely exists |
| `src/pages/InventoryPage.jsx` | 84 | `commission_roles` | `role_name` | Low - likely exists |
| `src/pages/DealsPage.jsx` | 223 | `generated_documents` | `generated_at` | Medium - might be `created_at` |
| `src/pages/PayrollPage.jsx` | 59 | `time_clock` | `clock_in` | Low - likely exists |
| `src/pages/PayrollPage.jsx` | 72 | `payroll_runs` | `pay_date` | Medium - might be `created_at` |
| `src/pages/PayrollPage.jsx` | 77 | `paystubs` | `pay_date` | Low - likely exists |

---

### Column Name Inconsistencies in `deals` Table

The code writes to the `deals` table with **conflicting column names** across different files:

| Column Group | File A | File B | Problem |
|-------------|--------|--------|---------|
| Generated docs | `documentService.js:326` uses `generated_docs` | `DealsPage.jsx:734` uses `docs_generated` | Different column names for same purpose |
| Updated timestamp | `documentService.js:327` uses `updated_at` | `DealsPage.jsx:735` uses `docs_generated_at` | Different timestamp columns |

---

## Low Priority / Informational

### Dead Code Files (Not imported by App.jsx)

These root-level `src/*.jsx` files are NOT imported by any route and contain stale table references:

| File | Stale Table References |
|------|----------------------|
| `src/BooksPage.jsx` | `transactions`, `categories` (tables likely renamed) |
| `src/BHPHDashboard.jsx` | `payments` (likely renamed to `bhph_payments`) |
| `src/CommissionsPage.jsx` | `commissions`, `commission_defaults` |
| `src/DocumentRulesPage.jsx` | `document_rules`, `form_registry` |
| `src/CustomersPage.jsx` | `customers` (OK but stale copy) |
| `src/InventoryPage.jsx` | `inventory` (OK but stale copy) |

Also `.txt` and `.backup` copies in `src/pages/` contain stale references (e.g., `vehicle_requests` instead of `customer_vehicle_requests`).

**Recommendation:** Delete all dead code files to prevent confusion.

---

### Storage Bucket References

| File | Line | Bucket | Usage |
|------|------|--------|-------|
| `src/pages/InventoryPage.jsx` | 346 | `vehicle-photos` | Photo upload/storage |
| `src/pages/TeamPage.jsx` | 120 | `employee-documents` | Employee doc upload |
| `src/lib/documentService.js` | 274 | `form-templates` | PDF template source |
| `src/lib/documentService.js` | 291 | `deal-documents` | Generated doc storage |
| `src/pages/DealsPage.jsx` | 769 | `deal-documents` | Delete generated docs |

---

## Summary

| Category | Count |
|----------|-------|
| **Critical errors (will cause 400s)** | **7** |
| **FK joins needing verification** | **11** |
| **Undocumented tables** | **27** |
| **Order-by columns needing verification** | **9** |
| **Column name inconsistencies** | **2** |
| **Dead code files** | **6+** |

### Top 5 Lines to Fix First

1. **`src/lib/documentService.js:17`** - Change `select('docs')` to `select('form_ids')` on `document_packages`
2. **`src/lib/documentService.js:30-33`** - Remove `deadline_days, sort_order` from select; remove `.order('sort_order')`
3. **`src/pages/DevConsolePage.jsx:276`** - Change `.order('state, category')` to `.order('state').order('category')`
4. **`src/pages/DevConsolePage.jsx:1677`** - Remove `promoted_at` from form_staging update
5. **`src/pages/DealsPage.jsx:734` vs `src/lib/documentService.js:326`** - Align column names (`docs_generated` vs `generated_docs`)
