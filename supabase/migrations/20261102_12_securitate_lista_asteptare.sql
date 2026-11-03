-- =====================================================================
-- Pesticid — corecții de securitate după audit (02.11.2026)
--  1. funcția de trigger nu mai e executabilă de anon/authenticated (advisor 0028/0029)
--  2. rezerva_loc: SECURITY DEFINER cu validări proprii + limitare de rată (global 20/min, 200/oră; pe IP 5/oră, IP doar ca hash)
--  3. deduplicare webhook Resend după svix-id (tabel resend_webhook_ids, fără acces public)
-- Notă: pg_net.ttl nu poate fi schimbat prin migrare (ALTER ROLE în tranzacție); rămâne implicit (6 ore).
-- =====================================================================
revoke execute on function public.lista_asteptare_bun_venit() from public, anon, authenticated;

alter table public.lista_asteptare add column if not exists ip_hash text;
create index if not exists lista_asteptare_created_at_idx on public.lista_asteptare (created_at);
create index if not exists lista_asteptare_ip_hash_idx on public.lista_asteptare (ip_hash, created_at);

create or replace function public.rezerva_loc(p_email text, p_plan text, p_sursa text default 'site', p_ph_id text default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := trim(p_email);
  v_ip text;
  v_ip_hash text;
begin
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' or length(v_email) > 254 then
    raise exception 'email invalid' using errcode = '22023';
  end if;
  if p_plan not in ('pro', 'agronom') then
    raise exception 'plan invalid' using errcode = '22023';
  end if;
  begin
    v_ip := split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  exception when others then v_ip := '';
  end;
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
$$;
revoke all on function public.rezerva_loc(text, text, text, text) from public;
grant execute on function public.rezerva_loc(text, text, text, text) to anon, authenticated;

create table if not exists public.resend_webhook_ids (
  id text primary key,
  created_at timestamptz not null default now()
);
alter table public.resend_webhook_ids enable row level security;
revoke all on public.resend_webhook_ids from public, anon, authenticated;
create index if not exists resend_webhook_ids_created_idx on public.resend_webhook_ids (created_at);
