-- Înscrierea pe lista de așteptare trece prin Edge Function `rezerva`, care verifică întâi tokenul Turnstile (anti-robot).
-- rezerva_loc_srv: aceeași logică ca rezerva_loc, dar IP-ul îl dă funcția (din antetul cererii omului) și doar service_role o poate apela.
-- După ce site-ul nou e publicat, rezerva_loc nu mai poate fi apelată direct din browser (altfel roboții ar ocoli verificarea).
create or replace function public.rezerva_loc_srv(p_email text, p_plan text, p_sursa text default 'site', p_ph_id text default null, p_ip text default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_email text := trim(p_email);
  v_ip text := trim(coalesce(p_ip, ''));
  v_ip_hash text;
begin
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' or length(v_email) > 254 then
    raise exception 'email invalid' using errcode = '22023';
  end if;
  if p_plan not in ('pro', 'agronom') then
    raise exception 'plan invalid' using errcode = '22023';
  end if;
  -- IP-ul se păstrează doar ca hash (același calcul ca în rezerva_loc, ca limitele să se cumuleze)
  v_ip_hash := case when v_ip <> '' then encode(extensions.digest(v_ip || '|pesticid', 'sha256'), 'hex') else null end;

  if (select count(*) from public.lista_asteptare where created_at > now() - interval '1 minute') >= 20
     or (select count(*) from public.lista_asteptare where created_at > now() - interval '1 hour') >= 200 then
    raise exception 'prea multe înscrieri, încearcă din nou în câteva minute' using errcode = '53400';
  end if;
  if v_ip_hash is not null and (select count(*) from public.lista_asteptare where ip_hash = v_ip_hash and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'prea multe înscrieri de la această adresă' using errcode = '53400';
  end if;

  insert into public.lista_asteptare (email, plan, sursa, ph_id, ip_hash)
  values (v_email, p_plan, left(p_sursa, 60), left(p_ph_id, 80), v_ip_hash)
  on conflict (email_norm, plan) do nothing;
end
$function$;

revoke all on function public.rezerva_loc_srv(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.rezerva_loc_srv(text, text, text, text, text) to service_role;
