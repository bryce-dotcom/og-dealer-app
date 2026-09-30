-- Narrow, read-only (plus one intake) functions for the two public pages
-- (/embed/:dealerId and /find-rig/:dealerId), so those pages no longer need
-- anonymous access to whole tables. They return only what a shopper should see:
-- no costs, no internal notes, no other dealers' data.

create or replace function public.public_dealer_profile(p_dealer_id bigint)
returns table (id bigint, dealer_name text, phone text, email text, address text, city text, state text, zip text, logo_url text)
language sql
security definer
set search_path = public
stable
as $$
  select d.id::bigint, d.dealer_name::text, d.phone::text, d.email::text, d.address::text,
         d.city::text, d.state::text, d.zip::text, d.logo_url::text
  from public.dealer_settings d
  where d.id = p_dealer_id
$$;

create or replace function public.public_inventory(p_dealer_id bigint, p_limit int default 50)
returns table (id text, year int, make text, model text, "trim" text, miles numeric, mileage numeric,
               color text, sale_price numeric, photos text[], description text, stock_number text, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select i.id::text, i.year::int, i.make::text, i.model::text, i."trim"::text, i.miles::numeric, i.mileage::numeric,
         i.color::text, i.sale_price::numeric, i.photos::text[], i.description::text, i.stock_number::text, i.created_at::timestamptz
  from public.inventory i
  where i.dealer_id = p_dealer_id
    and i.status = 'For Sale'
  order by i.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

-- "Find my rig" form: creates the customer + what they're looking for.
create or replace function public.submit_vehicle_request(
  p_dealer_id bigint, p_name text, p_phone text, p_email text,
  p_year_min int, p_year_max int, p_make text, p_model text,
  p_max_price numeric, p_max_miles numeric, p_notes text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id bigint;
begin
  if not exists (select 1 from public.dealer_settings where id = p_dealer_id) then
    raise exception 'Dealer not found';
  end if;
  if coalesce(trim(p_name), '') = '' or (coalesce(trim(p_phone), '') = '' and coalesce(trim(p_email), '') = '') then
    raise exception 'Name and a phone number or email are required';
  end if;

  insert into public.customers (name, phone, email, dealer_id)
  values (left(trim(p_name), 200), left(p_phone, 50), left(p_email, 200), p_dealer_id)
  returning id into v_customer_id;

  insert into public.customer_vehicle_requests
    (customer_id, dealer_id, year_min, year_max, make, model, max_price, max_miles, notes, status)
  values
    (v_customer_id, p_dealer_id, p_year_min, p_year_max, left(p_make, 100), left(p_model, 100),
     p_max_price, p_max_miles, left(p_notes, 2000), 'Looking');

  return true;
end;
$$;

grant execute on function public.public_dealer_profile(bigint) to anon, authenticated;
grant execute on function public.public_inventory(bigint, int) to anon, authenticated;
grant execute on function public.submit_vehicle_request(bigint, text, text, text, int, int, text, text, numeric, numeric, text) to anon, authenticated;
