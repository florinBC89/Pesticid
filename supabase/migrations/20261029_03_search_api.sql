-- =====================================================================
-- Pesticid — index de căutare (omnibox) + API v2 pentru calculator
-- =====================================================================

-- ---------- search_index: o singură listă pentru omnibox ----------
drop materialized view if exists public.search_index;
create materialized view public.search_index as
with
culturi_c as (
  select 'cultura'::text as entitate_tip, c.id as entitate_id, c.nume as eticheta, c.categorie as sub_eticheta,
         c.slug, public.norm_text(c.nume) as eticheta_norm, c.ordine as prioritate,
         jsonb_build_object('categorie', c.categorie) as extra
  from public.culturi c where c.canonic_id is null and c.slug not like 'raw-%'
),
tinte_t as (
  select 'tinta', t.id, t.nume, t.nume_stiintific, t.slug, public.norm_text(t.nume || ' ' || coalesce(t.nume_stiintific,'')), 50,
         jsonb_build_object('tip', t.tip, 'luni_sezon', t.luni_sezon,
           'culturi', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nume', c.nume, 'slug', c.slug) order by c.ordine), '[]'::jsonb)
                       from public.tinta_cultura tc join public.culturi c on c.id = tc.cultura_id where tc.tinta_id = t.id))
  from public.tinte t
),
produse_p as (
  select 'produs', p.id, coalesce(p.nume_canonic, p.nume), p.tip, p.slug,
         public.norm_text(coalesce(p.nume_canonic, p.nume) || ' ' || array_to_string(p.nume_secundare, ' ')), 60,
         jsonb_build_object('tip', p.tip, 'status', p.status, 'data_expirare', p.data_expirare, 'nume_secundare', p.nume_secundare,
           'substante', (select coalesce(string_agg(s.nume || coalesce(' ' || ps.concentratie || ' ' || ps.unitate, ''), ' + '), '')
                         from public.produs_substanta ps join public.substante s on s.id = ps.substanta_id where ps.produs_id = p.id),
           'nr_culturi', (select count(distinct coalesce(c.canonic_id, c.id)) from public.recomandari r join public.culturi c on c.id = r.cultura_id where r.produs_id = p.id and r.status = 'activ'))
  from public.produse p where p.status <> 'duplicat'
),
substante_s as (
  select 'substanta', s.id, s.nume, s.tip, coalesce(s.slug, public.slugify(s.nume)), public.norm_text(s.nume), 70,
         jsonb_build_object('status_ue', s.status_ue, 'cod_mod_actiune', s.cod_mod_actiune,
           'nr_produse', (select count(*) from public.produs_substanta ps where ps.substanta_id = s.id))
  from public.substante s
),
sinonime_s as (
  select sn.entitate_tip, sn.entitate_id, sn.termen, 'sinonim', null::text, sn.termen_norm, 80, '{}'::jsonb
  from public.sinonime sn where sn.aprobat
)
select row_number() over () as id, * from (
  select * from culturi_c union all select * from tinte_t union all select * from produse_p union all select * from substante_s union all select * from sinonime_s
) u;
create unique index if not exists search_index_id_uq on public.search_index (id);
create index if not exists search_index_norm_trgm on public.search_index using gin (eticheta_norm gin_trgm_ops);
create index if not exists search_index_ent on public.search_index (entitate_tip, entitate_id);

create or replace function public.refresh_search_index()
returns void language sql security definer set search_path = public as
$$ refresh materialized view concurrently public.search_index $$;

