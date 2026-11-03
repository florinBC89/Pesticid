-- =====================================================================
-- Pesticid — corecții după primul backfill + ierarhie de culturi
-- (Grâu de toamnă → Grâu → Cereale păioase), ca recomandările date
-- generic „la grâu” / „la cereale” să apară și pentru cultura specifică.
-- =====================================================================

-- ---------- corecții mapare culturi (rulate deja manual; idempotente) ----------
update public.culturi c set slug = x.slug, categorie = x.categorie, ordine = x.ordine, sinonime = x.sin
from (values ('Porumb','porumb','cereale',8,'{cucuruz,papusoi}'::text[]), ('Porumb zaharat','porumb-zaharat','legume',24,'{porumb dulce}'),
             ('Soia','soia','leguminoase',11,'{}'), ('Terenuri necultivate','terenuri-necultivate','teren',30,'{miriste,miristi,teren necultivat}')) as x(nume, slug, categorie, ordine, sin)
where c.nume = x.nume and c.slug like 'raw-%';

with reguli as (
  select * from (values
    ('miristi|necultivat|neutilizate|fara destinatie|cai ferate|terenuri cultivate si necultivate', 'terenuri-necultivate', 0),
    ('toate culturile|inainte de insamantare|inainte de rasarirea|preplantare|terenuri cultivate', 'toate-culturile-presemanat', 1),
    ('cereale', 'cereale-paioase', 2), ('grau.*durum|durum', 'grau-durum', 3), ('grau.*toamna.*primavara', 'grau', 4),
    ('(grau|rau).*primavara', 'grau-de-primavara', 5), ('grau.*toamna', 'grau-de-toamna', 6), ('grau|spelta', 'grau', 7),
    ('orz.*toamna.*primavara', 'orz', 8), ('orz.*primavara', 'orz-de-primavara', 9), ('orz.*toamna', 'orz-de-toamna', 10), ('^orz', 'orz', 11),
    ('ovaz', 'ovaz', 12), ('secara','secara',13), ('triticale','triticale',14), ('porumb (zaharat|dulce)', 'porumb-zaharat', 15), ('porumb','porumb',16),
    ('floarea','floarea-soarelui',17), ('rapita','rapita',18), ('soia','soia',19), ('mazare','mazare',20),
    ('lucern','lucerna',21), ('trifoi','trifoi',22), ('mustar','mustar',23), ('paji','pajisti',24)
  ) as r(pattern, slug_canonic, prio)
),
potrivire as (
  select c.id, (select r.slug_canonic from reguli r where public.norm_text(c.nume) ~ r.pattern order by r.prio limit 1) as slug_canonic
  from public.culturi c where c.slug like 'raw-%'
)
update public.culturi c set canonic_id = k.id
from potrivire p join public.culturi k on k.slug = p.slug_canonic
where c.id = p.id and c.id <> k.id and c.canonic_id is distinct from k.id;

insert into public.tinte (nume, nume_stiintific, tip, slug, luni_sezon) values
 ('Țânțarul florilor de mazăre (musculița galicolă)', 'Contarinia pisi', 'daunator', 'tantarul-florilor-de-mazare', '{5,6}')
on conflict (slug) do nothing;
insert into public.daunator_tinta (daunator_id, tinta_id)
select d.id, t.id from public.daunatori d join public.tinte t on t.slug = case when public.norm_text(d.nume) ~ 'tantarul florilor|musculita galicola' then 'tantarul-florilor-de-mazare' when public.norm_text(d.nume) ~ 'pajisti.*buruieni' then 'buruieni-mono-dicotiledonate' end
on conflict do nothing;

-- ---------- ierarhie culturi ----------
alter table public.culturi add column if not exists parinte_id bigint references public.culturi(id);
create index if not exists culturi_parinte_idx on public.culturi (parinte_id);

