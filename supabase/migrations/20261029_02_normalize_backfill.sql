-- =====================================================================
-- Pesticid — normalizare + backfill din datele brute (Centralizator)
-- Rulabil de mai multe ori (idempotent). Nu șterge text brut.
-- =====================================================================

-- ---------- parsere ----------
create or replace function public.parse_doza(d text)
returns numeric[] language plpgsql immutable as $$
declare s text; m text[];
begin
  s := replace(replace(coalesce(d,''), ',', '.'), '–', '-');
  s := regexp_replace(s, '[^0-9.\-]+', ' ', 'g');
  m := regexp_match(s, '(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)');
  if m is not null then return array[m[1]::numeric, m[2]::numeric]; end if;
  m := regexp_match(s, '(\d+(?:\.\d+)?)');
  if m is not null then return array[m[1]::numeric, m[1]::numeric]; end if;
  return null;
end $$;

create or replace function public.parse_unitate(u text, d text)
returns text language plpgsql immutable as $$
declare s text := lower(public.f_unaccent(coalesce(u,''))); dd text := lower(coalesce(d,''));
begin
  if dd ~ '\d\s*m$' and s ~ '^\s*l\s*/\s*ha' then return 'ml/ha'; end if;   -- "62,5 m" + "l/ha"
  if s ~ '^\s*ml\s*/\s*100\s*kg' then return 'ml/100 kg sem';
  elsif s ~ '^\s*g\s*/\s*100\s*kg' then return 'g/100 kg sem';
  elsif s ~ '^\s*l\s*/\s*t'        then return 'L/t sem';
  elsif s ~ '^\s*kg\s*/\s*t'       then return 'kg/t sem';
  elsif s ~ '^\s*ml\s*/\s*ha'      then return 'ml/ha';
  elsif s ~ '^\s*l\s*/\s*ha'       then return 'L/ha';
  elsif s ~ '^\s*kg\s*/\s*ha'      then return 'kg/ha';
  elsif s ~ '^\s*g\s*/\s*ha'       then return 'g/ha';
  elsif s ~ '^\s*%'                then return '%';
  end if;
  return null;
end $$;

-- textul rămas după unitate = momentul aplicării
create or replace function public.parse_moment(u text)
returns text language sql immutable as $$
  select nullif(trim(regexp_replace(
    regexp_replace(coalesce(u,''), '^\s*(ml|l|kg|g)\s*/\s*(100\s*kg(\s*(de\s*)?(seminte|samanta))?|t(\s*de\s*samanta)?|ha)\s*', '', 'i'),
    '&#.*$', '')), '')
$$;

create or replace function public.parse_mod_aplicare(moment text, unitate text, tip_produs text)
returns text language plpgsql immutable as $$
declare s text := lower(public.f_unaccent(coalesce(moment,'')));
begin
  if unitate in ('L/t sem','ml/100 kg sem','g/100 kg sem','kg/t sem') then return 'tratament_samanta'; end if;
  if s ~ 'preemergent' or s ~ 'inainte de rasarire' then return 'preemergent'; end if;
  if s ~ 'postemergent' then return 'postemergent'; end if;
  if s ~ 'inainte de (semanat|insamantare|insamantarea|plantat|plantare)' or s ~ 'preplantare' then return 'preplantare'; end if;
  if s ~ 'dupa recoltare' then return 'postrecoltare'; end if;
  if tip_produs in ('Insecticid','Fungicid','Regulator de crestere','Regulatori de crestere','Acaricid') then return 'foliar'; end if;
  return null;
end $$;

create or replace function public.parse_nr_tratamente(u text)
returns int language plpgsql immutable as $$
declare s text := lower(public.f_unaccent(coalesce(u,''))); m text[];
begin
  if s ~ 'o singura (aplicare|data)|un (singur )?tratament' then return 1; end if;
  m := regexp_match(s, '(\d)\s*(aplicari|tratamente|x)');
  if m is not null then return m[1]::int; end if;
  return null;
end $$;

-- ---------- 1. PRODUSE: nume canonic, nume secundare, slug, corecții ----------
update public.produse set tip = 'Erbicid' where tip = '28.02.2028';
update public.produse set tip = 'Regulator de crestere' where tip = 'Regulatori de crestere';
alter table public.produse drop constraint if exists produse_tip_chk;
alter table public.produse add constraint produse_tip_chk
  check (tip is null or tip in ('Erbicid','Fungicid','Insecticid','Acaricid','Regulator de crestere','Tratament samanta','Adjuvant','Altul'));