-- ---------- cauta(q): typeahead grupat, ranking exact > prefix > fuzzy ----------
create or replace function public.cauta(q text, lim int default 12, luna int default extract(month from current_date)::int)
returns table (entitate_tip text, entitate_id bigint, eticheta text, sub_eticheta text, slug text, scor numeric, in_sezon boolean, extra jsonb)
language sql stable as $$
  with qn as (select public.norm_text(q) as s),
  hit as (
    select si.entitate_tip, si.entitate_id, si.eticheta, si.sub_eticheta, si.slug, si.extra, si.prioritate,
           case when si.eticheta_norm = qn.s then 100
                when si.eticheta_norm like qn.s || '%' then 80
                when si.eticheta_norm like '% ' || qn.s || '%' then 65
                else 50 * similarity(si.eticheta_norm, qn.s) end as scor_brut,
           (si.sub_eticheta = 'sinonim') as este_sinonim
    from public.search_index si, qn
    where length(qn.s) >= 2
      and (si.eticheta_norm like '%' || qn.s || '%' or similarity(si.eticheta_norm, qn.s) > 0.25)
  ),
  -- un sinonim potrivit trage entitatea lui (nu rândul de sinonim)
  rez as (
    select h.entitate_tip, h.entitate_id,
           max(h.scor_brut) as scor_brut
    from hit h group by 1, 2
  )
  select si.entitate_tip, si.entitate_id, si.eticheta, si.sub_eticheta, si.slug,
         round((r.scor_brut
                + case when si.extra ? 'luni_sezon' and (si.extra->'luni_sezon') @> to_jsonb(luna) then 8 else 0 end
                + case when si.extra->>'status' = 'omologat' then 3 when si.extra->>'status' in ('retras','expirat') then -10 else 0 end
                - si.prioritate / 100.0)::numeric, 2) as scor,
         (si.extra ? 'luni_sezon' and (si.extra->'luni_sezon') @> to_jsonb(luna)) as in_sezon,
         si.extra
  from rez r
  join public.search_index si on si.entitate_tip = r.entitate_tip and si.entitate_id = r.entitate_id and coalesce(si.sub_eticheta,'') <> 'sinonim'
  order by scor desc, si.eticheta
  limit lim
$$;

