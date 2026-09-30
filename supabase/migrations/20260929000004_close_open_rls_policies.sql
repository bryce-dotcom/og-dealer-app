-- SECURITY: close "Allow all" policies.
--
-- ~50 tables carried permissive policies like `for all to public using (true)`.
-- Postgres ORs permissive policies together, so one of these made the table
-- fully readable AND writable by anyone holding the anon key — which ships in
-- the frontend bundle. Verified 2026-09-29: an anonymous request could read
-- employees (SSN last 4 / bank details), customers, deals, inventory costs,
-- bank_accounts (incl. Plaid access tokens), bank_transactions, dealer_settings
-- (investor bank routing/account), BHPH loans/payments, time clock, expenses.
--
-- After this migration:
--   * dealer data     -> the dealer's owner (is_dealer_owner) + employees where
--                        earlier migrations granted it (20260927000001/…0002)
--   * reference data  -> read by signed-in users, written by the platform admin
--   * platform data   -> platform admin only (owner of dealer 1, OG DiX)
-- The two public pages use security-definer functions (20260929000003).
-- Edge functions use the service role, which bypasses RLS.

create or replace function public.is_dealer_owner(p_dealer_id bigint)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.dealer_settings where id = p_dealer_id and owner_user_id = auth.uid())
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.dealer_settings where id = 1 and owner_user_id = auth.uid())
$$;

grant execute on function public.is_dealer_owner(bigint) to authenticated;
grant execute on function public.is_platform_admin() to authenticated;

-- 1) Drop every policy that grants the anon/public role unconditional access.
do $$
declare
  r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and 'public' = any(roles)
      and (qual = 'true' or with_check = 'true')
      and tablename not in (
        -- genuinely public, read-only reference tables (SELECT-only policies)
        'document_templates', 'reporting_requirements', 'state_compliance_rules', 'tax_jurisdictions'
      )
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 2) Dealer-owned data: the owner of the row's dealer has full access.
do $$
declare
  t text;
begin
  foreach t in array array[
    'api_keys', 'assets', 'audit_log', 'bank_accounts', 'bank_transactions',
    'bhph_loans', 'bhph_payments', 'commission_roles', 'compliance_tasks',
    'customer_notes', 'customer_vehicle_requests', 'customers', 'deal_activity', 'deal_alerts',
    'deals', 'document_packages', 'employees', 'esignature_settings', 'expense_categories',
    'generated_documents', 'inventory', 'inventory_commissions', 'inventory_expenses',
    'liabilities', 'manual_expenses', 'message_history', 'message_templates',
    'payroll_runs', 'paystubs', 'scheduled_jobs', 'time_clock', 'time_off_requests',
    'vehicle_requests', 'feedback'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'Owner manages dealer ' || t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.is_dealer_owner(dealer_id))
         with check (public.is_dealer_owner(dealer_id))',
      'Owner manages dealer ' || t, t
    );
  end loop;
end $$;

-- Employees also need these for pages they already use (Deals docs, Inventory
-- commission roles, Deal Finder alerts, message templates in Ask Arnie).
drop policy if exists "Employees access dealer generated_documents" on public.generated_documents;
create policy "Employees access dealer generated_documents" on public.generated_documents
  for all to authenticated
  using (dealer_id = public.current_employee_dealer_id())
  with check (dealer_id = public.current_employee_dealer_id());

drop policy if exists "Employees read dealer commission_roles" on public.commission_roles;
create policy "Employees read dealer commission_roles" on public.commission_roles
  for select to authenticated
  using (dealer_id = public.current_employee_dealer_id());

drop policy if exists "Employees access dealer deal_alerts" on public.deal_alerts;
create policy "Employees access dealer deal_alerts" on public.deal_alerts
  for all to authenticated
  using (dealer_id = public.current_employee_dealer_id())
  with check (dealer_id = public.current_employee_dealer_id());

drop policy if exists "Members read message_templates" on public.message_templates;
create policy "Members read message_templates" on public.message_templates
  for select to authenticated
  using (dealer_id is null or dealer_id = public.current_employee_dealer_id());

-- Anyone signed in can send feedback for their own dealer; the platform admin reads it all.
drop policy if exists "Members send feedback" on public.feedback;
create policy "Members send feedback" on public.feedback
  for insert to authenticated
  with check (public.is_dealer_owner(dealer_id) or dealer_id = public.current_employee_dealer_id());