update public.produse set
  nume_canonic   = trim(regexp_replace(nume, '\s*/?\s*\(.*$', '')),
  nume_secundare = coalesce(
      (select array[trim(m[1])] from regexp_match(nume, '\(\s*([^()]*?)\s*-\s*a doua', 'i') as m where m[1] is not null),
      '{}')
where nume_canonic is null;
-- duplicate după nume canonic (ex. LEOPARD 5 EC importat de 2 ori): recomandările se mută pe prima copie,
-- a doua devine 'duplicat' (nu se șterge — păstrăm urma importului)
with dup as (
  select p.id as dup_id, (select min(x.id) from public.produse x where x.nume_canonic = p.nume_canonic) as keep_id
  from public.produse p
  where p.id <> (select min(x.id) from public.produse x where x.nume_canonic = p.nume_canonic)
)
update public.recomandari r set produs_id = d.keep_id from dup d where r.produs_id = d.dup_id;
update public.produse p set status = 'duplicat'
where p.id <> (select min(x.id) from public.produse x where x.nume_canonic = p.nume_canonic);
-- slug unic pe (tara, slug): duplicatul primește sufix
update public.produse set slug = public.slugify(nume_canonic) || case when status = 'duplicat' then '-' || id else '' end where slug is null;
-- expirat după data_expirare
update public.produse set status = 'expirat' where status = 'omologat' and data_expirare is not null and data_expirare < current_date;

-- ---------- 2. CULTURI canonice ----------
insert into public.culturi (nume, categorie, slug, ordine, sinonime) values
 ('Grâu de toamnă',   'cereale',     'grau-de-toamna',    1,  '{grau,grâu,grau toamna}'),
 ('Grâu de primăvară','cereale',     'grau-de-primavara', 2,  '{}'),
 ('Grâu',             'cereale',     'grau',              3,  '{grâu}'),
 ('Grâu durum',       'cereale',     'grau-durum',        20, '{}'),
 ('Orz de toamnă',    'cereale',     'orz-de-toamna',     4,  '{}'),
 ('Orz de primăvară', 'cereale',     'orz-de-primavara',  5,  '{orzoaica}'),
 ('Orz',              'cereale',     'orz',               6,  '{}'),
 ('Ovăz',             'cereale',     'ovaz',              7,  '{}'),
 ('Secară',           'cereale',     'secara',            21, '{}'),
 ('Triticale',        'cereale',     'triticale',         22, '{}'),
 ('Cereale păioase',  'cereale',     'cereale-paioase',   23, '{cereale}'),
 ('Porumb',           'cereale',     'porumb',            8,  '{cucuruz,papusoi}'),
 ('Porumb zaharat',   'legume',      'porumb-zaharat',    24, '{porumb dulce}'),
 ('Floarea-soarelui', 'oleaginoase', 'floarea-soarelui',  9,  '{floarea soarelui,răsărită,rasarita}'),
 ('Rapiță',           'oleaginoase', 'rapita',            10, '{rapita de toamna,rapiță de toamnă}'),
 ('Soia',             'leguminoase', 'soia',              11, '{}'),
 ('Mazăre',           'leguminoase', 'mazare',            12, '{}'),
 ('Lucernă',          'furajere',    'lucerna',           13, '{}'),
 ('Trifoi',           'furajere',    'trifoi',            25, '{}'),
 ('Muștar',           'oleaginoase', 'mustar',            26, '{}'),
 ('Pajiști',          'furajere',    'pajisti',           27, '{pasuni,fanete}'),
 ('Terenuri necultivate','teren',    'terenuri-necultivate', 30, '{miriste,miristi,teren necultivat}'),
 ('Toate culturile (înainte de semănat / plantat)','teren','toate-culturile-presemanat', 31, '{pregatire pat germinativ}')
on conflict (nume) do nothing;

