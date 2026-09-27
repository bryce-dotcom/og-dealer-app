-- Employees can actually use the app. Prior RLS was "owner only" on every
-- table (see 20260226000003_fix_rls_policies_simple.sql, which literally
-- comments "Employee access can be added later"), so a non-owner who accepted
-- their invite could authenticate but couldn't read their own employee row —
-- Login.jsx would return 0 rows and the safety timeout would fire, showing
-- what looks like "timed out". This migration unblocks that flow.
--
-- Policy shape: an authenticated user is considered an "employee of dealer D"
-- if there is a row in public.employees where user_id = auth.uid() AND
-- dealer_id = D AND active = true. Owners keep their existing full access.
-- Financial/bank tables stay owner-only for now.

-- Helper: return the caller's dealer_id if they are an active employee, else NULL.
-- SECURITY DEFINER so the function bypasses RLS on employees itself when
-- resolving membership (otherwise we'd recurse into the same policy we're
-- trying to check).
create or replace function public.current_employee_dealer_id()
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select dealer_id
  from public.employees
  where user_id = auth.uid()
    and active = true
  limit 1
$$;

grant execute on function public.current_employee_dealer_id() to authenticated;

-- ============ EMPLOYEES ============
-- Employees can read every row in their dealer (needed for the Team page and
-- for Login.jsx to find their own dealer_id). Owners retain full access via
-- the existing "Owners can access employees" policy.
drop policy if exists "Employees read same-dealer employees" on public.employees;
create policy "Employees read same-dealer employees" on public.employees
  for select to authenticated
  using (
    dealer_id = public.current_employee_dealer_id()
  );

-- ============ DEALER_SETTINGS ============
-- Read only. Owner keeps update/insert via the existing owner policies.
drop policy if exists "Employees read own dealer_settings" on public.dealer_settings;
create policy "Employees read own dealer_settings" on public.dealer_settings
  for select to authenticated
  using (id = public.current_employee_dealer_id());

-- ============ INVENTORY ============
drop policy if exists "Employees access dealer inventory" on public.inventory;
create policy "Employees access dealer inventory" on public.inventory
  for all to authenticated
  using (dealer_id = public.current_employee_dealer_id())
  with check (dealer_id = public.current_employee_dealer_id());

-- ============ DEALS ============
drop policy if exists "Employees access dealer deals" on public.deals;
create policy "Employees access dealer deals" on public.deals
  for all to authenticated
  using (dealer_id = public.current_employee_dealer_id())
  with check (dealer_id = public.current_employee_dealer_id());

-- ============ CUSTOMERS ============
drop policy if exists "Employees access dealer customers" on public.customers;
create policy "Employees access dealer customers" on public.customers
  for all to authenticated
  using (dealer_id = public.current_employee_dealer_id())
  with check (dealer_id = public.current_employee_dealer_id());

-- ============ BHPH_LOANS ============
drop policy if exists "Employees access dealer bhph_loans" on public.bhph_loans;
create policy "Employees access dealer bhph_loans" on public.bhph_loans
  for all to authenticated
  using (dealer_id = public.current_employee_dealer_id())
  with check (dealer_id = public.current_employee_dealer_id());

-- Note: bank_accounts, bank_transactions, manual_expenses, expense_categories,
-- and other financial tables intentionally stay owner-only for now — those
-- are gated behind BooksPage's separate owner check as well.