-- 3) Reference data: read by signed-in users, written by the platform admin.
do $$
declare
  t text;
begin
  foreach t in array array[
    'announcements', 'feature_flags', 'form_library', 'form_templates',
    'state_compliance', 'utah_fees', 'system_config'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'Signed-in users read ' || t, t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', 'Signed-in users read ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'Platform admin manages ' || t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin())',
      'Platform admin manages ' || t, t
    );
  end loop;
end $$;

-- system_config previously let ANY signed-in user rewrite credit costs.
drop policy if exists "Allow all operations for authenticated users" on public.system_config;

-- 4) Platform-only data (Dev Console): platform admin only.
do $$
declare
  t text;
begin
  foreach t in array array[
    'ai_research_log', 'commission_payouts', 'form_staging', 'promo_codes',
    'rep_signups', 'sales_reps', 'payments'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'Platform admin manages ' || t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin())',
      'Platform admin manages ' || t, t
    );
  end loop;
end $$;

-- The platform admin reads every dealer's feedback in the Dev Console.
drop policy if exists "Platform admin reads feedback" on public.feedback;
create policy "Platform admin reads feedback" on public.feedback
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- 5) Tables that had row level security switched OFF entirely (no policy
--    applies at all, so anon could read and write them). Turn it on.
do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'commission_defaults', 'commissions', 'compliance_rules', 'credit_packs',
    'credit_usage_log', 'dealer_compliance_tasks', 'dealer_custom_forms', 'dealer_document_packages',
    'document_rules', 'employee_documents', 'feedback', 'form_registry', 'form_requirements',
    'master_forms', 'saved_reports', 'shared_form_mappings', 'state_configurations',
    'state_form_requirements', 'state_metadata', 'state_updates', 'subscriptions',
    'transactions', 'universal_fields', 'webhook_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Dealer-owned: the owner has full access.
do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'commission_defaults', 'commissions', 'credit_packs', 'credit_usage_log',
    'dealer_compliance_tasks', 'dealer_custom_forms', 'dealer_document_packages', 'document_rules',
    'employee_documents', 'form_registry', 'saved_reports', 'subscriptions', 'transactions'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'Owner manages dealer ' || t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.is_dealer_owner(dealer_id))
         with check (public.is_dealer_owner(dealer_id))',
      'Owner manages dealer ' || t, t
    );
  end loop;
end $$;

-- Employees: read what the Deals page and paperwork need, and use credits
-- (Vehicle Research checks and spends the dealer's credits).
do $$
declare
  t text;
begin
  foreach t in array array['form_registry', 'dealer_custom_forms', 'dealer_document_packages', 'credit_packs']
  loop
    execute format('drop policy if exists %I on public.%I', 'Employees read dealer ' || t, t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (dealer_id = public.current_employee_dealer_id())',
      'Employees read dealer ' || t, t
    );
  end loop;
end $$;

drop policy if exists "Employees use dealer subscription credits" on public.subscriptions;
create policy "Employees use dealer subscription credits" on public.subscriptions
  for select to authenticated
  using (dealer_id = public.current_employee_dealer_id());

drop policy if exists "Employees log credit usage" on public.credit_usage_log;
create policy "Employees log credit usage" on public.credit_usage_log
  for all to authenticated
  using (dealer_id = public.current_employee_dealer_id())
  with check (dealer_id = public.current_employee_dealer_id());

-- Reference data with no dealer: read by signed-in users, written by the platform admin.
do $$
declare
  t text;
begin
  foreach t in array array[
    'compliance_rules', 'form_requirements', 'master_forms', 'shared_form_mappings',
    'state_configurations', 'state_form_requirements', 'state_metadata', 'state_updates', 'universal_fields'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'Signed-in users read ' || t, t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', 'Signed-in users read ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'Platform admin manages ' || t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin())',
      'Platform admin manages ' || t, t
    );
  end loop;
end $$;

-- Stripe/Plaid webhook log: written by edge functions (service role); admin can read.
drop policy if exists "Platform admin reads webhook_events" on public.webhook_events;
create policy "Platform admin reads webhook_events" on public.webhook_events
  for select to authenticated
  using (public.is_platform_admin());
