-- =====================================================================
-- Pesticid — import „Lista_pesticide-03.10.2026.xlsx” (registrul ANF) din tabelele de staging import_anf_*
-- Staging-ul e generat de supabase/import/anf_2026_10/parse_lista.py și încărcat înainte de această migrare.
-- Rulabilă de mai multe ori: inserturile sunt gardate cu „not exists”, recomandările deja legate (recomandare_id) sunt sărite.
-- =====================================================================
set search_path = public, extensions;

-- 0) constrângeri lărgite: categorii noi de produse și unități per 1000 L apă
alter table public.produse drop constraint if exists produse_tip_chk;
alter table public.produse add constraint produse_tip_chk check (tip is null or tip in
  ('Erbicid','Fungicid','Insecticid','Acaricid','Regulator de crestere','Tratament samanta','Adjuvant','Rodenticid','Moluscocid','Nematocid','Altul'));
alter table public.recomandari drop constraint if exists recomandari_unitate_chk;
alter table public.recomandari add constraint recomandari_unitate_chk check (unitate is null or unitate in
  ('L/ha','ml/ha','kg/ha','g/ha','L/t sem','ml/100 kg sem','g/100 kg sem','kg/t sem','%','L/1000 L apa','kg/1000 L apa'));

-- 0b) secvențele de id pot fi în urmă după seed-urile cu id explicit -> le aliniem la max(id)
do $$
declare r record; seqname text; mx bigint;
begin
  for r in select c.table_name as t from information_schema.columns c
           where c.table_schema='public' and c.column_name='id'
             and c.table_name in ('produse','culturi','tinte','daunatori','recomandari','sinonime','import_raw') loop
    seqname := pg_get_serial_sequence('public.'||r.t, 'id');
    if seqname is null then continue; end if;
    execute format('select coalesce(max(id),0) from public.%I', r.t) into mx;
    perform setval(seqname, greatest(mx,1), mx > 0);
  end loop;
end $$;

-- 1) culturi canonice noi (slug nou și nume nou); apoi părinții
insert into public.culturi (nume, slug, categorie, ordine)
select s.nume, s.slug, s.categorie, 100
from public.import_anf_culturi s
where not exists (select 1 from public.culturi c where c.slug = s.slug)
  and not exists (select 1 from public.culturi c where c.nume = s.nume);

create temp table t_cult on commit drop as
select s.slug, coalesce(c1.id, coalesce(c2.canonic_id, c2.id)) as cultura_id
from public.import_anf_culturi s
left join public.culturi c1 on c1.slug = s.slug
left join public.culturi c2 on c2.nume = s.nume;

update public.culturi c set parinte_id = p.id
from public.import_anf_culturi s join public.culturi p on p.slug = s.parinte_slug
where c.slug = s.slug and c.parinte_id is null and c.id <> p.id;

-- 2) ținte canonice noi
insert into public.tinte (nume, tip, slug, nume_stiintific)
select s.nume, s.tip, s.slug, s.ns
from public.import_anf_tinte_canon s
where not exists (select 1 from public.tinte t where t.slug = s.slug);

-- 3) șirurile brute de ținte -> daunatori (+ un rând „nespecificat”) și legăturile daunator_tinta
insert into public.daunatori (nume, tip, tip_norm, is_compus)
select 'Țintă nespecificată', null, 'altul', false
where not exists (select 1 from public.daunatori where nume = 'Țintă nespecificată');

insert into public.daunatori (nume, tip, tip_norm, is_compus)
select s.tinta_raw, s.agent,
       case lower(public.f_unaccent(coalesce(s.agent,''))) when 'buruieni' then 'buruiana' when 'boli' then 'boala' when 'daunatori' then 'daunator' when 'produs vegetal' then 'fiziologic' else 'altul' end,
       cardinality(s.slugs) > 1
from public.import_anf_tinte s
where not exists (select 1 from public.daunatori d where d.nume = s.tinta_raw);

create temp table t_daun on commit drop as
select s.id as tinta_raw_id, (select min(d.id) from public.daunatori d where d.nume = s.tinta_raw) as daunator_id
from public.import_anf_tinte s;

insert into public.daunator_tinta (daunator_id, tinta_id)
select distinct td.daunator_id, t.id
from public.import_anf_tinte s
join t_daun td on td.tinta_raw_id = s.id
cross join unnest(s.slugs) sl
join public.tinte t on t.slug = sl
on conflict do nothing;

-- 4) produse: potrivire cu cele existente (nume canonic sau nume secundar), altfel inserare
create temp table t_prod on commit drop as
select s.id as stage_id,
       (select min(p.id) from public.produse p
         where p.status <> 'duplicat'
           and (public.norm_text(coalesce(p.nume_canonic, p.nume)) = public.norm_text(s.nume)
                or public.norm_text(s.nume) in (select public.norm_text(x) from unnest(p.nume_secundare) x))) as produs_id
from public.import_anf_produse s;

update public.produse p
set nume_canonic = s.nume, nume = s.nume,
    nume_secundare = (select coalesce(array_agg(distinct x), '{}') from unnest(p.nume_secundare || s.nume_secundare) x where x <> s.nume),
    tip = coalesce(s.tip, p.tip), grupa_toxicitate = coalesce(s.grupa_toxicitate, p.grupa_toxicitate),
    data_expirare = s.data_expirare, data_omologare = coalesce(s.data_omologare, p.data_omologare),
    status = s.status, sursa_url = 'ANF lista 03.10.2026', updated_at = now()