-- maparea variantelor brute → canonic (doar pentru rândurile fără slug canonic)
with reguli as (
  select * from (values
    ('grau.*durum|durum',                             'grau-durum', 1),
    ('(grau|rau).*primavara',                         'grau-de-primavara', 2),
    ('grau.*toamna.*primavara',                       'grau', 3),
    ('grau.*toamna',                                  'grau-de-toamna', 4),
    ('grau|spelta',                                   'grau', 5),
    ('orz.*toamna.*primavara',                        'orz', 6),
    ('orz.*primavara',                                'orz-de-primavara', 7),
    ('orz.*toamna',                                   'orz-de-toamna', 8),
    ('^orz',                                          'orz', 9),
    ('ovaz',                                          'ovaz', 10),
    ('secara',                                        'secara', 11),
    ('triticale',                                     'triticale', 12),
    ('porumb (zaharat|dulce)',                        'porumb-zaharat', 13),
    ('porumb',                                        'porumb', 14),
    ('floarea',                                       'floarea-soarelui', 15),
    ('rapita',                                        'rapita', 16),
    ('soia',                                          'soia', 17),
    ('mazare',                                        'mazare', 18),
    ('lucern',                                        'lucerna', 19),
    ('trifoi',                                        'trifoi', 20),
    ('mustar',                                        'mustar', 21),
    ('pajis',                                         'pajisti', 22),
    ('miristi|necultivat|neutilizate|fara destinatie|cai ferate', 'terenuri-necultivate', 23),
    ('toate culturile|inainte de insamantare|inainte de rasarirea|preplantare|terenuri cultivate', 'toate-culturile-presemanat', 24),
    ('cereale',                                       'cereale-paioase', 25)
  ) as r(pattern, slug_canonic, prio)
),
potrivire as (
  select c.id, (select r.slug_canonic from reguli r where public.norm_text(c.nume) ~ r.pattern order by r.prio limit 1) as slug_canonic
  from public.culturi c
  where c.canonic_id is null and (c.slug is null or c.slug not in (select slug_canonic from reguli))
)
update public.culturi c set canonic_id = k.id
from potrivire p join public.culturi k on k.slug = p.slug_canonic
where c.id = p.id and c.id <> k.id;
update public.culturi set slug = 'raw-' || id where slug is null;

-- ---------- 3. ȚINTE canonice + mapare dăunători compuși ----------
update public.daunatori set tip_norm = case tip when 'Dăunători' then 'daunator' when 'Boli' then 'boala' when 'Buruieni' then 'buruiana' end where tip_norm is null;
update public.daunatori set is_compus = (nume ~ '[,;]' or nume ~* ' si | și ') where is_compus is null or is_compus = false;
update public.daunatori set slug = 'raw-' || id where slug is null;

