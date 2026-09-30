-- The BHPH page is offered to finance-role employees (permissions.js isFinance),
-- and they can already read bhph_loans, but bhph_payments was owner-only, so
-- recording a payment failed for them. Open it to active employees whose roles
-- include a finance role. Other money tables stay owner-only.

create or replace function public.current_employee_has_role(allowed text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.employees
    where user_id = auth.uid()
      and active = true
      and roles && allowed
  )
$$;

grant execute on function public.current_employee_has_role(text[]) to authenticated;

drop policy if exists "Finance employees access dealer bhph_payments" on public.bhph_payments;
create policy "Finance employees access dealer bhph_payments" on public.bhph_payments
  for all to authenticated
  using (
    dealer_id = public.current_employee_dealer_id()
    and public.current_employee_has_role(array['Owner','CEO','Admin','President','VP Operations','Finance'])
  )
  with check (
    dealer_id = public.current_employee_dealer_id()
    and public.current_employee_has_role(array['Owner','CEO','Admin','President','VP Operations','Finance'])
  );
