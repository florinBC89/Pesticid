-- =====================================================================
-- Pesticid — API pentru catalog (tabel / carduri) + calculatorul per produs
-- =====================================================================

-- un rând per produs, cu agregate din recomandări (doar confidence >= 20)
create or replace function public.catalog_produse(p_tip text default null, p_q text default null, p_doar_omologate boolean default false, p_lim int default 50, p_offset int default 0)
returns table (
  produs_id bigint, produs text, produs_slug text, tip text, status text, data_expirare date, grupa_toxicitate text,
  formulare text, nr_omologare text, substante text, nume_secundare text[],
  nr_culturi bigint, culturi text[], nr_tinte bigint, tinte text[],
  doza_min numeric, doza_max numeric, unitate text, pauza_max int, nr_recomandari bigint, total bigint
)
language sql stable set search_path = public, extensions as $$
  with f as (
    select p.*
    from public.produse p
    where p.status <> 'duplicat'
      and (p_tip is null or p.tip = p_tip)
      and (not p_doar_omologate or p.status = 'omologat')
      and (p_q is null or length(trim(p_q)) < 2
           or public.norm_text(coalesce(p.nume_canonic, p.nume) || ' ' || array_to_string(p.nume_secundare, ' ')) like '%' || public.norm_text(p_q) || '%'
           or exists (select 1 from public.produs_substanta ps join public.substante s on s.id = ps.substanta_id where ps.produs_id = p.id and public.norm_text(s.nume) like '%' || public.norm_text(p_q) || '%'))
  ),
  agg as (
    select v.produs_id,
           count(distinct v.cultura_id) as nr_culturi,
           (array_agg(distinct v.cultura))[1:6] as culturi,
           count(distinct v.tinta_id) as nr_tinte,
           (array_agg(distinct v.tinta) filter (where v.tinta is not null))[1:6] as tinte,
           min(v.doza_min) as doza_min, max(v.doza_max) as doza_max,
           (array_agg(v.unitate order by v.unitate) filter (where v.unitate is not null))[1] as unitate,
           max(v.pauza_zile) as pauza_max,
           count(*) as nr_recomandari
    from public.v_recomandari v where v.confidence >= 20 group by v.produs_id
  )
  select f.id, coalesce(f.nume_canonic, f.nume), f.slug, f.tip, f.status, f.data_expirare, f.grupa_toxicitate, f.formulare, f.nr_omologare,
         (select string_agg(s.nume || coalesce(' ' || ps.concentratie || ' ' || ps.unitate, ''), ' + ') from public.produs_substanta ps join public.substante s on s.id = ps.substanta_id where ps.produs_id = f.id),
         f.nume_secundare,
         coalesce(a.nr_culturi, 0), coalesce(a.culturi, '{}'), coalesce(a.nr_tinte, 0), coalesce(a.tinte, '{}'),
         a.doza_min, a.doza_max, a.unitate, a.pauza_max, coalesce(a.nr_recomandari, 0),
         count(*) over () as total
  from f left join agg a on a.produs_id = f.id
  order by (f.status = 'omologat') desc, coalesce(a.nr_recomandari, 0) desc, coalesce(f.nume_canonic, f.nume)
  limit p_lim offset p_offset
$$;
grant execute on function public.catalog_produse(text, text, boolean, int, int) to anon, authenticated;

-- omologările unui produs (pentru calculatorul din popover): cultură canonică × țintă → doză
create or replace function public.omologari_produs(p_slug text)
returns table (
  recomandare_id bigint, cultura_id bigint, cultura text, cultura_slug text, tinta_id bigint, tinta text, tinta_slug text, tip_tinta text, tinta_bruta text,
  doza_min numeric, doza_max numeric, unitate text, pauza_zile int, nr_tratamente_max int, mod_aplicare text, moment_aplicare text, confidence smallint
)
language sql stable set search_path = public, extensions as $$
  select v.recomandare_id, v.cultura_id, v.cultura, v.cultura_slug, v.tinta_id, v.tinta, v.tinta_slug, v.tip_tinta, v.tinta_bruta,
         v.doza_min, v.doza_max, v.unitate, v.pauza_zile, v.nr_tratamente_max, v.mod_aplicare, v.moment_aplicare, v.confidence
  from public.v_recomandari v
  where v.produs_slug = p_slug and v.confidence >= 20
  order by v.cultura, v.tinta nulls last
$$;
grant execute on function public.omologari_produs(text) to anon, authenticated;