insert into public.tinte (nume, nume_stiintific, tip, slug, luni_sezon) values
 ('Afide (păduchi de frunze)',            'Aphididae',                       'daunator', 'afide',                 '{4,5,6,9,10}'),
 ('Ploșnița cerealelor',                  'Eurygaster spp.',                 'daunator', 'plosnita-cerealelor',   '{5,6}'),
 ('Gândacul bălos al ovăzului',           'Oulema melanopus',                'daunator', 'gandacul-balos',        '{5,6}'),
 ('Musca cerealelor / musca suedeză',     'Oscinella frit',                  'daunator', 'musca-cerealelor',      '{4,5,9,10}'),
 ('Viermele roșu al paiului',             'Haplodiplosis marginata',         'daunator', 'viermele-rosu-al-paiului','{5,6}'),
 ('Tripși',                               'Thysanoptera',                    'daunator', 'tripsi',                '{5,6}'),
 ('Gândacul lucios al rapiței',           'Brassicogethes aeneus',           'daunator', 'gandacul-lucios',       '{4,5}'),
 ('Gărgărița tulpinilor de rapiță',       'Ceutorhynchus napi',              'daunator', 'gargarita-tulpinilor',  '{3,4}'),
 ('Țânțarul silicvelor',                  'Dasineura brassicae',             'daunator', 'tantarul-silicvelor',   '{5}'),
 ('Puricii de pământ / cruciferelor',     'Phyllotreta spp.',                'daunator', 'puricii-de-pamant',     '{4,9}'),
 ('Viespea rapiței',                      'Athalia rosae',                   'daunator', 'viespea-rapitei',       '{9,10}'),
 ('Păduchele cenușiu al verzei',          'Brevicoryne brassicae',           'daunator', 'paduchele-cenusiu',     '{5,6,9}'),
 ('Sfredelitorul porumbului',             'Ostrinia nubilalis',              'daunator', 'sfredelitorul-porumbului','{6,7}'),
 ('Viermele vestic al rădăcinilor',       'Diabrotica virgifera',            'daunator', 'viermele-vestic',       '{6,7,8}'),
 ('Omida fructificațiilor',               'Helicoverpa armigera',            'daunator', 'omida-fructificatiilor','{7,8}'),
 ('Rățișoara porumbului',                 'Tanymecus dilaticollis',          'daunator', 'ratisoara',             '{4,5}'),
 ('Gărgărița frunzelor de mazăre',        'Sitona lineatus',                 'daunator', 'gargarita-mazarii',     '{4,5}'),
 ('Molia păstăilor de mazăre',            'Cydia nigricana',                 'daunator', 'molia-pastailor',       '{6}'),
 ('Complex dăunători lucernă',            null,                              'daunator', 'daunatori-lucerna',     '{5,6}'),
 ('Fluturele alb al verzei / buha verzei','Pieris brassicae, Mamestra brassicae','daunator','omizi-crucifere',    '{6,7,8}'),
 ('Septorioză',                           'Zymoseptoria tritici',            'boala',    'septorioza',            '{4,5}'),
 ('Rugina brună',                         'Puccinia triticina',              'boala',    'rugina-bruna',          '{5,6}'),
 ('Rugina galbenă',                       'Puccinia striiformis',            'boala',    'rugina-galbena',        '{4,5}'),
 ('Rugină (generic)',                     'Puccinia spp.',                   'boala',    'rugina',                '{4,5,6}'),
 ('Făinare',                              'Blumeria graminis',               'boala',    'fainare',               '{4,5}'),
 ('Fuzarioză',                            'Fusarium spp.',                   'boala',    'fuzarioza',             '{5,6}'),
 ('Helmintosporioză',                     'Bipolaris sorokiniana',           'boala',    'helmintosporioza',      '{4,5}'),
 ('Pătarea reticulară a orzului',         'Pyrenophora teres',               'boala',    'patarea-reticulara',    '{4,5}'),
 ('Arsura frunzelor de orz',              'Rhynchosporium secalis',          'boala',    'arsura-frunzelor-orz',  '{4,5}'),
 ('Sfâșierea frunzelor',                  'Pyrenophora spp.',                'boala',    'sfasierea-frunzelor',   '{4,5}'),
 ('Pătarea în ochi a bazei tulpinii',     'Oculimacula yallundae',           'boala',    'patarea-in-ochi',       '{3,4}'),
 ('Tăciune zburător',                     'Ustilago spp.',                   'boala',    'taciune',               '{9,10}'),
 ('Mălură',                               'Tilletia spp.',                   'boala',    'malura',                '{9,10}'),
 ('Mucegai de zăpadă',                    'Microdochium nivale',             'boala',    'mucegai-de-zapada',     '{9,10}'),
 ('Ramularia',                            'Ramularia collo-cygni',           'boala',    'ramularia',             '{5}'),
 ('Putregaiul alb',                       'Sclerotinia sclerotiorum',        'boala',    'putregaiul-alb',        '{4,5,6}'),
 ('Putregaiul negru al rapiței (fomoză)', 'Plenodomus lingam',               'boala',    'phoma',                 '{9,10,3}'),
 ('Alternarioză',                         'Alternaria spp.',                 'boala',    'alternarioza',          '{5,6}'),
 ('Mana cruciferelor',                    'Hyaloperonospora parasitica',     'boala',    'mana-cruciferelor',     '{9,10,4}'),
 ('Putregaiul cenușiu',                   'Botrytis cinerea',                'boala',    'putregaiul-cenusiu',    '{5,6}'),
 ('Pătarea brună și frângerea tulpinilor','Diaporthe helianthi',             'boala',    'patarea-bruna-floarea-soarelui','{6,7}'),
 ('Antracnoză',                           'Ascochyta spp.',                  'boala',    'antracnoza',            '{5,6}'),
 ('Boli soia (complex)',                  'Diaporthe, Peronospora, Septoria','boala',    'boli-soia',             '{6,7}'),
 ('Buruieni dicotiledonate anuale',       null,                              'buruiana', 'buruieni-dicotiledonate','{3,4,5,9,10}'),
 ('Buruieni monocotiledonate anuale',     null,                              'buruiana', 'buruieni-monocotiledonate','{3,4,5,9,10}'),
 ('Buruieni mono- și dicotiledonate',     null,                              'buruiana', 'buruieni-mono-dicotiledonate','{3,4,5,9,10}'),
 ('Buruieni perene',                      null,                              'buruiana', 'buruieni-perene',       '{4,5,6,8,9}'),
 ('Costrei din rizomi',                   'Sorghum halepense',               'buruiana', 'costrei',               '{5,6}'),
 ('Pir târâtor',                          'Elymus repens',                   'buruiana', 'pir',                   '{4,5,8,9}'),
 ('Samulastră de cereale',                null,                              'buruiana', 'samulastra',            '{9,10}'),
 ('Căderea plantelor (regulator de creștere)', null,                         'fiziologic','caderea-plantelor',    '{4,5}')
