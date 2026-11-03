-- =====================================================================
-- Pesticid — calitatea datelor: unități uniforme, semnalare rânduri
-- nealiniate din import (tip produs ≠ tip țintă), deduplicare ierarhie
-- =====================================================================

-- 1) ml/ha → L/ha, g/ha → kg/ha (calculatorul lucrează într-o singură unitate per familie)
update public.recomandari set doza_min = doza_min / 1000, doza_max = doza_max / 1000, unitate = 'L/ha'  where unitate = 'ml/ha';
update public.recomandari set doza_min = doza_min / 1000, doza_max = doza_max / 1000, unitate = 'kg/ha' where unitate = 'g/ha';

-- 2) rânduri suspecte: insecticid „pentru boală”, erbicid „pentru boală”, fungicid „pentru buruieni” etc.
--    (importul Centralizator are blocuri cu coloana produs decalată). Nu le ștergem; le scoatem din rezultate
--    (confidence 10 < prag 20) și le lăsăm în coada de verificare.
with nepotrivite as (
  select distinct r.id
  from public.recomandari r
  join public.produse p on p.id = r.produs_id
  join public.daunator_tinta dt on dt.daunator_id = r.daunator_id
  join public.tinte t on t.id = dt.tinta_id
  where not (
       (p.tip = 'Insecticid' and t.tip = 'daunator')
    or (p.tip = 'Acaricid'   and t.tip = 'daunator')
    or (p.tip = 'Fungicid'   and t.tip = 'boala')
    or (p.tip = 'Erbicid'    and t.tip = 'buruiana')
    or (p.tip = 'Regulator de crestere' and t.tip = 'fiziologic')
    or (p.tip = 'Tratament samanta')
  )
)
update public.recomandari r set confidence = 10, needs_review = true,
  observatii = coalesce(observatii || ' | ', '') || 'AUTO: tip produs ≠ tip țintă — posibil rând decalat la import'
from nepotrivite n where r.id = n.id and r.confidence <> 10;

-- 3) recomanda(): prag de încredere (implicit 20) ca parametru
drop function if exists public.recomanda(text,text,numeric,numeric,numeric,int);
create or replace function public.recomanda(
  p_cultura_slug text, p_tinta_slug text,
  p_suprafata_ha numeric default null, p_apa_l_ha numeric default null, p_rezervor_l numeric default null,
  p_lim int default 20, p_min_confidence int default 20)
