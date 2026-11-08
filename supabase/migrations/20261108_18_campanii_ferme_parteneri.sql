-- Campaniile de lansare (08.11.2026): „Primele 100 de ferme” (plan `ferma`) și „Primii 30 de parteneri fondatori” (plan `partener`).
-- Doar adăugiri, compatibile cu site-ul live: planurile vechi `pro` / `agronom` rămân valabile până la publicarea site-ului nou.
--  1. lista_asteptare: planurile noi + datele firmei pentru parteneri (CUI, denumire, județ, CAEN, starea la ANAF)
--  2. o firmă (CUI) poate rezerva un singur loc de partener
--  3. rezerva_loc_srv primește și datele firmei (parametri opționali, deci Edge Function `rezerva` de acum merge la fel)
--  4. partener_cui_rezervat(cui): folosită de Edge Function `firma-cui` ca să spună „firma are deja un loc rezervat”
set search_path = public, extensions;

alter table public.lista_asteptare drop constraint if exists lista_asteptare_plan_check;
alter table public.lista_asteptare add constraint lista_asteptare_plan_check
  check (plan in ('pro', 'agronom', 'ferma', 'partener'));

alter table public.lista_asteptare
  add column if not exists cui               text,
  add column if not exists firma             text,
  add column if not exists judet             text,
  add column if not exists caen              text,
  add column if not exists anaf_stare        text check (anaf_stare in ('activa', 'inactiva', 'neverificata')),
  add column if not exists anaf_verificat_at timestamptz;

create unique index if not exists lista_asteptare_partener_cui_key
  on public.lista_asteptare (cui) where plan = 'partener';

-- varianta veche (5 parametri) e înlocuită de una cu parametri opționali; apelul de acum, cu nume, merge la fel
drop function if exists public.rezerva_loc_srv(text, text, text, text, text);
create or replace function public.rezerva_loc_srv(
  p_email text, p_plan text, p_sursa text default 'site', p_ph_id text default null, p_ip text default null,
  p_cui text default null, p_firma text default null, p_judet text default null, p_caen text default null, p_anaf_stare text default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_email text := trim(p_email);
  v_ip text := trim(coalesce(p_ip, ''));
  v_ip_hash text;
  v_cui text := nullif(regexp_replace(coalesce(p_cui, ''), '\D', '', 'g'), '');
begin
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' or length(v_email) > 254 then
    raise exception 'email invalid' using errcode = '22023';
  end if;
  if p_plan not in ('pro', 'agronom', 'ferma', 'partener') then
    raise exception 'plan invalid' using errcode = '22023';
  end if;
  if p_plan = 'partener' and (v_cui is null or length(v_cui) not between 2 and 10) then
    raise exception 'cui invalid' using errcode = '22023';
  end if;
  v_ip_hash := case when v_ip <> '' then encode(extensions.digest(v_ip || '|pesticid', 'sha256'), 'hex') else null end;

  if (select count(*) from public.lista_asteptare where created_at > now() - interval '1 minute') >= 20
     or (select count(*) from public.lista_asteptare where created_at > now() - interval '1 hour') >= 200 then
    raise exception 'prea multe înscrieri, încearcă din nou în câteva minute' using errcode = '53400';
  end if;
  if v_ip_hash is not null and (select count(*) from public.lista_asteptare where ip_hash = v_ip_hash and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'prea multe înscrieri de la această adresă' using errcode = '53400';
  end if;
  if p_plan = 'partener' and exists (select 1 from public.lista_asteptare where plan = 'partener' and cui = v_cui) then
    raise exception 'loc deja rezervat' using errcode = '23505';
  end if;

  insert into public.lista_asteptare (email, plan, sursa, ph_id, ip_hash, cui, firma, judet, caen, anaf_stare, anaf_verificat_at)
  values (v_email, p_plan, left(p_sursa, 60), left(p_ph_id, 80), v_ip_hash,
          case when p_plan = 'partener' then v_cui end, left(p_firma, 200), left(p_judet, 80), left(p_caen, 10),
          case when p_plan = 'partener' then coalesce(p_anaf_stare, 'neverificata') end,
          case when p_plan = 'partener' and p_anaf_stare in ('activa', 'inactiva') then now() end)
  on conflict (email_norm, plan) do nothing;
end
$function$;
revoke all on function public.rezerva_loc_srv(text, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.rezerva_loc_srv(text, text, text, text, text, text, text, text, text, text) to service_role;

create or replace function public.partener_cui_rezervat(p_cui text)
returns boolean
language sql
security definer
set search_path to 'public'
as $$ select exists (select 1 from public.lista_asteptare where plan = 'partener' and cui = regexp_replace(coalesce(p_cui, ''), '\D', '', 'g')) $$;
revoke all on function public.partener_cui_rezervat(text) from public, anon, authenticated;
grant execute on function public.partener_cui_rezervat(text) to service_role;
