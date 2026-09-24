-- E-signature MVP: columns for signing token, captured signature, and metadata.
-- The token is generated on every deal insert so a signing link exists as soon
-- as documents are created; UI reveals the link only after docs_generated=true.
--
-- No RLS policy is added for anon access. Reads/writes for the signing flow
-- go through two edge functions (get-signing-context, sign-deal) that use the
-- service role and validate the token themselves. Keeping the token off
-- PostgREST removes any chance of leaking it via a wildcard select.

alter table public.deals
  add column if not exists signature_png text,
  add column if not exists signed_at timestamptz,
  add column if not exists signed_by_name text,
  add column if not exists esign_token text;

-- Backfill tokens for existing deals so every row is signable.
update public.deals
  set esign_token = replace(gen_random_uuid()::text, '-', '')
  where esign_token is null;

alter table public.deals
  alter column esign_token set default replace(gen_random_uuid()::text, '-', ''),
  alter column esign_token set not null;

create unique index if not exists deals_esign_token_key on public.deals (esign_token);

comment on column public.deals.esign_token is 'Public opaque token used only by the /sign/:token buyer-signing edge functions';
comment on column public.deals.signature_png is 'Captured signature as a data:image/png;base64 URL';
