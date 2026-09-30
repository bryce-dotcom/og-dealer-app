-- Employees can use the day-to-day pages the app already shows them.
-- 20260927000001 opened inventory/deals/customers/bhph_loans; every other table
-- stayed owner-only, so staff saw empty Tasks/Keys/Recon/Photos/Time Clock
-- pages and their saves failed silently.
--
-- Same shape as before: "employee of dealer D" = active employees row with
-- user_id = auth.uid(). Money tables (bank_*, paystubs, payroll*, commissions,
-- inventory_commissions, liabilities, assets, manual_expenses, lenders, etc.)
-- intentionally stay owner-only.

-- Helper: the caller's employees.id if they are an active employee, else NULL.
create or replace function public.current_employee_id()
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select id
  from public.employees
  where user_id = auth.uid()
    and active = true
  limit 1
$$;

grant execute on function public.current_employee_id() to authenticated;

-- Full read/write within the employee's own dealer.
do $$
declare
  t text;
begin
  foreach t in array array[
    'appointments', 'customer_interactions', 'customer_notes', 'customer_reviews',
    'customer_vehicle_requests', 'vehicle_requests', 'leads', 'test_drives', 'trade_ins',
    'deal_activity', 'deal_timeline', 'deal_jackets', 'deal_jacket_documents',
    'dealer_tasks', 'dealer_notifications',
    'inventory_expenses', 'reconditioning_tasks', 'reconditioning_templates',
    'vehicle_photos', 'vehicle_inspections', 'title_tracking', 'key_tracking', 'lot_positions',
    'service_orders', 'service_line_items', 'warranty_claims'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'Employees access dealer ' || t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (dealer_id = public.current_employee_dealer_id())
         with check (dealer_id = public.current_employee_dealer_id())',
      'Employees access dealer ' || t, t
    );
  end loop;
end $$;

-- ============ TIME CLOCK ============
-- Everyone at the dealer can see who is clocked in; you can only clock yourself.
drop policy if exists "Employees read dealer time_clock" on public.time_clock;
create policy "Employees read dealer time_clock" on public.time_clock
  for select to authenticated
  using (dealer_id = public.current_employee_dealer_id());

drop policy if exists "Employees clock themselves in" on public.time_clock;
create policy "Employees clock themselves in" on public.time_clock
  for insert to authenticated
  with check (dealer_id = public.current_employee_dealer_id() and employee_id = public.current_employee_id());

drop policy if exists "Employees clock themselves out" on public.time_clock;
create policy "Employees clock themselves out" on public.time_clock
  for update to authenticated
  using (dealer_id = public.current_employee_dealer_id() and employee_id = public.current_employee_id())
  with check (dealer_id = public.current_employee_dealer_id() and employee_id = public.current_employee_id());

-- ============ TIME OFF ============
-- Employees see and request their own time off; the owner approves.
drop policy if exists "Employees read own time_off_requests" on public.time_off_requests;
create policy "Employees read own time_off_requests" on public.time_off_requests
  for select to authenticated
  using (dealer_id = public.current_employee_dealer_id() and employee_id = public.current_employee_id());

drop policy if exists "Employees request own time off" on public.time_off_requests;
create policy "Employees request own time off" on public.time_off_requests
  for insert to authenticated
  with check (dealer_id = public.current_employee_dealer_id() and employee_id = public.current_employee_id());
