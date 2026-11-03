-- Snapshot pentru calculatorul de pe site (site/assets/calc-data.json).
-- Rulează în Supabase SQL Editor și salvează coloana `j` ca JSON (apoi normalizează numerele cu build_data).
-- Include DOAR produse omologate, nexpirate, cu doză parsată (confidence ≥ 45) — cele „284”.
with r as (
  select p.id produs_id, coalesce(c.canonic_id, c.id) cultura_id, r.daunator_id, r.doza_min, r.doza_max, r.unitate, r.pauza_zile, r.mod_aplicare
  from public.recomandari r
  join public.produse p on p.id = r.produs_id and p.status = 'omologat' and (p.data_expirare is null or p.data_expirare >= current_date)
  join public.culturi c on c.id = r.cultura_id
  where r.status = 'activ' and r.doza_min is not null and r.confidence >= 45
), x as (
  select r.produs_id, r.cultura_id, dt.tinta_id, r.unitate,
         min(r.doza_min) dmin, max(r.doza_max) dmax, max(r.pauza_zile) pauza,
         (array_agg(r.mod_aplicare) filter (where r.mod_aplicare is not null))[1] mod
  from r join public.daunator_tinta dt on dt.daunator_id = r.daunator_id
  group by 1,2,3,4
)
select json_build_object(
  'generat', to_char(now(), 'YYYY-MM-DD'),
  'produse', (select json_agg(json_build_array(p.id, coalesce(p.nume_canonic, p.nume), p.slug, p.tip, p.data_expirare, p.nume_secundare) order by coalesce(p.nume_canonic, p.nume))
              from public.produse p where p.id in (select produs_id from x)),
  'culturi', (select json_object_agg(c.id, c.nume) from public.culturi c where c.id in (select cultura_id from x)),
  'tinte', (select json_object_agg(t.id, json_build_array(t.nume, t.tip)) from public.tinte t where t.id in (select tinta_id from x)),
  'recs', (select json_agg(json_build_array(produs_id, cultura_id, tinta_id, dmin, dmax, unitate, pauza, mod) order by produs_id, cultura_id, tinta_id) from x)
)::text as j;

-- Adăugat ulterior în snapshot (site/assets/calc-data.json), pentru căutarea avansată:
--   'parinti'  : { cultura_id: parinte_id }  — select json_object_agg(id, parinte_id) from culturi where parinte_id is not null and id in (select cultura_id from x)
--   'sinonime' : { cultura: [[id, termen]...], tinta: [[id, termen]...] } — select ... from sinonime where aprobat and entitate_tip in ('cultura','tinta')
