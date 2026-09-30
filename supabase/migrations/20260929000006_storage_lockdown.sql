-- SECURITY: storage buckets.
-- Anonymous users could upload, overwrite and delete files in most buckets
-- (incl. deal-documents = filled, signed contracts), and list every contract.
-- After this:
--   * contracts (deal-documents, generated-documents) and dealer-uploaded forms
--     (dealer-forms) are PRIVATE buckets; only the dealer's owner/employees can
--     read them, and links are short-lived signed URLs minted by the app.
--   * vehicle photos / dealer logos stay publicly viewable (they're on the
--     website), but only signed-in users can add, change or delete them.
--   * platform form buckets are written by edge functions (service role) or the
--     platform admin only.
-- Edge functions use the service role and are unaffected.

-- 1) Drop every storage policy that lets anon/public write.
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and ('public' = any(roles) or 'anon' = any(roles))
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;

-- 2) Drop public listing of private paperwork.
drop policy if exists "Public read" on storage.objects;                          -- deal-documents
drop policy if exists "Public read generated-documents" on storage.objects;
drop policy if exists "Allow reads from dealer-forms" on storage.objects;

update storage.buckets set public = false where id in ('deal-documents', 'generated-documents', 'dealer-forms');

-- Paths look like dealers/<dealer_id>/deals/<deal_id>/<file>.pdf (deal-documents)
-- and <dealer_id>/<file>.pdf (dealer-forms).
create or replace function public.storage_path_dealer_id(p_name text)
returns bigint
language sql
immutable
as $$
  select case
    when (storage.foldername(p_name))[1] = 'dealers' and (storage.foldername(p_name))[2] ~ '^\d+$'
      then ((storage.foldername(p_name))[2])::bigint
    when (storage.foldername(p_name))[1] ~ '^\d+$'
      then ((storage.foldername(p_name))[1])::bigint
    else null
  end
$$;

create or replace function public.can_access_dealer(p_dealer_id bigint)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_dealer_id is not null
     and (public.is_dealer_owner(p_dealer_id) or p_dealer_id = public.current_employee_dealer_id())
$$;
grant execute on function public.can_access_dealer(bigint) to authenticated;

-- 3) Paperwork: the dealer's owner/employees read and manage their own files.
drop policy if exists "Dealer members manage their paperwork" on storage.objects;
create policy "Dealer members manage their paperwork" on storage.objects
  for all to authenticated
  using (
    bucket_id in ('deal-documents', 'generated-documents', 'dealer-forms')
    and public.can_access_dealer(public.storage_path_dealer_id(name))
  )
  with check (
    bucket_id in ('deal-documents', 'generated-documents', 'dealer-forms')
    and public.can_access_dealer(public.storage_path_dealer_id(name))
  );

-- 4) Photos and logos: public to view (bucket stays public), signed-in to change.
drop policy if exists "Signed-in users manage photos and logos" on storage.objects;
create policy "Signed-in users manage photos and logos" on storage.objects
  for all to authenticated
  using (bucket_id in ('vehicle-photos', 'dealer-assets'))
  with check (bucket_id in ('vehicle-photos', 'dealer-assets'));

-- 5) Platform form buckets: platform admin writes (edge functions use service role).
drop policy if exists "Platform admin manages form buckets" on storage.objects;
create policy "Platform admin manages form buckets" on storage.objects
  for all to authenticated
  using (bucket_id in ('form-pdfs', 'form-library', 'form-staging', 'form-templates') and public.is_platform_admin())
  with check (bucket_id in ('form-pdfs', 'form-library', 'form-staging', 'form-templates') and public.is_platform_admin());

-- 6) Employee paperwork (W-4, ID, etc.): private bucket, owner only.
--    Paths look like <dealer_id>/<employee_id>/<type>_<ts>.<ext>. The bucket had
--    no policies at all, so uploads from the Team page silently failed.
drop policy if exists "Owner manages employee documents" on storage.objects;
create policy "Owner manages employee documents" on storage.objects
  for all to authenticated
  using (bucket_id = 'employee-documents' and public.is_dealer_owner(public.storage_path_dealer_id(name)))
  with check (bucket_id = 'employee-documents' and public.is_dealer_owner(public.storage_path_dealer_id(name)));
