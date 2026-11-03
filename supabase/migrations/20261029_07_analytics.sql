-- =====================================================================
-- Pesticid — evenimente + metrici de produs (cost zero, fără Mixpanel)
-- Întrebări la care răspund view-urile:
--   1. cât de repede își face lumea cont (de la prima vizită) și cu ce metodă (email / google / telefon)
--   2. ce caută lumea prima dată
--   3. când cumpără primul abonament (de la prima vizită / de la cont)
-- =====================================================================

create table if not exists public.evenimente (
  id          bigserial primary key,
  user_id     uuid,                       -- auth.uid() (inclusiv conturi anonime)
  device_id   text,                       -- uuid generat pe device (localStorage)
  sesiune_id  text,                       -- uuid per deschidere a aplicației
  tip         text not null,              -- vezi lista de mai jos
  payload     jsonb not null default '{}',
  url         text,
  created_at  timestamptz not null default now()
);
comment on table public.evenimente is $$
Tipuri folosite de aplicație:
  vizita              {referrer, utm_source, lat_bucket?}       prima încărcare într-o sesiune
  cautare             {q, nr_rezultate, ms, tipuri[]}           fiecare interogare cu >= 2 litere (debounced)
  cautare_fara_rezultat {q}
  alegere             {tip, slug, eticheta, pozitie, din: 'typeahead'|'in_sezon'|'recente'|'chip'}
  cultura_aleasa      {slug, pentru_tinta}
  calcul              {cultura, tinta, ha, apa, rezervor, nr_produse, nr_omologate}
  salveaza_click      {produs}                                   apasă „Salvează” (trigger de cont)
  cont_modal          {trigger}                                  s-a afișat modalul de cont
  cont_metoda_click   {metoda: 'email'|'google'|'telefon'}       a ales o metodă
  cont_creat          {metoda}                                   prima autentificare reușită (identitate legată)
  login               {metoda}                                   autentificări ulterioare
  paywall_afisat      {trigger: 'salveaza'|'tank_mix'|'export'|'preturi'}
  trial_start         {plan}
  abonament_activat   {plan, suma, moneda, anual: bool}
  abonament_anulat    {plan}
$$;
create index if not exists evenimente_user_idx   on public.evenimente (user_id, created_at);
create index if not exists evenimente_device_idx on public.evenimente (device_id, created_at);
create index if not exists evenimente_tip_idx    on public.evenimente (tip, created_at);

alter table public.evenimente enable row level security;
-- nimeni nu citește prin API; se scrie doar prin funcția de mai jos
drop policy if exists evenimente_no_select on public.evenimente;