on conflict (slug) do nothing;

-- mapare: șir brut (norm) ~ pattern → tinta
with reguli as (
  select * from (values
    ('afid|paduche',                           'afide'),
    ('plosnita',                               'plosnita-cerealelor'),
    ('gandacul balos',                         'gandacul-balos'),
    ('musca',                                  'musca-cerealelor'),
    ('viermele rosu|cecydomidae',              'viermele-rosu-al-paiului'),
    ('trips',                                  'tripsi'),
    ('gandacul lucios',                        'gandacul-lucios'),
    ('gargarita tulpinilor|gargarita semintelor|gargarite', 'gargarita-tulpinilor'),
    ('tantarul silicvelor',                    'tantarul-silicvelor'),
    ('puric',                                  'puricii-de-pamant'),
    ('viespea rapitei',                        'viespea-rapitei'),
    ('paduchele cenusiu',                      'paduchele-cenusiu'),
    ('sfredelitor',                            'sfredelitorul-porumbului'),
    ('viermele vestic',                        'viermele-vestic'),
    ('omida|buha fructificatiilor',            'omida-fructificatiilor'),
    ('ratisoara',                              'ratisoara'),
    ('gargarita frunzelor de mazare',          'gargarita-mazarii'),
    ('molia pastailor',                        'molia-pastailor'),
    ('lucern',                                 'daunatori-lucerna'),
    ('fluturele alb|buha verzei',              'omizi-crucifere'),
    ('septori',                                'septorioza'),
    ('rugina bruna|puccinia recondita|puccinia triticina', 'rugina-bruna'),
    ('rugina galbena|striiformis',             'rugina-galbena'),
    ('rugin|puccinia|uromyces',                'rugina'),
    ('fainare|erysiphe|blumeria',              'fainare'),
    ('fusari|fuzari',                          'fuzarioza'),
    ('helminto',                               'helmintosporioza'),
    ('patarea reticulara|pyrenophora teres',   'patarea-reticulara'),
    ('arsura f|rhyn',                          'arsura-frunzelor-orz'),
    ('sfasierea',                              'sfasierea-frunzelor'),
    ('patarea in ochi|pseudocercosporella|oculimacula', 'patarea-in-ochi'),
    ('taciune',                                'taciune'),
    ('malura',                                 'malura'),
    ('mucegai',                                'mucegai-de-zapada'),
    ('ramularia',                              'ramularia'),
    ('putregaiul alb|sclerotinia',             'putregaiul-alb'),
    ('putregaiul negru|phoma|fomoza|lingam|plenodomus', 'phoma'),
    ('alternari',                              'alternarioza'),
    ('mana|peronospora',                       'mana-cruciferelor'),
    ('putregaiul cenusiu|botry',               'putregaiul-cenusiu'),
    ('patarea bruna|diaporthe helianthi|frangerea', 'patarea-bruna-floarea-soarelui'),
    ('antracnoza|ascochyta',                   'antracnoza'),
    ('diaporthe sojae|glycines|manshurica',    'boli-soia'),
    ('costrei|sorghum',                        'costrei'),
    ('pir|agropyron|elymus',                   'pir'),
    ('samulastr',                              'samulastra'),
    ('dicotiledonate.*monocotiledonate|monocotiledonate.*dicotiledonate|mono si dicot|mono și dicot', 'buruieni-mono-dicotiledonate'),
    ('dicotiledonate',                         'buruieni-dicotiledonate'),
    ('monocotiledonate',                       'buruieni-monocotiledonate'),
    ('perene',                                 'buruieni-perene'),
    ('cader',                                  'caderea-plantelor')
  ) as r(pattern, slug)
)
insert into public.daunator_tinta (daunator_id, tinta_id)
select distinct d.id, t.id
from public.daunatori d
join reguli r on public.norm_text(d.nume) ~ r.pattern
join public.tinte t on t.slug = r.slug
on conflict do nothing;