update public.culturi c set parinte_id = p.id
from (values
  ('grau-de-toamna','grau'), ('grau-de-primavara','grau'), ('grau-durum','grau'),
  ('orz-de-toamna','orz'), ('orz-de-primavara','orz'),
  ('grau','cereale-paioase'), ('orz','cereale-paioase'), ('ovaz','cereale-paioase'), ('secara','cereale-paioase'), ('triticale','cereale-paioase'),
  ('porumb-zaharat','porumb')
) as x(copil, parinte)
join public.culturi p on p.slug = x.parinte
where c.slug = x.copil;

-- slug-ul culturii + toți strămoșii (inclusiv „toate culturile” pentru produse pre-semănat)
create or replace function public.culturi_ancestori(p_slug text)
returns text[] language sql stable as $$
  with recursive up as (
    select c.id, c.slug, c.parinte_id from public.culturi c where c.slug = p_slug
    union all
    select p.id, p.slug, p.parinte_id from public.culturi p join up on p.id = up.parinte_id
  )
  select array_agg(slug) || array['toate-culturile-presemanat'] from up
$$;

-- recomanda(): include recomandările date la nivel de cultură părinte
create or replace function public.recomanda(
  p_cultura_slug text, p_tinta_slug text,
  p_suprafata_ha numeric default null, p_apa_l_ha numeric default null, p_rezervor_l numeric default null,
  p_lim int default 20)
returns table (
  recomandare_id bigint, produs_id bigint, produs text, produs_slug text, tip_produs text, status_produs text, grupa_toxicitate text,
  formulare text, cod_mod_actiune text, toxic_albine boolean, data_expirare date,
  cultura text, cultura_slug text, potrivire_cultura text,
  tinta text, tinta_bruta text, doza_min numeric, doza_max numeric, unitate text, pauza_zile int, nr_tratamente_max int,
  mod_aplicare text, moment_aplicare text, apa_min_l_ha numeric, apa_max_l_ha numeric, confidence smallint, needs_review boolean,
  cantitate_totala numeric, apa_totala numeric, nr_umpleri numeric, cantitate_per_rezervor numeric, concentratie_pct numeric,
  restrictii jsonb
)
language sql stable as $$
  with anc as (select public.culturi_ancestori(p_cultura_slug) as slugs),
  r as (
    select v.*, case when v.cultura_slug = p_cultura_slug then 'exacta' else 'parinte' end as potrivire_cultura,
           array_position((select slugs from anc), v.cultura_slug) as nivel
    from public.v_recomandari v, anc
    where v.cultura_slug = any(anc.slugs) and v.tinta_slug = p_tinta_slug
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

-- culturi_pentru_tinta(): afișează și culturile specifice (copiii) când recomandarea e la părinte
create or replace function public.culturi_pentru_tinta(p_tinta_slug text)
returns table (cultura_id bigint, cultura text, cultura_slug text, nr_produse bigint, potrivire text)
language sql stable as $$
  with directe as (
    select v.cultura_id, count(distinct v.produs_id) as n from public.v_recomandari v where v.tinta_slug = p_tinta_slug group by 1
  ),
  copii as (
    select c.id as cultura_id, d.n from public.culturi c join directe d on d.cultura_id = c.parinte_id
    union all
    select c.id, d.n from public.culturi c join public.culturi p on p.id = c.parinte_id join directe d on d.cultura_id = p.parinte_id
  )
  select c.id, c.nume, c.slug, x.n, x.potrivire
  from (select cultura_id, n, 'exacta' as potrivire from directe union all select cultura_id, n, 'parinte' from copii where cultura_id not in (select cultura_id from directe)) x
  join public.culturi c on c.id = x.cultura_id
  order by x.n desc, c.ordine, c.nume
$$;

grant execute on function public.culturi_ancestori(text), public.recomanda(text,text,numeric,numeric,numeric,int), public.culturi_pentru_tinta(text) to anon, authenticated;
select public.refresh_search_index();
