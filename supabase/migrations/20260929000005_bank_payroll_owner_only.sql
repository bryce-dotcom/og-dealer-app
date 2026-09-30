-- Bank data, expenses and payroll are owner-only (Books/Payroll pages are
-- owner-only). Older generic policies used user_has_dealer_access(dealer_id),
-- which also matches ANY employee, so every staff login could read the bank
-- accounts, transactions, expenses and payroll. The owner keeps access through
-- "Owners can access …" / "Owner manages dealer …" policies.

drop policy if exists "Users can view their dealer bank accounts" on public.bank_accounts;
drop policy if exists "Users can insert their dealer bank accounts" on public.bank_accounts;
drop policy if exists "Users can update their dealer bank accounts" on public.bank_accounts;

drop policy if exists "Users can view their dealer transactions" on public.bank_transactions;
drop policy if exists "Users can insert their dealer transactions" on public.bank_transactions;
drop policy if exists "Users can update their dealer transactions" on public.bank_transactions;

drop policy if exists "Users can view their dealer expenses" on public.manual_expenses;
drop policy if exists "Users can insert their dealer expenses" on public.manual_expenses;
drop policy if exists "Users can update their dealer expenses" on public.manual_expenses;
drop policy if exists "Users can delete their dealer expenses" on public.manual_expenses;

drop policy if exists "Users see own dealer payroll" on public.payroll;
drop policy if exists "Owner manages dealer payroll" on public.payroll;
create policy "Owner manages dealer payroll" on public.payroll
  for all to authenticated
  using (public.is_dealer_owner(dealer_id))
  with check (public.is_dealer_owner(dealer_id));