from public.import_anf_produse s join t_prod m on m.stage_id = s.id
where p.id = m.produs_id;

insert into public.produse (nume, nume_canonic, nume_secundare, slug, tip, grupa_toxicitate, data_expirare, data_omologare, status, sursa_url)
select s.nume, s.nume, s.nume_secundare,
       case when exists (select 1 from public.produse p where p.slug = s.slug) then s.slug || '-anf' else s.slug end,
       s.tip, s.grupa_toxicitate, s.data_expirare, s.data_omologare, s.status, 'ANF lista 03.10.2026'
from public.import_anf_produse s join t_prod m on m.stage_id = s.id
where m.produs_id is null;

update t_prod m set produs_id = p.id
from public.import_anf_produse s, public.produse p
where m.stage_id = s.id and m.produs_id is null and p.sursa_url = 'ANF lista 03.10.2026' and p.nume_canonic = s.nume;

-- numele secundare -> sinonime (pentru omnibox)
insert into public.sinonime (entitate_tip, entitate_id, termen, sursa)
select 'produs', p.id, x, 'import'
from public.produse p cross join unnest(p.nume_secundare) x
where p.sursa_url = 'ANF lista 03.10.2026' and length(x) > 1
on conflict do nothing;

-- recomandările vechi (Centralizator) ale produselor acoperite acum de ANF -> retrase (înlocuite)
update public.recomandari r
set status = 'retras', observatii = concat_ws(' · ', r.observatii, 'înlocuit de importul ANF 2026-10'), updated_at = now()
where r.status = 'activ' and coalesce(r.sursa, '') not like 'ANF%'
  and r.produs_id in (select produs_id from t_prod where produs_id is not null);

-- 5) recomandări (un rând per produs × cultură canonică × șir brut de ținte)
with src as (
  select distinct on (m.produs_id, c.cultura_id, coalesce(td.daunator_id, (select id from public.daunatori where nume = 'Țintă nespecificată' limit 1)), d.doza_raw)
         s.id as stage_id, m.produs_id, c.cultura_id,
         coalesce(td.daunator_id, (select id from public.daunatori where nume = 'Țintă nespecificată' limit 1)) as daunator_id,
         t.agent, t.tinta_raw, d.doza_raw, d.doza_min, d.doza_max, d.unitate, d.moment,
         s.pauza_raw, s.pauza_zile, s.nr_trat_raw, s.nr_trat_max, s.tratament_samanta, s.nota, s.confidence, s.rand_nr, cr.text as cultura_raw, p.tip as tip_produs
  from public.import_anf_recomandari s
  join t_prod m on m.stage_id = s.produs_id
  join public.produse p on p.id = m.produs_id
  join t_cult c on c.slug = s.cultura_slug
  left join public.import_anf_culturi_raw cr on cr.id = s.cultura_raw_id
  left join public.import_anf_tinte t on t.id = s.tinta_id
  left join t_daun td on td.tinta_raw_id = s.tinta_id
  left join public.import_anf_doze d on d.id = s.doza_id
  where s.recomandare_id is null
  order by m.produs_id, c.cultura_id, 4, d.doza_raw, s.id
), ins as (
  insert into public.recomandari (produs_id, cultura_id, daunator_id, agent_tip, nume_ro, doza, unitate_doza, pauza, nr_tratamente, observatii, sursa,
                                  doza_min, doza_max, unitate, pauza_zile, nr_tratamente_max, mod_aplicare, moment_aplicare, tara, status, confidence, needs_review)
  select produs_id, cultura_id, daunator_id, agent, tinta_raw, doza_raw, unitate, pauza_raw, nr_trat_raw,
         concat_ws(' · ', 'cultură brută: ' || cultura_raw, nota),
         'ANF lista 03.10.2026 · rând ' || rand_nr,
         doza_min, doza_max, unitate, pauza_zile, nr_trat_max,
         case when tratament_samanta then 'tratament_samanta' else public.parse_mod_aplicare(moment, unitate, tip_produs) end,
         moment, 'RO', 'activ', confidence, true
  from src
  returning id, sursa, cultura_id
)
update public.import_anf_recomandari s set recomandare_id = i.id
from ins i join t_cult c on c.cultura_id = i.cultura_id
where i.sursa = 'ANF lista 03.10.2026 · rând ' || s.rand_nr and s.cultura_slug = c.slug and s.recomandare_id is null;

-- 6) țintă × cultură (pentru „La ce cultură?” și indexul de căutare)
insert into public.tinta_cultura (tinta_id, cultura_id)
select distinct dt.tinta_id, coalesce(c.canonic_id, c.id)
from public.recomandari r
join public.daunator_tinta dt on dt.daunator_id = r.daunator_id
join public.culturi c on c.id = r.cultura_id
where r.sursa like 'ANF lista 03.10.2026%' and r.status = 'activ'
on conflict do nothing;

-- 7) produsele fără omologări lucrate -> import_raw (coada pentru „celelalte substanțe”)
insert into public.import_raw (sursa, fisier, rand_nr, continut, procesat)
select 'ANF lista 03.10.2026', 'Lista_pesticide-03.10.2026.xlsx', f.rand_nr,
       jsonb_build_object('produs', f.nume, 'nume_secundare', to_jsonb(f.nume_secundare), 'data_expirare', f.data_expirare, 'data_omologare', f.data_omologare, 'stare', 'fara_omologari_lucrate'),
       false
from public.import_anf_fara f
on conflict (sursa, hash) do nothing;

-- 8) index de căutare
refresh materialized view concurrently private.search_index;  -- mutat în schema private de 20261030_10
