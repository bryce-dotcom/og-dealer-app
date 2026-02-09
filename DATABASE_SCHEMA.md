# OGDealer Database Schema

> **Last Updated:** 2026-02-06 (generated from live Supabase OpenAPI spec)
>
> **Source:** `https://rlzudfinlxonpbwacxpt.supabase.co/rest/v1/` OpenAPI endpoint
>
> **IMPORTANT:** Reference this file before writing ANY Supabase query.
> Column names, types, and nullability are authoritative. If a column is not listed here, it does NOT exist.
>
> **Total Tables:** 78

---

## Table of Contents

### Core Business
- [`dealer_settings`](#dealer_settings) *
- [`businesses`](#businesses)
- [`user_settings`](#user_settings)
- [`dealer_profiles`](#dealer_profiles)

### Inventory & Vehicles
- [`inventory`](#inventory) *
- [`inventory_expenses`](#inventory_expenses) *
- [`inventory_commissions`](#inventory_commissions) *
- [`commission_roles`](#commission_roles) *
- [`commission_defaults`](#commission_defaults)
- [`commissions`](#commissions) *

### Customers
- [`customers`](#customers) *
- [`customer_notes`](#customer_notes)
- [`customer_vehicle_requests`](#customer_vehicle_requests) *
- [`vehicle_requests`](#vehicle_requests)

### Deals & Documents
- [`deals`](#deals) *
- [`deal_activity`](#deal_activity)
- [`deal_documents`](#deal_documents)
- [`document_packages`](#document_packages) *
- [`dealer_document_packages`](#dealer_document_packages)
- [`document_rules`](#document_rules)
- [`document_templates`](#document_templates)
- [`generated_documents`](#generated_documents) *

### BHPH / Financing
- [`bhph_loans`](#bhph_loans) *
- [`bhph_payments`](#bhph_payments) *
- [`bhph_contracts`](#bhph_contracts)
- [`payments`](#payments)
- [`financing_settings`](#financing_settings)

### Forms Pipeline
- [`form_staging`](#form_staging) *
- [`form_library`](#form_library) *
- [`form_registry`](#form_registry) *
- [`form_templates`](#form_templates)
- [`master_forms`](#master_forms)
- [`shared_form_mappings`](#shared_form_mappings)
- [`universal_fields`](#universal_fields)

### State & Compliance
- [`state_metadata`](#state_metadata)
- [`state_configurations`](#state_configurations)
- [`state_compliance`](#state_compliance)
- [`state_compliance_rules`](#state_compliance_rules)
- [`state_form_requirements`](#state_form_requirements)
- [`state_form_coverage`](#state_form_coverage)
- [`state_updates`](#state_updates) *
- [`compliance_rules`](#compliance_rules) *
- [`compliance_alerts`](#compliance_alerts)
- [`compliance_tasks`](#compliance_tasks)
- [`tax_jurisdictions`](#tax_jurisdictions)
- [`utah_fees`](#utah_fees)
- [`reporting_requirements`](#reporting_requirements)
- [`dealer_reports`](#dealer_reports)

### Document Automation
- [`dealer_automation_rules`](#dealer_automation_rules)
- [`esignature_settings`](#esignature_settings)

### Employees & Payroll
- [`employees`](#employees) *
- [`employee_documents`](#employee_documents) *
- [`time_clock`](#time_clock) *
- [`time_off_requests`](#time_off_requests) *
- [`payroll`](#payroll)
- [`payroll_runs`](#payroll_runs) *
- [`paystubs`](#paystubs) *

### Books & Expenses
- [`bank_accounts`](#bank_accounts) *
- [`bank_transactions`](#bank_transactions) *
- [`manual_expenses`](#manual_expenses) *
- [`expense_categories`](#expense_categories) *
- [`categories`](#categories)
- [`assets`](#assets) *
- [`liabilities`](#liabilities) *
- [`plaid_transactions`](#plaid_transactions)
- [`transactions`](#transactions)
- [`saved_reports`](#saved_reports) *

### Communication
- [`message_templates`](#message_templates) *
- [`message_history`](#message_history)
- [`feedback`](#feedback) *
- [`announcements`](#announcements)

### AI & Research
- [`ai_conversations`](#ai_conversations)
- [`ai_research_log`](#ai_research_log)

### System
- [`audit_log`](#audit_log) *
- [`api_keys`](#api_keys)
- [`feature_flags`](#feature_flags)
- [`promo_codes`](#promo_codes) *
- [`scheduled_jobs`](#scheduled_jobs)

> Tables marked with `*` are actively queried by the frontend application code.

---

# Core Business

## dealer_settings (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `dealer_name` | text | NO |  |
| `state` | text | NO | UT |
| `county` | text | YES |  |
| `dealer_license` | text | YES |  |
| `address` | text | YES |  |
| `city` | text | YES |  |
| `zip` | text | YES |  |
| `phone` | text | YES |  |
| `email` | text | YES |  |
| `logo_url` | text | YES |  |
| `created_at` | timestamp with time zone | YES | now() |
| `stock_pattern` | text | YES | YYYY-## |
| `stock_next_number` | integer | YES | 1 |
| `owner_user_id` | uuid | YES |  |
| `subscription_status` | text | YES | trial |
| `trial_ends_at` | timestamp with time zone | YES | (now() + '14 days'::interval) |
| `pay_frequency` | text | YES | bi-weekly |
| `pay_day` | text | YES | friday |
| `next_pay_date` | date | YES |  |

## businesses

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | extensions.uuid_generate_v4() |
| `name` | text | NO |  |
| `address` | text | YES |  |
| `city` | text | YES |  |
| `state` | text | YES |  |
| `zip` | text | YES |  |
| `phone` | text | YES |  |
| `email` | text | YES |  |
| `owner_id` | uuid | YES |  |
| `created_at` | timestamp with time zone | YES | now() |
| `updated_at` | timestamp with time zone | YES | now() |

## user_settings

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | extensions.uuid_generate_v4() |
| `user_id` | uuid | YES |  |
| `business_id` | uuid | YES |  |
| `role` | text | YES | User |
| `commission_structure` | text | YES |  |
| `auto_sync_plaid` | boolean | YES | false |
| `email_notifications` | boolean | YES | true |
| `last_login` | timestamp with time zone | YES |  |
| `created_at` | timestamp with time zone | YES | now() |
| `updated_at` | timestamp with time zone | YES | now() |

## dealer_profiles

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | extensions.uuid_generate_v4() |
| `business_id` | uuid | YES |  |
| `dealer_license_number` | text | YES |  |
| `dealer_license_state` | text | YES |  |
| `dealer_license_expiration` | date | YES |  |
| `federal_ein` | text | YES |  |
| `state_tax_id` | text | YES |  |
| `dmv_dealer_account` | text | YES |  |
| `surety_bond_number` | text | YES |  |
| `surety_bond_amount` | numeric | YES |  |
| `surety_bond_company` | text | YES |  |
| `surety_bond_expiration` | date | YES |  |
| `insurance_policy_number` | text | YES |  |
| `insurance_company` | text | YES |  |
| `insurance_expiration` | date | YES |  |
| `insurance_coverage_amount` | numeric | YES |  |
| `business_type` | text | YES | Independent |
| `bhph_enabled` | boolean | YES | false |
| `wholesale_enabled` | boolean | YES | false |
| `default_doc_fee` | numeric | YES | 289 |
| `default_apr` | numeric | YES | 18 |
| `max_bhph_term_months` | integer | YES | 48 |
| `principals` | jsonb | YES |  |
| `onboarding_completed` | boolean | YES | false |
| `onboarding_step` | integer | YES | 1 |
| `created_at` | timestamp with time zone | YES | now() |
| `updated_at` | timestamp with time zone | YES | now() |

# Inventory & Vehicles

## inventory (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | text | NO |  |
| `year` | integer | YES |  |
| `make` | text | YES |  |
| `model` | text | YES |  |
| `trim` | text | YES |  |
| `vin` | text | YES |  |
| `miles` | integer | YES | 0 |
| `color` | text | YES |  |
| `purchased_from` | text | YES |  |
| `purchase_price` | numeric | YES | 0 |
| `sale_price` | numeric | YES |  |
| `profit` | numeric | YES |  |
| `status` | text | YES | In Stock |
| `created_at` | timestamp with time zone | YES | now() |
| `stock_number` | text | YES |  |
| `mileage` | integer | YES |  |
| `dealer_id` | integer | YES |  |
| `photos` | text[] | YES |  |
| `description` | text | YES |  |

## inventory_expenses (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `inventory_id` | text | YES |  |
| `dealer_id` | integer | YES |  |
| `description` | text | NO |  |
| `amount` | numeric | NO |  |
| `expense_date` | date | YES | CURRENT_DATE |
| `category` | text | YES | Repair |
| `created_at` | timestamp with time zone | YES | now() |
| `receipt_url` | text | YES |  |

## inventory_commissions (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `inventory_id` | text | YES |  |
| `dealer_id` | integer | YES |  |
| `employee_id` | integer | YES |  |
| `employee_name` | text | NO |  |
| `role` | text | NO |  |
| `amount` | numeric | NO |  |
| `commission_type` | text | YES | Flat |
| `created_at` | timestamp with time zone | YES | now() |
| `role_id` | integer | YES |  |
| `is_specialist` | boolean | YES | false |
| `rate_used` | numeric | YES |  |
| `override_rate` | numeric | YES |  |

## commission_roles (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `dealer_id` | integer | YES |  |
| `role_name` | text | NO |  |
| `helper_rate` | numeric | YES | 0.025 |
| `specialist_rate` | numeric | YES | 0.05 |
| `created_at` | timestamp with time zone | YES | now() |

## commission_defaults

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `dealer_id` | integer | YES |  |
| `role` | text | YES |  |
| `percentage` | numeric | YES |  |
| `flat_amount` | numeric | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

## commissions (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `dealer_id` | integer | YES |  |
| `deal_id` | integer | YES |  |
| `employee_id` | integer | YES |  |
| `employee_name` | text | YES |  |
| `role` | text | YES |  |
| `amount` | numeric | YES |  |
| `percentage` | numeric | YES |  |
| `status` | text | YES | pending |
| `paid_date` | date | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

# Customers

## customers (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `name` | text | NO |  |
| `phone` | text | YES |  |
| `email` | text | YES |  |
| `address` | text | YES |  |
| `city` | text | YES |  |
| `state` | text | YES | UT |
| `zip` | text | YES |  |
| `drivers_license` | text | YES |  |
| `notes` | text | YES |  |
| `created_at` | timestamp with time zone | YES | now() |
| `first_name` | text | YES |  |
| `last_name` | text | YES |  |
| `dl_number` | text | YES |  |
| `dealer_id` | integer | YES |  |

## customer_notes

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `customer_id` | integer | YES |  |
| `note` | text | NO |  |
| `note_type` | text | YES | general |
| `created_by` | integer | YES |  |
| `dealer_id` | integer | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

## customer_vehicle_requests (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `customer_id` | integer | YES |  |
| `dealer_id` | integer | YES |  |
| `year_min` | integer | YES |  |
| `year_max` | integer | YES |  |
| `make` | text | YES |  |
| `model` | text | YES |  |
| `max_price` | numeric | YES |  |
| `max_miles` | integer | YES |  |
| `notes` | text | YES |  |
| `status` | text | YES | Looking |
| `created_at` | timestamp with time zone | YES | now() |

## vehicle_requests

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `customer_id` | integer | YES |  |
| `dealer_id` | integer | YES |  |
| `year_min` | integer | YES |  |
| `year_max` | integer | YES |  |
| `make` | text | YES |  |
| `model` | text | YES |  |
| `max_price` | numeric | YES |  |
| `max_miles` | integer | YES |  |
| `notes` | text | YES |  |
| `status` | text | YES | Looking |
| `created_at` | timestamp with time zone | YES | now() |

# Deals & Documents

## deals (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `vehicle_id` | text | YES |  |
| `purchaser_name` | text | YES |  |
| `date_of_sale` | date | YES |  |
| `salesman` | text | YES |  |
| `price` | numeric | YES |  |
| `balance_due` | numeric | YES |  |
| `created_at` | timestamp with time zone | YES | now() |
| `customer_id` | integer | YES |  |
| `deal_status` | text | YES | Pending |
| `phone` | text | YES |  |
| `address` | text | YES |  |
| `city` | text | YES |  |
| `state` | text | YES |  |
| `zip` | text | YES |  |
| `doc_fee` | numeric | YES | 289 |
| `sales_tax` | numeric | YES |  |
| `total_price` | numeric | YES |  |
| `down_payment` | numeric | YES | 0 |
| `trade_allowance` | numeric | YES | 0 |
| `trade_vin` | text | YES |  |
| `deal_type` | text | YES | cash |
| `sale_price` | numeric | YES |  |
| `trade_payoff` | numeric | YES | 0 |
| `amount_financed` | numeric | YES |  |
| `apr` | numeric | YES |  |
| `term_months` | integer | YES |  |
| `monthly_payment` | numeric | YES |  |
| `first_payment_date` | date | YES |  |
| `total_of_payments` | numeric | YES |  |
| `dealer_id` | integer | YES |  |
| `stage` | text | YES | Lead |
| `archived` | boolean | YES | false |
| `archived_at` | timestamp with time zone | YES |  |
| `trade_description` | text | YES |  |
| `trade_value` | numeric | YES | 0 |
| `trade_acv` | numeric | YES | 0 |
| `negative_equity` | numeric | YES | 0 |
| `gap_insurance` | numeric | YES | 0 |
| `extended_warranty` | numeric | YES | 0 |
| `protection_package` | numeric | YES | 0 |
| `total_sale` | numeric | YES |  |
| `notes` | text | YES |  |
| `locked` | boolean | YES | false |
| `locked_at` | timestamp with time zone | YES |  |
| `locked_by` | text | YES |  |
| `credit_score` | integer | YES |  |
| `interest_rate` | numeric | YES | 18 |
| `generated_docs` | jsonb | YES |  |
| `documents` | jsonb | YES |  |
| `email` | text | YES |  |
| `tire_wheel` | numeric | YES | 0 |
| `accessory_1_desc` | text | YES |  |
| `accessory_1_price` | numeric | YES | 0 |
| `accessory_2_desc` | text | YES |  |
| `accessory_2_price` | numeric | YES | 0 |
| `accessory_3_desc` | text | YES |  |
| `accessory_3_price` | numeric | YES | 0 |
| `docs_generated` | text[] | YES |  |
| `signing_status` | text | YES | not_sent |
| `docs_generated_at` | timestamp with time zone | YES |  |
| `customer_email` | text | YES |  |
| `customer_phone` | text | YES |  |
| `purchaser_dl` | text | YES |  |
| `purchaser_dl_state` | text | YES |  |
| `purchaser_dob` | date | YES |  |
| `trade_year` | integer | YES |  |
| `trade_make` | text | YES |  |
| `trade_model` | text | YES |  |
| `lienholder_name` | text | YES |  |
| `lienholder_address` | text | YES |  |
| `lienholder_city` | text | YES |  |
| `lienholder_state` | text | YES |  |
| `lienholder_zip` | text | YES |  |
| `co_buyer_name` | text | YES |  |
| `co_buyer_address` | text | YES |  |
| `co_buyer_city` | text | YES |  |
| `co_buyer_state` | text | YES |  |
| `co_buyer_zip` | text | YES |  |
| `co_buyer_phone` | text | YES |  |
| `co_buyer_email` | text | YES |  |
| `co_buyer_dl_number` | text | YES |  |

## deal_activity

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `deal_id` | integer | YES |  |
| `dealer_id` | integer | YES |  |
| `action` | text | NO |  |
| `description` | text | YES |  |
| `user_name` | text | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

## deal_documents

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | extensions.uuid_generate_v4() |
| `deal_id` | uuid | YES |  |
| `template_id` | uuid | YES |  |
| `business_id` | uuid | YES |  |
| `document_name` | text | NO |  |
| `document_code` | text | YES |  |
| `html_content` | text | YES |  |
| `pdf_url` | text | YES |  |
| `pdf_storage_path` | text | YES |  |
| `status` | text | YES | draft |
| `requires_signature` | boolean | YES | false |
| `buyer_signed_at` | timestamp with time zone | YES |  |
| `buyer_signature_url` | text | YES |  |
| `seller_signed_at` | timestamp with time zone | YES |  |
| `seller_signature_url` | text | YES |  |
| `dealer_signed_at` | timestamp with time zone | YES |  |
| `dealer_signature_url` | text | YES |  |
| `esign_envelope_id` | text | YES |  |
| `esign_status` | text | YES |  |
| `filed_at` | timestamp with time zone | YES |  |
| `filed_by` | uuid | YES |  |
| `confirmation_number` | text | YES |  |
| `generated_at` | timestamp with time zone | YES | now() |
| `generated_by` | uuid | YES |  |
| `created_at` | timestamp with time zone | YES | now() |
| `updated_at` | timestamp with time zone | YES | now() |

## document_packages (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `dealer_id` | integer | YES |  |
| `deal_type` | text | NO |  |
| `docs` | text[] | NO |  |
| `created_at` | timestamp with time zone | YES | now() |
| `form_ids` | jsonb | YES |  |
| `state` | text | YES |  |
| `updated_at` | timestamp with time zone | YES | now() |

## dealer_document_packages

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `dealer_id` | integer | YES |  |
| `deal_type` | text | NO |  |
| `form_numbers` | text[] | NO |  |
| `custom_additions` | text[] | YES |  |
| `custom_removals` | text[] | YES |  |
| `created_at` | timestamp with time zone | YES | now() |
| `updated_at` | timestamp with time zone | YES | now() |

## document_rules

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `dealer_id` | integer | YES |  |
| `form_id` | integer | YES |  |
| `trigger_event` | text | NO |  |
| `deal_types` | text[] | YES |  |
| `conditions` | jsonb | YES |  |
| `is_required` | boolean | YES | true |
| `auto_include` | boolean | YES | true |
| `sort_order` | integer | YES | 0 |
| `created_at` | timestamp with time zone | YES | now() |

## document_templates

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | extensions.uuid_generate_v4() |
| `name` | text | NO |  |
| `code` | text | NO |  |
| `state_code` | text | YES |  |
| `document_type` | text | NO |  |
| `category` | text | NO |  |
| `required_for` | text[] | YES |  |
| `is_required` | boolean | YES | true |
| `html_template` | text | YES |  |
| `css_styles` | text | YES |  |
| `field_mappings` | jsonb | YES |  |
| `page_size` | text | YES | letter |
| `orientation` | text | YES | portrait |
| `margins` | jsonb | YES |  |
| `signature_fields` | jsonb | YES |  |
| `version` | text | YES | 1.0 |
| `effective_date` | date | YES |  |
| `supersedes_template_id` | uuid | YES |  |
| `is_active` | boolean | YES | true |
| `created_at` | timestamp with time zone | YES | now() |
| `updated_at` | timestamp with time zone | YES | now() |

## generated_documents (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | gen_random_uuid() |
| `deal_id` | integer | YES |  |
| `dealer_id` | integer | YES |  |
| `form_library_id` | uuid | YES |  |
| `form_number` | text | NO |  |
| `form_name` | text | NO |  |
| `state` | text | NO |  |
| `storage_bucket` | text | YES | generated-documents |
| `storage_path` | text | NO |  |
| `public_url` | text | YES |  |
| `file_size_bytes` | integer | YES |  |
| `field_values_used` | jsonb | YES |  |
| `generated_at` | timestamp with time zone | YES | now() |
| `generated_by` | text | YES |  |
| `generation_method` | text | YES | pdf-lib |
| `signature_status` | text | YES | not_sent |
| `signature_provider` | text | YES |  |
| `signature_request_id` | text | YES |  |
| `signature_sent_at` | timestamp with time zone | YES |  |
| `signature_completed_at` | timestamp with time zone | YES |  |
| `signer_email` | text | YES |  |
| `signer_ip` | text | YES |  |
| `submitted_to_agency` | boolean | YES | false |
| `submitted_at` | timestamp with time zone | YES |  |
| `confirmation_number` | text | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

# BHPH / Financing

## bhph_loans (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `vehicle_id` | text | YES |  |
| `client_name` | text | NO |  |
| `term_months` | integer | YES |  |
| `interest_rate` | numeric | YES |  |
| `purchase_price` | numeric | YES |  |
| `down_payment` | numeric | YES |  |
| `monthly_payment` | numeric | YES |  |
| `balance` | numeric | YES |  |
| `status` | text | YES | Active |
| `created_at` | timestamp with time zone | YES | now() |
| `customer_id` | integer | YES |  |
| `first_payment_date` | date | YES |  |
| `next_payment_date` | date | YES |  |
| `payments_made` | integer | YES | 0 |
| `payments_remaining` | integer | YES |  |
| `dealer_id` | integer | YES |  |

## bhph_payments (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | extensions.uuid_generate_v4() |
| `contract_id` | uuid | YES |  |
| `payment_date` | date | YES |  |
| `amount` | numeric | YES |  |
| `principal` | numeric | YES |  |
| `interest` | numeric | YES |  |
| `late_fee` | numeric | YES | 0 |
| `payment_method` | text | YES |  |
| `notes` | text | YES |  |
| `created_at` | timestamp with time zone | YES | now() |
| `dealer_id` | integer | YES |  |
| `loan_id` | integer | YES |  |
| `method` | text | YES | Cash |
| `payment_type` | text | YES | Regular |

## bhph_contracts

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | extensions.uuid_generate_v4() |
| `business_id` | uuid | YES |  |
| `deal_id` | uuid | YES |  |
| `inventory_id` | uuid | YES |  |
| `customer_name` | text | NO |  |
| `contact_info` | text | YES |  |
| `term_months` | integer | YES |  |
| `interest_rate` | numeric | YES |  |
| `purchase_price` | numeric | YES |  |
| `down_payment` | numeric | YES |  |
| `amount_financed` | numeric | YES |  |
| `monthly_payment` | numeric | YES |  |
| `first_payment_date` | date | YES |  |
| `status` | text | YES | Active |
| `balance_remaining` | numeric | YES |  |
| `created_at` | timestamp with time zone | YES | now() |
| `updated_at` | timestamp with time zone | YES | now() |

## payments

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `loan_id` | integer | YES |  |
| `customer_id` | integer | YES |  |
| `vehicle_id` | text | YES |  |
| `amount` | numeric | NO |  |
| `payment_date` | date | NO |  |
| `due_date` | date | YES |  |
| `method` | text | YES | Cash |
| `status` | text | YES | Completed |
| `late_fee` | numeric | YES | 0 |
| `notes` | text | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

## financing_settings

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | extensions.uuid_generate_v4() |
| `business_id` | uuid | YES |  |
| `setting_name` | text | NO |  |
| `financing_type` | text | YES |  |
| `interest_rate` | numeric | YES |  |
| `credit_line_amount` | numeric | YES |  |
| `lender_name` | text | YES |  |
| `account_number` | text | YES |  |
| `contact_name` | text | YES |  |
| `contact_phone` | text | YES |  |
| `contact_email` | text | YES |  |
| `notes` | text | YES |  |
| `active` | boolean | YES | true |
| `created_at` | timestamp with time zone | YES | now() |

# Forms Pipeline

## form_staging (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | gen_random_uuid() |
| `state` | text | NO |  |
| `form_number` | text | YES |  |
| `form_name` | text | NO |  |
| `source_url` | text | YES |  |
| `source_agency` | text | YES |  |
| `download_url` | text | YES |  |
| `version_string` | text | YES |  |
| `version_date` | date | YES |  |
| `storage_bucket` | text | YES | form-staging |
| `storage_path` | text | YES |  |
| `file_size_bytes` | integer | YES |  |
| `page_count` | integer | YES |  |
| `is_fillable` | boolean | YES |  |
| `fillable_field_count` | integer | YES |  |
| `extracted_field_names` | jsonb | YES |  |
| `ai_analysis` | jsonb | YES |  |
| `ai_is_current_version` | boolean | YES |  |
| `ai_confidence` | numeric | YES |  |
| `ai_notes` | text | YES |  |
| `status` | text | YES | pending |
| `rejection_reason` | text | YES |  |
| `discovered_at` | timestamp with time zone | YES | now() |
| `analyzed_at` | timestamp with time zone | YES |  |
| `promoted_at` | timestamp with time zone | YES |  |
| `created_at` | timestamp with time zone | YES | now() |
| `detected_fields` | jsonb | YES |  |
| `field_mapping` | jsonb | YES |  |
| `mapping_confidence` | integer | YES | 0 |
| `form_type` | text | YES |  |
| `doc_type` | text | YES | deal |
| `has_deadline` | boolean | YES | false |
| `deadline_days` | integer | YES |  |
| `deadline_description` | text | YES |  |
| `cadence` | text | YES |  |
| `compliance_notes` | text | YES |  |
| `html_template_url` | text | YES |  |
| `template_status` | text | YES | none |
| `workflow_status` | text | YES | staging |
| `url_validated` | boolean | YES | false |
| `url_validated_at` | timestamp with time zone | YES |  |
| `url_error` | text | YES |  |
| `description` | text | YES |  |
| `pdf_validated` | boolean | YES | false |
| `category` | text | YES |  |
| `ai_discovered` | boolean | YES | true |
| `last_verified` | date | YES |  |
| `required_for` | text[] | YES |  |
| `issuing_authority` | text | YES |  |
| `frequency` | text | YES |  |
| `dealer_id` | integer | YES |  |
| `deadline_info` | text | YES |  |
| `field_mappings` | jsonb | YES |  |
| `deal_types` | text[] | YES |  |
| `is_primary` | boolean | YES | false |
| `mapping_status` | text | YES | pending |
| `form_number_confirmed` | boolean | YES | false |
| `dismissed_fields` | jsonb | YES |  |

## form_library (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | gen_random_uuid() |
| `state` | text | NO |  |
| `form_number` | text | NO |  |
| `form_name` | text | NO |  |
| `category` | text | NO | compliance |
| `required_for_deal_types` | text[] | YES |  |
| `source_agency` | text | NO |  |
| `source_url` | text | YES |  |
| `version_string` | text | YES |  |
| `version_date` | date | YES |  |
| `effective_date` | date | YES |  |
| `storage_bucket` | text | YES | form-library |
| `storage_path` | text | NO |  |
| `file_size_bytes` | integer | YES |  |
| `page_count` | integer | YES |  |
| `is_fillable` | boolean | YES | true |
| `fillable_field_count` | integer | YES |  |
| `field_mapping` | jsonb | NO |  |
| `mapping_confidence` | integer | YES | 0 |
| `mapping_status` | text | YES | pending |
| `mapping_reviewed_by` | text | YES |  |
| `mapping_reviewed_at` | timestamp with time zone | YES |  |
| `linked_rule_ids` | uuid[] | YES |  |
| `submission_deadline_days` | integer | YES |  |
| `late_fee` | numeric | YES |  |
| `county` | text | YES |  |
| `status` | text | YES | active |
| `staging_id` | uuid | YES |  |
| `last_version_check` | timestamp with time zone | YES |  |
| `created_at` | timestamp with time zone | YES | now() |
| `updated_at` | timestamp with time zone | YES | now() |
| `detected_fields` | jsonb | YES |  |
| `is_active` | boolean | YES | true |
| `description` | text | YES |  |
| `download_url` | text | YES |  |
| `field_mappings` | jsonb | YES |  |
| `promoted_from` | uuid | YES |  |

## form_registry (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | gen_random_uuid() |
| `state` | character varying(2) | NO |  |
| `form_number` | character varying(50) | YES |  |
| `form_name` | character varying(255) | NO |  |
| `category` | character varying(50) | YES | deal |
| `required_for` | text[] | YES |  |
| `description` | text | YES |  |
| `source_url` | text | YES |  |
| `download_url` | text | YES |  |
| `is_gov_source` | boolean | YES | false |
| `is_fillable` | boolean | YES | false |
| `detected_fields` | jsonb | YES |  |
| `field_mappings` | jsonb | YES |  |
| `mapping_confidence` | integer | YES | 0 |
| `ai_discovered` | boolean | YES | false |
| `ai_confidence` | numeric | YES | 0 |
| `status` | character varying(20) | YES | pending |
| `last_verified_at` | timestamp with time zone | YES |  |
| `created_at` | timestamp with time zone | YES | now() |
| `updated_at` | timestamp with time zone | YES | now() |
| `dealer_id` | integer | YES |  |
| `storage_bucket` | character varying(100) | YES |  |
| `storage_path` | character varying(500) | YES |  |

## form_templates

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `form_registry_id` | integer | YES |  |
| `dealer_id` | integer | YES |  |
| `template_url` | text | YES |  |
| `field_mapping` | jsonb | YES |  |
| `is_custom` | boolean | YES | false |
| `version` | text | YES | 1.0 |
| `created_at` | timestamp with time zone | YES | now() |

## master_forms

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `state` | text | NO |  |
| `form_number` | text | NO |  |
| `form_name` | text | NO |  |
| `category` | text | NO |  |
| `deal_types` | text[] | YES |  |
| `storage_path` | text | NO |  |
| `field_mapping` | jsonb | NO |  |
| `deadline_days` | integer | YES |  |
| `deadline_description` | text | YES |  |
| `penalty_description` | text | YES |  |
| `source_url` | text | YES |  |
| `last_verified` | date | YES |  |
| `is_active` | boolean | YES | true |
| `sort_order` | integer | YES | 0 |
| `created_at` | timestamp with time zone | YES | now() |
| `updated_at` | timestamp with time zone | YES | now() |

## shared_form_mappings

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `state` | text | NO |  |
| `form_name` | text | NO |  |
| `form_number` | text | YES |  |
| `field_mappings` | jsonb | NO |  |
| `pdf_fields_count` | integer | YES |  |
| `mapped_fields_count` | integer | YES |  |
| `unmapped_fields` | jsonb | YES |  |
| `verified_by_dealer_id` | uuid | YES |  |
| `verified_at` | timestamp with time zone | YES |  |
| `verification_notes` | text | YES |  |
| `usage_count` | integer | YES | 0 |
| `last_used_at` | timestamp with time zone | YES |  |
| `created_at` | timestamp with time zone | YES | now() |
| `updated_at` | timestamp with time zone | YES | now() |

## universal_fields

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `field_key` | text | NO |  |
| `field_label` | text | NO |  |
| `field_type` | text | NO |  |
| `category` | text | NO |  |
| `source_table` | text | YES |  |
| `source_column` | text | YES |  |
| `description` | text | YES |  |
| `format_hint` | text | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

# State & Compliance

## state_metadata

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `state_code` | text | NO |  |
| `state_name` | text | NO |  |
| `dmv_name` | text | YES |  |
| `dmv_url` | text | YES |  |
| `dmv_forms_url` | text | YES |  |
| `tax_authority_name` | text | YES |  |
| `tax_authority_url` | text | YES |  |
| `title_work_deadline_days` | integer | YES |  |
| `temp_tag_validity_days` | integer | YES |  |
| `sales_tax_filing` | text | YES |  |
| `forms_discovery_status` | text | YES | not_started |
| `forms_verified_count` | integer | YES | 0 |
| `forms_pending_count` | integer | YES | 0 |
| `forms_needs_form_number_count` | integer | YES | 0 |
| `last_discovery_at` | timestamp with time zone | YES |  |
| `created_at` | timestamp with time zone | YES | now() |
| `updated_at` | timestamp with time zone | YES | now() |

## state_configurations

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `state` | text | NO |  |
| `state_name` | text | NO |  |
| `cash_package` | text[] | NO |  |
| `bhph_package` | text[] | NO |  |
| `financing_package` | text[] | NO |  |
| `wholesale_package` | text[] | NO |  |
| `sales_tax_rate` | numeric | YES |  |
| `title_fee` | numeric | YES |  |
| `registration_fee` | numeric | YES |  |
| `doc_fee_cap` | numeric | YES |  |
| `title_deadline_days` | integer | YES | 45 |
| `is_active` | boolean | YES | true |
| `created_at` | timestamp with time zone | YES | now() |

## state_compliance

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `state` | text | NO |  |
| `requirement_type` | text | NO |  |
| `name` | text | NO |  |
| `frequency` | text | YES |  |
| `due_day` | integer | YES |  |
| `form_number` | text | YES |  |
| `notes` | text | YES |  |
| `is_active` | boolean | YES | true |
| `penalty_amount` | numeric | YES |  |

## state_compliance_rules

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | extensions.uuid_generate_v4() |
| `state_code` | text | NO |  |
| `state_name` | text | NO |  |
| `base_sales_tax_rate` | numeric | YES |  |
| `has_county_tax` | boolean | YES | false |
| `has_city_tax` | boolean | YES | false |
| `tax_on_trade_difference` | boolean | YES | true |
| `max_trade_in_credit` | numeric | YES |  |
| `doc_fee_cap` | numeric | YES |  |
| `doc_fee_must_disclose` | boolean | YES | true |
| `title_fee` | numeric | YES |  |
| `registration_base_fee` | numeric | YES |  |
| `temp_permit_fee` | numeric | YES |  |
| `bhph_max_apr` | numeric | YES |  |
| `bhph_late_fee_cap` | numeric | YES |  |
| `bhph_late_fee_pct_cap` | numeric | YES |  |
| `bhph_right_to_cure_days` | integer | YES |  |
| `bhph_repo_notice_required` | boolean | YES | true |
| `bhph_repo_notice_days` | integer | YES |  |
| `title_submission_days` | integer | YES | 45 |
| `temp_permit_validity_days` | integer | YES | 45 |
| `required_deal_documents` | jsonb | YES |  |
| `required_bhph_documents` | jsonb | YES |  |
| `required_trade_documents` | jsonb | YES |  |
| `sales_tax_frequency` | text | YES | monthly |
| `sales_tax_due_day` | integer | YES | 25 |
| `dmv_website` | text | YES |  |
| `tax_website` | text | YES |  |
| `dealer_board_website` | text | YES |  |
| `notes` | text | YES |  |
| `last_updated` | date | YES | CURRENT_DATE |
| `is_active` | boolean | YES | true |

## state_form_requirements

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `state` | text | NO |  |
| `deal_type` | text | NO |  |
| `form_name` | text | NO |  |
| `is_primary` | boolean | YES | false |
| `is_required` | boolean | YES | true |
| `display_order` | integer | YES | 100 |
| `notes` | text | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

## state_form_coverage

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `state_code` | text | YES |  |
| `state_name` | text | YES |  |
| `dmv_name` | text | YES |  |
| `dmv_forms_url` | text | YES |  |
| `forms_discovery_status` | text | YES |  |
| `last_discovery_at` | timestamp with time zone | YES |  |
| `total_forms` | bigint | YES |  |
| `forms_with_confirmed_number` | bigint | YES |  |
| `forms_needing_number` | bigint | YES |  |
| `forms_with_mapping` | bigint | YES |  |
| `verified_forms` | bigint | YES |  |
| `production_forms` | bigint | YES |  |
| `form_number_coverage_pct` | numeric | YES |  |
| `verified_coverage_pct` | numeric | YES |  |
| `status_summary` | text | YES |  |

## state_updates (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `state` | text | NO |  |
| `title` | text | NO |  |
| `summary` | text | YES |  |
| `update_type` | text | YES |  |
| `source_url` | text | YES |  |
| `source_name` | text | YES |  |
| `form_numbers` | text[] | YES |  |
| `effective_date` | date | YES |  |
| `posted_by` | text | YES |  |
| `created_at` | timestamp with time zone | YES | now() |
| `is_read` | boolean | YES | false |
| `importance` | text | YES | normal |
| `forms_affected` | text[] | YES |  |

## compliance_rules (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | gen_random_uuid() |
| `state` | text | NO |  |
| `agency_name` | text | NO |  |
| `agency_type` | text | NO | dmv |
| `category` | text | NO |  |
| `rule_name` | text | NO |  |
| `rule_description` | text | NO |  |
| `required_forms` | text[] | YES |  |
| `applies_to_deal_types` | text[] | YES |  |
| `deadline_days` | integer | YES |  |
| `late_fee` | numeric | YES |  |
| `penalty_description` | text | YES |  |
| `source_url` | text | YES |  |
| `source_text` | text | YES |  |
| `county` | text | YES |  |
| `ai_confidence` | numeric | YES |  |
| `ai_research_notes` | text | YES |  |
| `status` | text | YES | active |
| `last_verified_at` | timestamp with time zone | YES |  |
| `created_at` | timestamp with time zone | YES | now() |
| `updated_at` | timestamp with time zone | YES | now() |
| `filing_cadence` | text | YES | per_transaction |
| `deadline_description` | text | YES |  |
| `reminder_days_before` | integer | YES | 7 |
| `ai_discovered` | boolean | YES | false |

## compliance_alerts

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | extensions.uuid_generate_v4() |
| `business_id` | uuid | YES |  |
| `alert_type` | text | NO |  |
| `severity` | text | YES | info |
| `title` | text | NO |  |
| `message` | text | YES |  |
| `action_url` | text | YES |  |
| `action_label` | text | YES |  |
| `related_type` | text | YES |  |
| `related_id` | uuid | YES |  |
| `trigger_date` | date | YES |  |
| `due_date` | date | YES |  |
| `is_read` | boolean | YES | false |
| `read_at` | timestamp with time zone | YES |  |
| `is_dismissed` | boolean | YES | false |
| `dismissed_at` | timestamp with time zone | YES |  |
| `dismissed_by` | uuid | YES |  |
| `is_resolved` | boolean | YES | false |
| `resolved_at` | timestamp with time zone | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

## compliance_tasks

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `dealer_id` | integer | YES |  |
| `deal_id` | integer | YES |  |
| `compliance_id` | integer | YES |  |
| `task_name` | text | NO |  |
| `due_date` | date | NO |  |
| `completed_date` | date | YES |  |
| `status` | text | YES | pending |
| `notes` | text | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

## tax_jurisdictions

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | extensions.uuid_generate_v4() |
| `state_code` | text | NO |  |
| `county_name` | text | YES |  |
| `county_fips` | text | YES |  |
| `city_name` | text | YES |  |
| `zip_codes` | text[] | YES |  |
| `state_rate` | numeric | YES |  |
| `county_rate` | numeric | YES | 0 |
| `city_rate` | numeric | YES | 0 |
| `special_district_rate` | numeric | YES | 0 |
| `total_rate` | numeric | YES |  |
| `effective_date` | date | YES |  |
| `expiration_date` | date | YES |  |
| `is_active` | boolean | YES | true |
| `created_at` | timestamp with time zone | YES | now() |

## utah_fees

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `fee_type` | text | NO |  |
| `category` | text | YES |  |
| `county_state` | text | YES |  |
| `value` | numeric | YES |  |
| `effective_date` | date | YES |  |
| `notes` | text | YES |  |

## reporting_requirements

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | extensions.uuid_generate_v4() |
| `state_code` | text | NO |  |
| `report_name` | text | NO |  |
| `report_code` | text | NO |  |
| `report_type` | text | NO |  |
| `frequency` | text | NO |  |
| `due_day` | integer | YES |  |
| `due_months` | integer[] | YES |  |
| `grace_period_days` | integer | YES | 0 |
| `form_number` | text | YES |  |
| `form_name` | text | YES |  |
| `form_url` | text | YES |  |
| `filing_url` | text | YES |  |
| `late_penalty_description` | text | YES |  |
| `late_penalty_flat` | numeric | YES |  |
| `late_penalty_pct` | numeric | YES |  |
| `applies_to` | text[] | YES |  |
| `is_mandatory` | boolean | YES | true |
| `description` | text | YES |  |
| `instructions` | text | YES |  |
| `data_needed` | jsonb | YES |  |
| `is_active` | boolean | YES | true |
| `created_at` | timestamp with time zone | YES | now() |

## dealer_reports

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | extensions.uuid_generate_v4() |
| `business_id` | uuid | YES |  |
| `requirement_id` | uuid | YES |  |
| `period_label` | text | YES |  |
| `period_start` | date | YES |  |
| `period_end` | date | YES |  |
| `due_date` | date | YES |  |
| `status` | text | YES | upcoming |
| `report_data` | jsonb | YES |  |
| `pdf_url` | text | YES |  |
| `pdf_storage_path` | text | YES |  |
| `filed_at` | timestamp with time zone | YES |  |
| `filed_by` | uuid | YES |  |
| `confirmation_number` | text | YES |  |
| `filing_notes` | text | YES |  |
| `reminder_7_day_sent` | boolean | YES | false |
| `reminder_3_day_sent` | boolean | YES | false |
| `reminder_1_day_sent` | boolean | YES | false |
| `reminder_overdue_sent` | boolean | YES | false |
| `created_at` | timestamp with time zone | YES | now() |
| `updated_at` | timestamp with time zone | YES | now() |

# Document Automation

## dealer_automation_rules

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | bigint | NO |  |
| `dealer_id` | bigint | NO |  |
| `rule_type` | text | NO |  |
| `trigger_event` | text | NO |  |
| `action_type` | text | NO |  |
| `config` | jsonb | YES |  |
| `is_enabled` | boolean | YES | true |
| `created_at` | timestamp with time zone | YES | now() |
| `updated_at` | timestamp with time zone | YES | now() |

## esignature_settings

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `dealer_id` | integer | NO |  |
| `provider` | text | YES | docuseal |
| `api_key` | text | YES |  |
| `api_secret` | text | YES |  |
| `webhook_url` | text | YES |  |
| `is_active` | boolean | YES | false |
| `created_at` | timestamp with time zone | YES | now() |
| `updated_at` | timestamp with time zone | YES | now() |

# Employees & Payroll

## employees (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `name` | text | NO |  |
| `active` | boolean | YES | true |
| `roles` | text[] | YES |  |
| `created_at` | timestamp with time zone | YES | now() |
| `dealer_id` | integer | YES |  |
| `hourly_rate` | numeric | YES | 0 |
| `job_title` | text | YES |  |
| `email` | text | YES |  |
| `phone` | text | YES |  |
| `address` | text | YES |  |
| `city` | text | YES |  |
| `state` | text | YES |  |
| `zip` | text | YES |  |
| `ssn_last4` | text | YES |  |
| `date_of_birth` | date | YES |  |
| `hire_date` | date | YES |  |
| `pay_type` | text[] | YES |  |
| `salary` | numeric | YES | 0 |
| `tax_filing_status` | text | YES |  |
| `federal_allowances` | integer | YES | 0 |
| `state_allowances` | integer | YES | 0 |
| `direct_deposit_account` | text | YES |  |
| `direct_deposit_routing` | text | YES |  |
| `emergency_contact_name` | text | YES |  |
| `emergency_contact_phone` | text | YES |  |
| `notes` | text | YES |  |
| `pto_days_per_year` | numeric | YES | 10 |
| `pto_accrued` | numeric | YES | 0 |
| `pto_used` | numeric | YES | 0 |
| `pto_accrual_start` | date | YES |  |
| `is_developer` | boolean | YES | false |
| `is_admin` | boolean | YES | false |

## employee_documents (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | gen_random_uuid() |
| `employee_id` | integer | YES |  |
| `document_type` | text | NO |  |
| `document_name` | text | YES |  |
| `file_url` | text | YES |  |
| `status` | text | YES | pending |
| `submitted_at` | timestamp with time zone | YES |  |
| `verified_at` | timestamp with time zone | YES |  |
| `verified_by` | text | YES |  |
| `notes` | text | YES |  |
| `dealer_id` | integer | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

## time_clock (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `employee_id` | integer | NO |  |
| `clock_in` | timestamp with time zone | NO |  |
| `clock_out` | timestamp with time zone | YES |  |
| `total_hours` | numeric | YES |  |
| `clock_in_lat` | numeric | YES |  |
| `clock_in_lng` | numeric | YES |  |
| `clock_in_address` | text | YES |  |
| `clock_out_lat` | numeric | YES |  |
| `clock_out_lng` | numeric | YES |  |
| `clock_out_address` | text | YES |  |
| `lunch_start` | timestamp with time zone | YES |  |
| `lunch_end` | timestamp with time zone | YES |  |
| `paid` | boolean | YES | false |
| `dealer_id` | integer | NO |  |
| `created_at` | timestamp with time zone | YES | now() |

## time_off_requests (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `employee_id` | integer | NO |  |
| `start_date` | date | NO |  |
| `end_date` | date | NO |  |
| `days_requested` | numeric | NO |  |
| `request_type` | text | YES | pto |
| `reason` | text | YES |  |
| `status` | text | YES | pending |
| `approved_by` | integer | YES |  |
| `approved_at` | timestamp with time zone | YES |  |
| `admin_notes` | text | YES |  |
| `created_at` | timestamp with time zone | YES | now() |
| `dealer_id` | integer | NO |  |

## payroll

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | extensions.uuid_generate_v4() |
| `employee_id` | uuid | YES |  |
| `pay_period_start` | date | YES |  |
| `pay_period_end` | date | YES |  |
| `total_commissions` | numeric | YES | 0 |
| `total_hours` | numeric | YES | 0 |
| `hourly_rate` | numeric | YES | 0 |
| `hourly_pay` | numeric | YES | 0 |
| `bonuses` | numeric | YES | 0 |
| `deductions` | numeric | YES | 0 |
| `total_pay` | numeric | YES |  |
| `payment_date` | date | YES |  |
| `payment_method` | text | YES |  |
| `status` | text | YES | Draft |
| `notes` | text | YES |  |
| `created_at` | timestamp with time zone | YES | now() |
| `dealer_id` | integer | YES |  |

## payroll_runs (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `pay_period_start` | date | NO |  |
| `pay_period_end` | date | NO |  |
| `pay_date` | date | NO |  |
| `employee_count` | integer | YES |  |
| `total_gross` | numeric | YES |  |
| `total_net` | numeric | YES |  |
| `status` | text | YES | draft |
| `exported_at` | timestamp with time zone | YES |  |
| `created_at` | timestamp with time zone | YES | now() |
| `dealer_id` | integer | NO |  |

## paystubs (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `employee_id` | integer | NO |  |
| `pay_period_start` | date | NO |  |
| `pay_period_end` | date | NO |  |
| `pay_date` | date | NO |  |
| `regular_hours` | numeric | YES | 0 |
| `overtime_hours` | numeric | YES | 0 |
| `pto_hours_used` | numeric | YES | 0 |
| `hourly_rate` | numeric | YES |  |
| `salary_amount` | numeric | YES |  |
| `gross_pay` | numeric | NO |  |
| `federal_tax` | numeric | YES | 0 |
| `state_tax` | numeric | YES | 0 |
| `social_security` | numeric | YES | 0 |
| `medicare` | numeric | YES | 0 |
| `other_deductions` | numeric | YES | 0 |
| `net_pay` | numeric | NO |  |
| `status` | text | YES | generated |
| `notes` | text | YES |  |
| `created_at` | timestamp with time zone | YES | now() |
| `dealer_id` | integer | NO |  |

# Books & Expenses

## bank_accounts (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `dealer_id` | integer | YES |  |
| `plaid_account_id` | text | YES |  |
| `account_name` | text | YES |  |
| `account_type` | text | YES |  |
| `last_four` | text | YES |  |
| `current_balance` | numeric | YES |  |
| `access_token` | text | YES |  |
| `institution_name` | text | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

## bank_transactions (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `plaid_transaction_id` | text | YES |  |
| `bank_account_id` | integer | YES |  |
| `transaction_date` | date | NO |  |
| `amount` | numeric | NO |  |
| `merchant_name` | text | YES |  |
| `plaid_category` | text[] | YES |  |
| `plaid_category_id` | text | YES |  |
| `category_id` | integer | YES |  |
| `ai_suggested_category_id` | integer | YES |  |
| `ai_confidence` | numeric | YES |  |
| `matched_expense_id` | integer | YES |  |
| `match_confidence` | numeric | YES |  |
| `status` | text | YES | inbox |
| `is_income` | boolean | YES | false |
| `notes` | text | YES |  |
| `dealer_id` | integer | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

## manual_expenses (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `description` | text | NO |  |
| `amount` | numeric | NO |  |
| `expense_date` | date | NO |  |
| `vendor` | text | YES |  |
| `category_id` | integer | YES |  |
| `source_type` | text | YES | manual |
| `inventory_id` | text | YES |  |
| `receipt_url` | text | YES |  |
| `receipt_data` | jsonb | YES |  |
| `ai_extracted` | boolean | YES | false |
| `matched_transaction_id` | integer | YES |  |
| `status` | text | YES | pending |
| `notes` | text | YES |  |
| `created_by` | text | YES |  |
| `dealer_id` | integer | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

## expense_categories (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `name` | text | NO |  |
| `icon` | text | YES | 📁 |
| `color` | text | YES | #6b7280 |
| `type` | text | YES | expense |
| `tax_deductible` | boolean | YES | false |
| `parent_category_id` | integer | YES |  |
| `sort_order` | integer | YES | 0 |
| `active` | boolean | YES | true |
| `dealer_id` | integer | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

## categories

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `dealer_id` | integer | YES |  |
| `name` | text | YES |  |
| `type` | text | YES |  |
| `color` | text | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

## assets (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `name` | text | NO |  |
| `asset_type` | text | NO |  |
| `purchase_date` | date | YES |  |
| `purchase_price` | numeric | YES |  |
| `current_value` | numeric | YES |  |
| `depreciation_rate` | numeric | YES | 0 |
| `notes` | text | YES |  |
| `status` | text | YES | active |
| `dealer_id` | integer | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

## liabilities (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `name` | text | NO |  |
| `liability_type` | text | NO |  |
| `original_amount` | numeric | YES |  |
| `current_balance` | numeric | YES |  |
| `interest_rate` | numeric | YES |  |
| `monthly_payment` | numeric | YES |  |
| `due_date` | integer | YES |  |
| `lender` | text | YES |  |
| `notes` | text | YES |  |
| `status` | text | YES | active |
| `dealer_id` | integer | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

## plaid_transactions

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | extensions.uuid_generate_v4() |
| `business_id` | uuid | YES |  |
| `bank_account_id` | uuid | YES |  |
| `plaid_transaction_id` | text | YES |  |
| `date` | date | YES |  |
| `amount` | numeric | YES |  |
| `name` | text | YES |  |
| `plaid_category` | text[] | YES |  |
| `pending` | boolean | YES | false |
| `matched_inventory_id` | uuid | YES |  |
| `category_id` | uuid | YES |  |
| `imported` | boolean | YES | false |
| `notes` | text | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

## transactions

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `dealer_id` | integer | YES |  |
| `bank_account_id` | integer | YES |  |
| `plaid_transaction_id` | text | YES |  |
| `date` | date | YES |  |
| `amount` | numeric | YES |  |
| `vendor` | text | YES |  |
| `plaid_category` | text | YES |  |
| `user_category` | text | YES |  |
| `status` | text | YES | uncategorized |
| `created_at` | timestamp with time zone | YES | now() |

## saved_reports (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `dealer_id` | integer | YES |  |
| `name` | text | NO |  |
| `data_source` | text | NO |  |
| `fields` | text[] | YES |  |
| `group_by` | text | YES |  |
| `sort_by` | text | YES |  |
| `sort_dir` | text | YES | desc |
| `created_by` | integer | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

# Communication

## message_templates (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `name` | text | NO |  |
| `type` | text | YES |  |
| `subject` | text | YES |  |
| `body` | text | NO |  |
| `variables` | text[] | YES |  |
| `active` | boolean | YES | true |
| `dealer_id` | integer | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

## message_history

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `type` | text | YES |  |
| `recipient` | text | YES |  |
| `customer_id` | integer | YES |  |
| `template_id` | integer | YES |  |
| `subject` | text | YES |  |
| `body` | text | YES |  |
| `status` | text | YES | sent |
| `dealer_id` | integer | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

## feedback (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `dealer_id` | integer | YES |  |
| `user_name` | text | YES |  |
| `type` | text | YES | feedback |
| `message` | text | NO |  |
| `page` | text | YES |  |
| `status` | text | YES | new |
| `created_at` | timestamp with time zone | YES | now() |

## announcements

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `title` | text | NO |  |
| `message` | text | NO |  |
| `type` | text | YES | info |
| `active` | boolean | YES | true |
| `show_until` | timestamp with time zone | YES |  |
| `dealer_id` | integer | YES |  |
| `created_by` | integer | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

# AI & Research

## ai_conversations

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | extensions.uuid_generate_v4() |
| `business_id` | uuid | YES |  |
| `user_id` | uuid | YES |  |
| `messages` | jsonb | YES |  |
| `context_type` | text | YES |  |
| `context_id` | uuid | YES |  |
| `is_active` | boolean | YES | true |
| `created_at` | timestamp with time zone | YES | now() |
| `updated_at` | timestamp with time zone | YES | now() |

## ai_research_log

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | gen_random_uuid() |
| `research_type` | text | NO |  |
| `state` | text | YES |  |
| `form_number` | text | YES |  |
| `prompt_used` | text | YES |  |
| `ai_response` | jsonb | YES |  |
| `ai_model` | text | YES | claude-sonnet-4-20250514 |
| `success` | boolean | YES |  |
| `error_message` | text | YES |  |
| `items_found` | integer | YES |  |
| `items_added` | integer | YES |  |
| `started_at` | timestamp with time zone | YES | now() |
| `completed_at` | timestamp with time zone | YES |  |
| `triggered_by` | text | YES |  |

# System

## audit_log (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `action` | text | NO |  |
| `table_name` | text | YES |  |
| `record_id` | text | YES |  |
| `old_data` | jsonb | YES |  |
| `new_data` | jsonb | YES |  |
| `user_id` | integer | YES |  |
| `user_name` | text | YES |  |
| `ip_address` | text | YES |  |
| `dealer_id` | integer | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

## api_keys

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `service_name` | text | NO |  |
| `key_name` | text | YES |  |
| `api_key` | text | YES |  |
| `api_secret` | text | YES |  |
| `environment` | text | YES | production |
| `status` | text | YES | active |
| `last_used` | timestamp with time zone | YES |  |
| `dealer_id` | integer | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

## feature_flags

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `name` | text | NO |  |
| `description` | text | YES |  |
| `enabled` | boolean | YES | false |
| `dealer_ids` | integer[] | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

## promo_codes (ACTIVE)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `code` | text | NO |  |
| `description` | text | YES |  |
| `discount_type` | text | YES |  |
| `discount_value` | numeric | YES |  |
| `valid_from` | date | YES |  |
| `valid_until` | date | YES |  |
| `max_uses` | integer | YES |  |
| `times_used` | integer | YES | 0 |
| `active` | boolean | YES | true |
| `dealer_id` | integer | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

## scheduled_jobs

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO |  |
| `name` | text | NO |  |
| `description` | text | YES |  |
| `cron_expression` | text | YES |  |
| `function_name` | text | YES |  |
| `last_run` | timestamp with time zone | YES |  |
| `next_run` | timestamp with time zone | YES |  |
| `status` | text | YES | active |
| `dealer_id` | integer | YES |  |
| `created_at` | timestamp with time zone | YES | now() |

---

## Storage Buckets (referenced in code)

| Bucket | Used By | Purpose |
|--------|---------|---------|
| `vehicle-photos` | InventoryPage | Vehicle photo uploads |
| `employee-documents` | TeamPage | Employee document uploads |
| `form-templates` | documentService | PDF form templates |
| `form-pdfs` | DevConsolePage | Form PDF storage |
| `deal-documents` | documentService, DealsPage | Generated deal documents |
| `form-library` | form_library default | Promoted form storage |
| `form-staging` | form_staging default | Staging form storage |
| `generated-documents` | generated_documents default | Generated doc storage |
