-- =====================================================================
-- Pesticid — „Raportează o problemă”, 03.11.2026
--  1. rapoarte_probleme: un rând per raport trimis din site (doar Edge Function `raport-problema` scrie aici)
--  2. rapoarte_fisiere: fiecare fișier atașat (poză / video), legat de o ciornă (draft) și apoi de raport
--  3. bucket privat `rapoarte` (max 20 MB / fișier, doar JPG, PNG, MP4, MOV); accesul se face doar prin linkuri semnate
--  4. config_secret(): citește din Vault secretele funcției (URL-ul și tokenul Google Sheet) — doar service_role
--  5. pg_cron: curățenie zilnică (ciorne abandonate > 1 zi, fișiere din rapoarte > 90 de zile)
-- =====================================================================
set search_path = public, extensions;

create table if not exists public.rapoarte_probleme (
  id          uuid primary key default gen_random_uuid(),
  nr          text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  creat_at    timestamptz not null default now(),
  email       text not null check (length(email) between 3 and 254),
  subiect     text not null check (subiect in ('calculator', 'cautare', 'date', 'inscriere', 'altceva')),
  descriere   text not null check (length(descriere) between 1 and 2000),
  context     jsonb not null default '{}'::jsonb,
  ip_hash     text,
  ph_id       text,
  status      text not null default 'nou',
  trimis_at   timestamptz,
  sheet_at    timestamptz,
  eroare      text
);
create index if not exists rapoarte_probleme_creat_idx on public.rapoarte_probleme (creat_at);
create index if not exists rapoarte_probleme_ip_idx on public.rapoarte_probleme (ip_hash, creat_at);

create table if not exists public.rapoarte_fisiere (
  path        text primary key,
  draft       uuid not null,
  raport_id   uuid references public.rapoarte_probleme (id) on delete set null,
  nume        text not null,
  tip         text not null,
  marime      bigint not null,
  ip_hash     text,
  creat_at    timestamptz not null default now(),
  sters_at    timestamptz
);
create index if not exists rapoarte_fisiere_draft_idx on public.rapoarte_fisiere (draft);
create index if not exists rapoarte_fisiere_ip_idx on public.rapoarte_fisiere (ip_hash, creat_at);

-- nimeni din afară (anon / authenticated) nu citește sau scrie direct; doar Edge Function cu service_role
alter table public.rapoarte_probleme enable row level security;
alter table public.rapoarte_fisiere enable row level security;
revoke all on public.rapoarte_probleme from anon, authenticated;
revoke all on public.rapoarte_fisiere from anon, authenticated;

-- bucket privat: limitele sunt aplicate și de Storage, nu doar de site
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rapoarte', 'rapoarte', false, 20971520, array['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- secretele funcției stau în Vault (gsheet_url, gsheet_token); le citește doar service_role, doar pe cele din listă
create or replace function public.config_secret(p_name text)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = p_name and p_name in ('gsheet_url', 'gsheet_token')
  limit 1
$$;
revoke all on function public.config_secret(text) from public, anon, authenticated;
grant execute on function public.config_secret(text) to service_role;

-- curățenie zilnică la 03:17 (ora României ≈ 01:17 UTC): Edge Function șterge fișierele prin API-ul Storage
create extension if not exists pg_cron;
select cron.unschedule('rapoarte-curatenie') where exists (select 1 from cron.job where jobname = 'rapoarte-curatenie');
select cron.schedule('rapoarte-curatenie', '17 1 * * *', $cron$
  select net.http_post(
    url := 'https://rpwmfhlmdscjpcrqqmyf.supabase.co/functions/v1/raport-problema',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'webhook_secret' limit 1)),
    body := '{"action":"curata"}'::jsonb,
    timeout_milliseconds := 30000
  )
$cron$);
