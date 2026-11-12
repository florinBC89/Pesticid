-- Versiunea poloneză a site-ului: înscrierile au țara și limba (emailul de bun venit pleacă în limba omului).
-- Compatibil cu site-ul RO: coloanele noi au valori implicite (RO / ro), iar rezerva_loc_srv primește doi parametri noi, opționali.
-- Parteneri din Polonia: NIP (10 cifre, cu cifra de control verificată în Edge Function `rezerva`), firma și voievodatul scrise de om
-- (nu există ANAF în Polonia; anaf_stare = 'neverificata', verificăm manual). Un loc pe firmă, separat pe țări.

alter table public.lista_asteptare add column if not exists tara char(2) not null default 'RO';
alter table public.lista_asteptare add column if not exists limba text not null default 'ro';
alter table public.lista_asteptare drop constraint if exists lista_asteptare_tara_chk;
alter table public.lista_asteptare add constraint lista_asteptare_tara_chk check (tara in ('RO', 'PL'));
alter table public.lista_asteptare drop constraint if exists lista_asteptare_limba_chk;
alter table public.lista_asteptare add constraint lista_asteptare_limba_chk check (limba in ('ro', 'pl'));
create index if not exists lista_asteptare_tara_plan_idx on public.lista_asteptare (tara, plan, id);

drop function if exists public.rezerva_loc_srv(text, text, text, text, text, text, text, text, text, text);
create or replace function public.rezerva_loc_srv(
  p_email text, p_plan text, p_sursa text default 'site', p_ph_id text default null, p_ip text default null,
  p_cui text default null, p_firma text default null, p_judet text default null, p_caen text default null, p_anaf_stare text default null,
  p_tara text default 'RO', p_limba text default 'ro')
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
  v_tara text := upper(coalesce(nullif(trim(p_tara), ''), 'RO'));
  v_limba text := lower(coalesce(nullif(trim(p_limba), ''), 'ro'));
begin
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' or length(v_email) > 254 then
    raise exception 'email invalid' using errcode = '22023';
  end if;
  if p_plan not in ('pro', 'agronom', 'ferma', 'partener') then
    raise exception 'plan invalid' using errcode = '22023';
  end if;
  if v_tara not in ('RO', 'PL') or v_limba not in ('ro', 'pl') then
    raise exception 'tara invalida' using errcode = '22023';
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
  if p_plan = 'partener' and exists (select 1 from public.lista_asteptare where plan = 'partener' and cui = v_cui and tara = v_tara) then
    raise exception 'loc deja rezervat' using errcode = '23505';
  end if;

  insert into public.lista_asteptare (email, plan, sursa, ph_id, ip_hash, cui, firma, judet, caen, anaf_stare, anaf_verificat_at, tara, limba)
  values (v_email, p_plan, left(p_sursa, 60), left(p_ph_id, 80), v_ip_hash,
          case when p_plan = 'partener' then v_cui end, left(p_firma, 200), left(p_judet, 80), left(p_caen, 10),
          case when p_plan = 'partener' then coalesce(p_anaf_stare, 'neverificata') end,
          case when p_plan = 'partener' and p_anaf_stare in ('activa', 'inactiva') then now() end,
          v_tara, v_limba)
  on conflict (email_norm, plan) do nothing;
end
$function$;
revoke all on function public.rezerva_loc_srv(text, text, text, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.rezerva_loc_srv(text, text, text, text, text, text, text, text, text, text, text, text) to service_role;

drop function if exists public.partener_cui_rezervat(text);
create or replace function public.partener_cui_rezervat(p_cui text, p_tara text default 'RO')
returns boolean
language sql
security definer
set search_path to 'public'
as $$ select exists (select 1 from public.lista_asteptare where plan = 'partener' and tara = upper(coalesce(p_tara, 'RO')) and cui = regexp_replace(coalesce(p_cui, ''), '\D', '', 'g')) $$;
revoke all on function public.partener_cui_rezervat(text, text) from public, anon, authenticated;
grant execute on function public.partener_cui_rezervat(text, text) to service_role;