create or replace function public.inregistreaza_eveniment(p_tip text, p_payload jsonb default '{}', p_device_id text default null, p_sesiune_id text default null, p_url text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.evenimente (user_id, device_id, sesiune_id, tip, payload, url)
  values (auth.uid(), left(p_device_id, 64), left(p_sesiune_id, 64), left(p_tip, 40), coalesce(p_payload, '{}'), left(p_url, 300))
$$;
grant execute on function public.inregistreaza_eveniment(text, jsonb, text, text, text) to anon, authenticated;

-- evenimentele de cont vin din sursa de adevăr (auth), nu doar din client
create or replace function public.pe_identitate_noua()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from auth.identities where user_id = new.user_id;
  insert into public.evenimente (user_id, tip, payload)
  values (new.user_id, case when n <= 1 then 'cont_creat' else 'identitate_legata' end,
          jsonb_build_object('metoda', new.provider));
  return new;
end $$;
drop trigger if exists evenimente_identitate on auth.identities;
create trigger evenimente_identitate after insert on auth.identities for each row execute function public.pe_identitate_noua();

-- abonament: când ferme.plan trece de pe free pe pro/agronom
create or replace function public.pe_schimbare_plan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.plan <> old.plan then
    insert into public.evenimente (user_id, tip, payload)
    values (new.owner_id,
            case when new.plan = 'free' then 'abonament_anulat'
                 when new.trial_pana_la is not null and new.trial_pana_la >= current_date and new.plan_expira_la is null then 'trial_start'
                 else 'abonament_activat' end,
            jsonb_build_object('plan', new.plan, 'ferma_id', new.id));
  end if;
  return new;
end $$;
drop trigger if exists evenimente_plan on public.ferme;
create trigger evenimente_plan after update of plan on public.ferme for each row execute function public.pe_schimbare_plan();

-- un device poate avea mai multe user_id (anonim → cont); unim după device_id
create or replace view public.v_identitate_device as
select e.device_id, e.user_id, min(e.created_at) as prima
from public.evenimente e where e.device_id is not null and e.user_id is not null
group by 1, 2;

-- ---------- 1. timp până la cont + metoda ----------
create or replace view public.v_utilizatori as
with dev as (
  select device_id, min(created_at) as prima_vizita
  from public.evenimente where tip = 'vizita' and device_id is not null group by 1
),
cont as (
  select e.user_id, min(e.created_at) as cont_la, (array_agg(e.payload->>'metoda' order by e.created_at))[1] as metoda
  from public.evenimente e where e.tip = 'cont_creat' group by 1
),
cont_dev as (
  select d.device_id, c.user_id, c.cont_la, c.metoda
  from cont c join public.v_identitate_device i on i.user_id = c.user_id join dev d on d.device_id = i.device_id
),
prima_cautare as (
  select distinct on (device_id) device_id, created_at as prima_cautare_la, payload->>'q' as prima_cautare, (payload->>'nr_rezultate')::int as nr_rezultate
  from public.evenimente where tip = 'cautare' and device_id is not null order by device_id, created_at
),
prima_alegere as (
  select distinct on (device_id) device_id, payload->>'tip' as tip_ales, payload->>'eticheta' as ales
  from public.evenimente where tip = 'alegere' and device_id is not null order by device_id, created_at
),
primul_calcul as (
  select device_id, min(created_at) as primul_calcul_la, count(*) as nr_calcule from public.evenimente where tip = 'calcul' and device_id is not null group by 1
),
abonament as (
  select e.user_id, min(e.created_at) as abonament_la, (array_agg(e.payload->>'plan' order by e.created_at))[1] as plan
  from public.evenimente e where e.tip = 'abonament_activat' group by 1
),
trial as (select user_id, min(created_at) as trial_la from public.evenimente where tip = 'trial_start' group by 1)
select d.device_id, cd.user_id, cd.metoda,
       d.prima_vizita, pc.prima_cautare_la, pc.prima_cautare, pc.nr_rezultate, pa.tip_ales, pa.ales,
       k.primul_calcul_la, k.nr_calcule,
       cd.cont_la, t.trial_la, a.abonament_la, a.plan,
       cd.cont_la - d.prima_vizita        as timp_pana_la_cont,
       a.abonament_la - d.prima_vizita    as timp_pana_la_abonament,
       a.abonament_la - cd.cont_la        as timp_cont_pana_la_abonament
from dev d
left join cont_dev cd on cd.device_id = d.device_id
left join prima_cautare pc on pc.device_id = d.device_id
left join prima_alegere pa on pa.device_id = d.device_id
left join primul_calcul k on k.device_id = d.device_id
left join trial t on t.user_id = cd.user_id
left join abonament a on a.user_id = cd.user_id;

create or replace view public.v_metode_cont as
select coalesce(metoda, '(fără cont)') as metoda,
       count(*) as utilizatori,
       round(100.0 * count(*) / sum(count(*)) over (), 1) as procent,
       percentile_cont(0.5) within group (order by extract(epoch from timp_pana_la_cont))::int / 60 as median_min_pana_la_cont,
       percentile_cont(0.9) within group (order by extract(epoch from timp_pana_la_cont))::int / 60 as p90_min_pana_la_cont,
       avg(nr_calcule)::numeric(6,1) as calcule_medii
from public.v_utilizatori group by 1 order by 2 desc;

-- ---------- 2. ce caută lumea prima dată ----------
create or replace view public.v_primele_cautari as
select lower(public.f_unaccent(prima_cautare)) as termen, count(*) as nr,
       round(100.0 * count(*) filter (where nr_rezultate = 0) / count(*), 1) as procent_fara_rezultat,
       round(100.0 * count(*) filter (where cont_la is not null) / count(*), 1) as procent_au_facut_cont
from public.v_utilizatori where prima_cautare is not null
group by 1 order by 2 desc;

create or replace view public.v_primele_alegeri as
select tip_ales, ales, count(*) as nr from public.v_utilizatori where ales is not null group by 1, 2 order by 3 desc;

-- ---------- 3. când cumpără primul abonament ----------
create or replace view public.v_abonamente as
select plan, count(*) as abonamente,
       percentile_cont(0.5) within group (order by extract(epoch from timp_pana_la_abonament))::int / 86400 as median_zile_de_la_prima_vizita,
       percentile_cont(0.5) within group (order by extract(epoch from timp_cont_pana_la_abonament))::int / 86400 as median_zile_de_la_cont,
       avg(nr_calcule)::numeric(6,1) as calcule_inainte_de_plata
from public.v_utilizatori where abonament_la is not null group by 1;

-- ---------- funnel zilnic ----------
create or replace view public.v_funnel_zilnic as
select date_trunc('day', created_at)::date as zi,
       count(distinct device_id) filter (where tip = 'vizita')    as vizitatori,
       count(distinct device_id) filter (where tip = 'cautare')   as au_cautat,
       count(distinct device_id) filter (where tip = 'calcul')    as au_calculat,
       count(distinct device_id) filter (where tip = 'salveaza_click') as au_vrut_sa_salveze,
       count(distinct device_id) filter (where tip = 'cont_modal') as au_vazut_modal_cont,
       count(distinct user_id)   filter (where tip = 'cont_creat') as conturi_noi,
       count(distinct user_id)   filter (where tip = 'paywall_afisat') as au_vazut_paywall,
       count(distinct user_id)   filter (where tip = 'trial_start') as trialuri,
       count(distinct user_id)   filter (where tip = 'abonament_activat') as abonamente,
       count(*) filter (where tip = 'cautare_fara_rezultat') as cautari_fara_rezultat
from public.evenimente group by 1 order by 1 desc;

-- view-urile sunt pentru dashboard (service_role / SQL editor); nu se expun anon/authenticated
revoke all on public.v_utilizatori, public.v_metode_cont, public.v_primele_cautari, public.v_primele_alegeri, public.v_abonamente, public.v_funnel_zilnic, public.v_identitate_device from anon, authenticated;

-- curățenie: evenimentele brute mai vechi de 13 luni (păstrăm agregatele în view-uri materializate dacă va fi nevoie)
create or replace function public.curata_evenimente() returns void language sql security definer set search_path = public as
$$ delete from public.evenimente where created_at < now() - interval '13 months' $$;

-- funcțiile interne (trigger-e, curățenie) nu se expun prin API
revoke execute on function public.curata_evenimente(), public.pe_identitate_noua(), public.pe_schimbare_plan() from anon, authenticated, public;