returns table (
  recomandare_id bigint, produs_id bigint, produs text, produs_slug text, tip_produs text, status_produs text, grupa_toxicitate text,
  formulare text, cod_mod_actiune text, toxic_albine boolean, data_expirare date,
  cultura text, cultura_slug text, potrivire_cultura text,
  tinta text, tinta_bruta text, doza_min numeric, doza_max numeric, unitate text, pauza_zile int, nr_tratamente_max int,
  mod_aplicare text, moment_aplicare text, apa_min_l_ha numeric, apa_max_l_ha numeric, confidence smallint, needs_review boolean,
  cantitate_totala numeric, apa_totala numeric, nr_umpleri numeric, cantitate_per_rezervor numeric, concentratie_pct numeric,
  restrictii jsonb
)
language sql stable set search_path = public, extensions as $$
  with anc as (select public.culturi_ancestori(p_cultura_slug) as slugs),
  r as (
    select v.*, case when v.cultura_slug = p_cultura_slug then 'exacta' else 'parinte' end as potrivire_cultura,
           array_position((select slugs from anc), v.cultura_slug) as nivel
    from public.v_recomandari v, anc
    where v.cultura_slug = any(anc.slugs) and v.tinta_slug = p_tinta_slug and v.confidence >= p_min_confidence
  ),
  calc as (
    select r.*,
      case when p_suprafata_ha is not null then round(r.doza_min * p_suprafata_ha, 3) end as cantitate_totala,
      case when p_suprafata_ha is not null and p_apa_l_ha is not null then round(p_apa_l_ha * p_suprafata_ha, 1) end as apa_totala,
      case when p_suprafata_ha is not null and p_apa_l_ha is not null and p_rezervor_l is not null then round(p_apa_l_ha * p_suprafata_ha / p_rezervor_l, 2) end as nr_umpleri,
      case when p_apa_l_ha is not null and p_rezervor_l is not null and r.unitate in ('L/ha','kg/ha')
           then round(r.doza_min * (p_rezervor_l / p_apa_l_ha), 4) end as cantitate_per_rezervor,
      case when p_apa_l_ha is not null and r.unitate in ('L/ha','kg/ha') then round(r.doza_min / p_apa_l_ha * 100, 4) end as concentratie_pct
    from r
  )
  select c.recomandare_id, c.produs_id, c.produs, c.produs_slug, c.tip_produs, c.status_produs, c.grupa_toxicitate,
         c.formulare, c.cod_mod_actiune, c.toxic_albine, c.data_expirare,
         c.cultura, c.cultura_slug, c.potrivire_cultura,
         c.tinta, c.tinta_bruta, c.doza_min, c.doza_max, c.unitate, c.pauza_zile, c.nr_tratamente_max,
         c.mod_aplicare, c.moment_aplicare, c.apa_min_l_ha, c.apa_max_l_ha, c.confidence, c.needs_review,
         c.cantitate_totala, c.apa_totala, c.nr_umpleri, c.cantitate_per_rezervor, c.concentratie_pct,
         (select coalesce(jsonb_agg(jsonb_build_object('tip', x.tip, 'severitate', x.severitate, 'text', x.text) order by x.severitate desc), '[]'::jsonb)
            from public.restrictii_produs x where x.produs_id = c.produs_id) as restrictii
  from calc c
  order by (c.status_produs = 'omologat') desc, c.nivel, c.confidence desc, c.pauza_zile nulls last, c.produs
  limit p_lim
$$;
grant execute on function public.recomanda(text,text,numeric,numeric,numeric,int,int) to anon, authenticated;

-- 4) culturi_pentru_tinta(): fără duplicate pe ierarhie
drop function if exists public.culturi_pentru_tinta(text);
create or replace function public.culturi_pentru_tinta(p_tinta_slug text)
returns table (cultura_id bigint, cultura text, cultura_slug text, nr_produse bigint, potrivire text)
language sql stable set search_path = public, extensions as $$
  with directe as (
    select v.cultura_id, count(distinct v.produs_id) as n from public.v_recomandari v
    where v.tinta_slug = p_tinta_slug and v.confidence >= 20 group by 1
  ),
  copii as (
    select c.id as cultura_id, d.n from public.culturi c join directe d on d.cultura_id = c.parinte_id
    union all
    select c.id, d.n from public.culturi c join public.culturi p on p.id = c.parinte_id join directe d on d.cultura_id = p.parinte_id
  ),
  toate as (
    select cultura_id, n, 'exacta' as potrivire from directe
    union all
    select cultura_id, n, 'parinte' from copii where cultura_id not in (select cultura_id from directe)
  )
  select c.id, c.nume, c.slug, max(t.n), min(t.potrivire)
  from toate t join public.culturi c on c.id = t.cultura_id
  group by c.id, c.nume, c.slug, c.ordine
  order by max(t.n) desc, c.ordine, c.nume
$$;
grant execute on function public.culturi_pentru_tinta(text) to anon, authenticated;

-- 5) coada de verificare pentru agronom
create or replace view public.v_recomandari_de_verificat with (security_invoker = true) as
select r.id, coalesce(p.nume_canonic, p.nume) as produs, p.tip as tip_produs, c.nume as cultura_bruta, d.nume as tinta_bruta,
       r.doza, r.unitate_doza, r.doza_min, r.doza_max, r.unitate, r.pauza_zile, r.confidence, r.observatii, r.sursa
from public.recomandari r
join public.produse p on p.id = r.produs_id
join public.culturi c on c.id = r.cultura_id
join public.daunatori d on d.id = r.daunator_id
where r.needs_review
order by r.confidence, p.nume, c.nume;
grant select on public.v_recomandari_de_verificat to authenticated;