-- raportare căutare fără rezultat (crește tabelul de sinonime)
create or replace function public.raporteaza_cautare(q text, p_judet text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.cautari_fara_rezultat (termen, judet) values (q, p_judet)
  on conflict (termen_norm) do update set nr = public.cautari_fara_rezultat.nr + 1, ultima_la = now(), judet = coalesce(excluded.judet, public.cautari_fara_rezultat.judet)
$$;

-- ---------- v_recomandari: tot ce are nevoie calculatorul, pe cultură canonică + țintă ----------
create or replace view public.v_recomandari as
select r.id as recomandare_id,
       p.id as produs_id, coalesce(p.nume_canonic, p.nume) as produs, p.slug as produs_slug, p.tip as tip_produs, p.status as status_produs,
       p.grupa_toxicitate, p.data_expirare, p.formulare, p.cod_mod_actiune, p.toxic_albine, p.nr_omologare,
       coalesce(c.canonic_id, c.id) as cultura_id, kc.nume as cultura, kc.slug as cultura_slug, c.nume as cultura_bruta,
       dt.tinta_id, t.nume as tinta, t.slug as tinta_slug, t.tip as tip_tinta, d.nume as tinta_bruta,
       r.doza_min, r.doza_max, r.unitate, r.apa_min_l_ha, r.apa_max_l_ha, r.pauza_zile, r.nr_tratamente_max, r.interval_zile_min,
       r.mod_aplicare, r.moment_aplicare, r.bbch_min, r.bbch_max, r.confidence, r.needs_review, r.sursa, r.tara
from public.recomandari r
join public.produse p on p.id = r.produs_id
join public.culturi c on c.id = r.cultura_id
join public.culturi kc on kc.id = coalesce(c.canonic_id, c.id)
join public.daunatori d on d.id = r.daunator_id
left join public.daunator_tinta dt on dt.daunator_id = d.id
left join public.tinte t on t.id = dt.tinta_id
where r.status = 'activ' and p.status <> 'duplicat';

-- ---------- recomanda(cultura, tinta): produsele + calculul (ha, apă, rezervor) ----------
create or replace function public.recomanda(
  p_cultura_slug text, p_tinta_slug text,
  p_suprafata_ha numeric default null, p_apa_l_ha numeric default null, p_rezervor_l numeric default null,
  p_lim int default 20)
returns table (
  recomandare_id bigint, produs_id bigint, produs text, produs_slug text, tip_produs text, status_produs text, grupa_toxicitate text,
  formulare text, cod_mod_actiune text, toxic_albine boolean, data_expirare date,
  tinta text, tinta_bruta text, doza_min numeric, doza_max numeric, unitate text, pauza_zile int, nr_tratamente_max int,
  mod_aplicare text, moment_aplicare text, apa_min_l_ha numeric, apa_max_l_ha numeric, confidence smallint, needs_review boolean,
  -- calcul (pe doza_min; UI poate recalcula pe orice doză din interval)
  cantitate_totala numeric, apa_totala numeric, nr_umpleri numeric, cantitate_per_rezervor numeric, concentratie_pct numeric,
  restrictii jsonb
)
language sql stable as $$
  with r as (
    select * from public.v_recomandari v
    where v.cultura_slug = p_cultura_slug and v.tinta_slug = p_tinta_slug
  ),
  calc as (
    select r.*,
      case when p_suprafata_ha is not null then round(r.doza_min * p_suprafata_ha, 3) end as cantitate_totala,
      case when p_suprafata_ha is not null and p_apa_l_ha is not null then round(p_apa_l_ha * p_suprafata_ha, 1) end as apa_totala,
      case when p_suprafata_ha is not null and p_apa_l_ha is not null and p_rezervor_l is not null then round(p_apa_l_ha * p_suprafata_ha / p_rezervor_l, 2) end as nr_umpleri,
      case when p_apa_l_ha is not null and p_rezervor_l is not null and r.unitate in ('L/ha','ml/ha','kg/ha','g/ha')
           then round(r.doza_min * (p_rezervor_l / p_apa_l_ha), 4) end as cantitate_per_rezervor,
      case when p_apa_l_ha is not null and r.unitate in ('L/ha','kg/ha') then round(r.doza_min / p_apa_l_ha * 100, 4)
           when p_apa_l_ha is not null and r.unitate in ('ml/ha','g/ha') then round(r.doza_min / 1000 / p_apa_l_ha * 100, 4) end as concentratie_pct
    from r
  )
  select c.recomandare_id, c.produs_id, c.produs, c.produs_slug, c.tip_produs, c.status_produs, c.grupa_toxicitate,
         c.formulare, c.cod_mod_actiune, c.toxic_albine, c.data_expirare,
         c.tinta, c.tinta_bruta, c.doza_min, c.doza_max, c.unitate, c.pauza_zile, c.nr_tratamente_max,
         c.mod_aplicare, c.moment_aplicare, c.apa_min_l_ha, c.apa_max_l_ha, c.confidence, c.needs_review,
         c.cantitate_totala, c.apa_totala, c.nr_umpleri, c.cantitate_per_rezervor, c.concentratie_pct,
         (select coalesce(jsonb_agg(jsonb_build_object('tip', x.tip, 'severitate', x.severitate, 'text', x.text) order by x.severitate desc), '[]'::jsonb)
            from public.restrictii_produs x where x.produs_id = c.produs_id) as restrictii
  from calc c
  order by (c.status_produs = 'omologat') desc, c.confidence desc, c.pauza_zile nulls last, c.produs
  limit p_lim
$$;

-- culturile pentru care există recomandări pentru o țintă (pasul „La ce cultură?”)
create or replace function public.culturi_pentru_tinta(p_tinta_slug text)
returns table (cultura_id bigint, cultura text, cultura_slug text, nr_produse bigint)
language sql stable as $$
  select v.cultura_id, v.cultura, v.cultura_slug, count(distinct v.produs_id)
  from public.v_recomandari v where v.tinta_slug = p_tinta_slug
  group by 1,2,3 order by count(distinct v.produs_id) desc, v.cultura
$$;

-- "în sezon acum": ținte cu recomandări, filtrate pe lună (+ opțional pe culturi)
create or replace function public.in_sezon(luna int default extract(month from current_date)::int, p_culturi_slug text[] default null, lim int default 6)
returns table (tinta_id bigint, tinta text, tinta_slug text, tip text, culturi jsonb)
language sql stable as $$
  select t.id, t.nume, t.slug, t.tip,
         (select coalesce(jsonb_agg(jsonb_build_object('nume', c.nume, 'slug', c.slug) order by c.ordine), '[]'::jsonb)
            from public.tinta_cultura tc join public.culturi c on c.id = tc.cultura_id
           where tc.tinta_id = t.id and (p_culturi_slug is null or c.slug = any(p_culturi_slug)))
  from public.tinte t
  where luna = any(t.luni_sezon)
    and exists (select 1 from public.tinta_cultura tc join public.culturi c on c.id = tc.cultura_id
                 where tc.tinta_id = t.id and (p_culturi_slug is null or c.slug = any(p_culturi_slug)))
  order by (p_culturi_slug is not null) desc, t.tip, t.nume
  limit lim
$$;

grant select on public.search_index, public.v_recomandari to anon, authenticated;
grant execute on function public.cauta(text,int,int), public.recomanda(text,text,numeric,numeric,numeric,int),
  public.culturi_pentru_tinta(text), public.in_sezon(int,text[],int), public.raporteaza_cautare(text,text) to anon, authenticated;

select public.refresh_search_index();
