-- =====================================================================
-- Pesticid — emailul de bun venit prin Resend, 02.11.2026
--  1. lista_asteptare: coloane pentru varianta trimisă, rang, data trimiterii, id-ul Resend, eroare, ph_id (PostHog)
--  2. rezerva_loc acceptă și p_ph_id (opțional; site-ul vechi continuă să funcționeze)
--  3. pg_net + trigger după insert: cheamă Edge Function `bun-venit` cu secretul din Vault
-- Secretul: select vault.create_secret('<valoare>', 'webhook_secret');  (aceeași valoare și în secretele funcției: WEBHOOK_SECRET)
-- =====================================================================
set search_path = public, extensions;

alter table public.lista_asteptare
  add column if not exists varianta  text,
  add column if not exists rang      integer,
  add column if not exists trimis_at timestamptz,
  add column if not exists resend_id text,
  add column if not exists eroare    text,
  add column if not exists ph_id     text;

create or replace function public.rezerva_loc(p_email text, p_plan text, p_sursa text default 'site', p_ph_id text default null)
returns void
language sql
set search_path to 'public'
as $$
  insert into public.lista_asteptare (email, plan, sursa, ph_id) values (trim(p_email), p_plan, left(p_sursa, 60), left(p_ph_id, 80))
  on conflict (email_norm, plan) do nothing
$$;
grant execute on function public.rezerva_loc(text, text, text, text) to anon, authenticated;

create extension if not exists pg_net with schema extensions;

create or replace function public.lista_asteptare_bun_venit()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_secret text;
  v_url text := 'https://rpwmfhlmdscjpcrqqmyf.supabase.co/functions/v1/bun-venit';
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'webhook_secret' limit 1;
  if v_secret is null then
    raise warning 'bun-venit: lipsește secretul webhook_secret din Vault; emailul nu a fost trimis pentru id=%', new.id;
    return new;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    body := jsonb_build_object('record', jsonb_build_object('id', new.id)),
    timeout_milliseconds := 8000
  );
  return new;
end
$$;
revoke all on function public.lista_asteptare_bun_venit() from public;

drop trigger if exists trg_lista_asteptare_bun_venit on public.lista_asteptare;
create trigger trg_lista_asteptare_bun_venit
  after insert on public.lista_asteptare
  for each row execute function public.lista_asteptare_bun_venit();

-- ---------------------------------------------------------------- secretul webhook-ului (aplicat separat: bun_venit_webhook_secret)
-- select vault.create_secret('<valoare generată>', 'webhook_secret', '...');
create or replace function public.webhook_secret()
returns text
language sql
security definer
set search_path = public, vault
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'webhook_secret' limit 1 $$;
revoke all on function public.webhook_secret() from public, anon, authenticated;
grant execute on function public.webhook_secret() to service_role;

-- varianta veche cu 3 parametri făcea apelul ambiguu (și din site, prin PostgREST); rămâne doar cea cu p_ph_id opțional
drop function if exists public.rezerva_loc(text, text, text);

-- ---------------------------------------------------------------- webhook-uri Resend → PostHog (Edge Function resend-webhook)
alter table public.lista_asteptare
  add column if not exists livrat_at  timestamptz,
  add column if not exists click_at   timestamptz,
  add column if not exists respins_at timestamptz;
create index if not exists lista_asteptare_resend_id_idx on public.lista_asteptare (resend_id);