-- ---------- 4. RECOMANDĂRI: coloane tipizate ----------
update public.recomandari r set
  doza_min          = (public.parse_doza(r.doza))[1],
  doza_max          = (public.parse_doza(r.doza))[2],
  unitate           = public.parse_unitate(r.unitate_doza, r.doza),
  moment_aplicare   = public.parse_moment(r.unitate_doza),
  pauza_zile        = (regexp_match(coalesce(r.pauza,''), '(\d+)'))[1]::int,
  nr_tratamente_max = coalesce((regexp_match(coalesce(r.nr_tratamente,''), '(\d+)'))[1]::int, public.parse_nr_tratamente(r.unitate_doza)),
  bbch_min          = (regexp_match(coalesce(r.unitate_doza,''), 'BBCH\s*(\d+)', 'i'))[1]::int,
  bbch_max          = coalesce((regexp_match(coalesce(r.unitate_doza,''), 'BBCH\s*\d+\s*[-–]\s*(\d+)', 'i'))[1]::int,
                               (regexp_match(coalesce(r.unitate_doza,''), 'BBCH\s*(\d+)', 'i'))[1]::int),
  confidence        = 40
where r.doza_min is null;

update public.recomandari r set mod_aplicare = public.parse_mod_aplicare(r.moment_aplicare, r.unitate, p.tip)
from public.produse p where p.id = r.produs_id and r.mod_aplicare is null;

-- ---------- 5. țintă ↔ cultură (derivat din recomandări) ----------
insert into public.tinta_cultura (tinta_id, cultura_id)
select distinct dt.tinta_id, coalesce(c.canonic_id, c.id)
from public.recomandari r
join public.daunator_tinta dt on dt.daunator_id = r.daunator_id
join public.culturi c on c.id = r.cultura_id
where r.status = 'activ'
on conflict do nothing;

-- ---------- 6. SINONIME de pornire (limbajul fermierilor) ----------
insert into public.sinonime (entitate_tip, entitate_id, termen, sursa)
select 'tinta', t.id, s.termen, 'manual'
from (values
  ('afide','păduchi'), ('afide','paduchi'), ('afide','păduchi de frunze'), ('afide','paduchele verde'),
  ('plosnita-cerealelor','ploșniță'), ('plosnita-cerealelor','eurygaster'),
  ('gandacul-balos','oulema'), ('gandacul-balos','gândac bălos'),
  ('musca-cerealelor','musca suedeză'), ('musca-cerealelor','oscinella'),
  ('gandacul-lucios','meligethes'), ('gandacul-lucios','gândac lucios'),
  ('gargarita-tulpinilor','gărgăriță'), ('gargarita-tulpinilor','ceutorhynchus'),
  ('sfredelitorul-porumbului','ostrinia'), ('sfredelitorul-porumbului','sfredelitor'),
  ('viermele-vestic','diabrotica'), ('ratisoara','tanymecus'), ('ratisoara','rățișoară'),
  ('septorioza','septoria'), ('rugina-bruna','rugină'), ('fainare','făinare'), ('fainare','mildew'),
  ('fuzarioza','fusarium'), ('fuzarioza','fuzarioză spic'),
  ('phoma','fomoză'), ('phoma','putregai negru'), ('phoma','phoma lingam'),
  ('putregaiul-alb','sclerotinia'), ('putregaiul-alb','putregai alb'),
  ('mana-cruciferelor','mană'), ('costrei','costrei'), ('costrei','sorg'), ('pir','pir'), ('pir','pir târâtor'),
  ('buruieni-dicotiledonate','buruieni cu frunza lată'), ('buruieni-monocotiledonate','buruieni cu frunza îngustă'), ('buruieni-monocotiledonate','graminee'),
  ('buruieni-mono-dicotiledonate','buruieni'), ('buruieni-mono-dicotiledonate','ierburi'),
  ('caderea-plantelor','cădere'), ('caderea-plantelor','regulator')
) as s(slug, termen)
join public.tinte t on t.slug = s.slug
on conflict do nothing;

insert into public.sinonime (entitate_tip, entitate_id, termen, sursa)
select 'cultura', c.id, unnest(c.sinonime), 'manual'
from public.culturi c where c.canonic_id is null and cardinality(c.sinonime) > 0
on conflict do nothing;

insert into public.sinonime (entitate_tip, entitate_id, termen, sursa)
select 'produs', p.id, unnest(p.nume_secundare), 'import'
from public.produse p where cardinality(p.nume_secundare) > 0
on conflict do nothing;
