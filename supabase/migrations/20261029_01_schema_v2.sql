-- =====================================================================
-- Pesticid — schema v2 (aditivă, nu șterge nimic din schema existentă)
-- Strat A (existent): culturi, daunatori, pesticide, produse, substante,
--                     produs_substanta, recomandari, search_cache, popular_searches
-- Strat B (nou):      coloane tipizate + entități canonice + restricții +
--                     compatibilitate + sinonime + staging import
-- Strat C (nou):      fermă / parcele / echipamente / registru tratamente / magazie (RLS)
-- =====================================================================

create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- unaccent nu e IMMUTABLE; wrapper imutabil ca să putem indexa pe el
create or replace function public.f_unaccent(t text)
returns text language sql immutable parallel safe strict as
$$ select public.unaccent('public.unaccent', t) $$;

-- normalizare text pentru căutare: fără diacritice, lowercase, doar [a-z0-9 ]
create or replace function public.norm_text(t text)
returns text language sql immutable parallel safe as
$$ select trim(regexp_replace(lower(public.f_unaccent(coalesce(t,''))), '[^a-z0-9]+', ' ', 'g')) $$;

create or replace function public.slugify(t text)
returns text language sql immutable parallel safe as
$$ select regexp_replace(public.norm_text(t), '\s+', '-', 'g') $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------------
-- 1. PRODUSE — identitate comercială (strat local pe țară)
-- ---------------------------------------------------------------------
alter table public.produse
  add column if not exists nume_canonic      text,          -- "Karate Zeon" (fără "(NINJA - a doua denumire)")
  add column if not exists nume_secundare    text[] default '{}',   -- {"Ninja"}
  add column if not exists slug              text,
  add column if not exists tara              char(2) not null default 'RO',
  add column if not exists nr_omologare      text,          -- "347PC"
  add column if not exists data_omologare    date,
  add column if not exists data_retragere    date,          -- ultima zi de aplicare, dacă e retras
  add column if not exists status            text not null default 'omologat',
  add column if not exists detinator         text,          -- deținătorul omologării
  add column if not exists formulare         text,          -- EC, SC, CS, WG, SG, SL, OD, EW, FS, WP
  add column if not exists cod_mod_actiune   text,          -- IRAC 3A / FRAC 11 / HRAC 2
  add column if not exists toxic_albine      boolean,
  add column if not exists eticheta_url      text,
  add column if not exists sursa_url         text,
  add column if not exists verificat_la      timestamptz,
  add column if not exists updated_at        timestamptz not null default now();

alter table public.produse drop constraint if exists produse_status_chk;
alter table public.produse add constraint produse_status_chk
  check (status in ('omologat','retras','expirat','interzis','duplicat','necunoscut'));
alter table public.produse drop constraint if exists produse_tip_chk;
alter table public.produse add constraint produse_tip_chk
  check (tip is null or tip in ('Erbicid','Fungicid','Insecticid','Acaricid','Regulator de crestere','Tratament samanta','Adjuvant','Altul'));
create unique index if not exists produse_slug_tara_uq on public.produse (tara, slug) where slug is not null;
create index if not exists produse_nume_canonic_trgm on public.produse using gin (public.norm_text(nume_canonic) gin_trgm_ops);
drop trigger if exists produse_updated_at on public.produse;
create trigger produse_updated_at before update on public.produse for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. SUBSTANȚE ACTIVE — strat stabil la nivel UE
-- ---------------------------------------------------------------------
alter table public.substante
  add column if not exists tip               text,          -- insecticid / fungicid / erbicid / safener / regulator
  add column if not exists cod_mod_actiune   text,          -- IRAC 3A, FRAC 3, HRAC 9
  add column if not exists status_ue         text default 'aprobata',   -- aprobata / neaprobata / in_reevaluare
  add column if not exists aprobare_ue_pana  date,
  add column if not exists slug              text;
alter table public.substante drop constraint if exists substante_status_chk;
alter table public.substante add constraint substante_status_chk
  check (status_ue in ('aprobata','neaprobata','in_reevaluare','necunoscut'));
create unique index if not exists substante_slug_uq on public.substante (slug) where slug is not null;

alter table public.produs_substanta
  add column if not exists concentratie_val numeric(10,3); -- 50 (g/L), unitate rămâne în `unitate`

-- ---------------------------------------------------------------------
-- 3. CULTURI — variante brute → cultură canonică
-- ---------------------------------------------------------------------
-- tabelele vechi au id bigint fără default → adăugăm secvențe ca să putem insera rânduri noi
do $$ declare t text; begin
  foreach t in array array['culturi','daunatori','pesticide'] loop
    execute format('create sequence if not exists public.%I_id_seq', t);
    execute format('select setval(''public.%I_id_seq'', coalesce((select max(id) from public.%I), 0) + 1, false)', t, t);
    execute format('alter table public.%I alter column id set default nextval(''public.%I_id_seq'')', t, t);
    execute format('alter sequence public.%I_id_seq owned by public.%I.id', t, t);
  end loop;
end $$;
alter table public.culturi
  add column if not exists slug        text,
  add column if not exists canonic_id  bigint references public.culturi(id),  -- NULL = este ea însăși canonică
  add column if not exists nume_latin  text,
  add column if not exists sinonime    text[] default '{}',
  add column if not exists ordine      int default 100;   -- pentru liste scurte în UI
create unique index if not exists culturi_slug_uq on public.culturi (slug) where slug is not null;
create index if not exists culturi_canonic_idx on public.culturi (canonic_id);
alter table public.culturi drop constraint if exists culturi_categorie_chk;
alter table public.culturi add constraint culturi_categorie_chk
  check (categorie is null or categorie in ('cereale','oleaginoase','leguminoase','radacinoase','legume','pomi','vita_de_vie','furajere','plante_tehnice','teren','altele'));

-- ---------------------------------------------------------------------
-- 4. ȚINTE canonice (dăunător / boală / buruiană) și maparea de la
--    șirurile compuse din `daunatori` ("Afide, tripsi, viermele rosu")
-- ---------------------------------------------------------------------
create table if not exists public.tinte (
  id               bigserial primary key,
  nume             text not null,            -- "Afide (păduchi de frunze)"
  nume_stiintific  text,                     -- "Aphididae"
  tip              text not null check (tip in ('daunator','boala','buruiana','fiziologic','altul')),
  slug             text not null unique,
  descriere        text,
  luni_sezon       int[] default '{}',       -- {4,5,6,9,10} — pentru "în sezon acum"
  created_at       timestamptz default now()
);
create index if not exists tinte_nume_trgm on public.tinte using gin (public.norm_text(nume) gin_trgm_ops);

alter table public.daunatori
  add column if not exists slug      text,
  add column if not exists tip_norm  text,
  add column if not exists is_compus boolean default false;  -- șir cu mai multe ținte
alter table public.daunatori drop constraint if exists daunatori_tip_norm_chk;
alter table public.daunatori add constraint daunatori_tip_norm_chk
  check (tip_norm is null or tip_norm in ('daunator','boala','buruiana','fiziologic','altul'));

create table if not exists public.daunator_tinta (
  daunator_id bigint not null references public.daunatori(id) on delete cascade,
  tinta_id    bigint not null references public.tinte(id) on delete cascade,
  primary key (daunator_id, tinta_id)
);

-- țintă ↔ cultură (pentru "La ce cultură?" după ce alegi ținta; derivat și din recomandari)
create table if not exists public.tinta_cultura (
  tinta_id   bigint not null references public.tinte(id) on delete cascade,
  cultura_id bigint not null references public.culturi(id) on delete cascade,
  primary key (tinta_id, cultura_id)
);

-- ---------------------------------------------------------------------
-- 5. RECOMANDĂRI — sursa de adevăr pentru doză. Coloane tipizate lângă textul brut.
-- ---------------------------------------------------------------------
alter table public.recomandari
  add column if not exists doza_min          numeric(12,4),
  add column if not exists doza_max          numeric(12,4),
  add column if not exists unitate           text,            -- normalizată: L/ha, kg/ha, g/ha, ml/ha, L/t sem, ml/100 kg sem, %
  add column if not exists apa_min_l_ha      numeric(8,1),
  add column if not exists apa_max_l_ha      numeric(8,1),
  add column if not exists pauza_zile        int,
  add column if not exists nr_tratamente_max int,
  add column if not exists interval_zile_min int,
  add column if not exists mod_aplicare      text,            -- foliar / tratament_samanta / sol / preemergent / postemergent / preplantare
  add column if not exists moment_aplicare   text,            -- text liber curățat: "BBCH 31–69, la apariția coloniilor"
  add column if not exists bbch_min          int,
  add column if not exists bbch_max          int,
  add column if not exists tara              char(2) not null default 'RO',
  add column if not exists status            text not null default 'activ',
  add column if not exists sursa_url         text,
  add column if not exists confidence        smallint default 50,   -- 0–100
  add column if not exists needs_review      boolean not null default true,
  add column if not exists verificat_la      timestamptz,
  add column if not exists updated_at        timestamptz not null default now();
alter table public.recomandari drop constraint if exists recomandari_unitate_chk;
alter table public.recomandari add constraint recomandari_unitate_chk
  check (unitate is null or unitate in ('L/ha','ml/ha','kg/ha','g/ha','L/t sem','ml/100 kg sem','g/100 kg sem','kg/t sem','%','L/1000 L apa'));
alter table public.recomandari drop constraint if exists recomandari_mod_chk;
alter table public.recomandari add constraint recomandari_mod_chk
  check (mod_aplicare is null or mod_aplicare in ('foliar','tratament_samanta','sol','preemergent','postemergent','preplantare','postrecoltare'));
alter table public.recomandari drop constraint if exists recomandari_status_chk;
alter table public.recomandari add constraint recomandari_status_chk
  check (status in ('activ','retras','duplicat'));
alter table public.recomandari drop constraint if exists recomandari_doza_chk;
alter table public.recomandari add constraint recomandari_doza_chk
  check (doza_min is null or doza_max is null or doza_max >= doza_min);
create index if not exists recomandari_cultura_daunator_idx on public.recomandari (cultura_id, daunator_id) where status = 'activ';
create index if not exists recomandari_produs_idx on public.recomandari (produs_id) where status = 'activ';
drop trigger if exists recomandari_updated_at on public.recomandari;
create trigger recomandari_updated_at before update on public.recomandari for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 6. RESTRICȚII pe produs (albine, zonă tampon, temperatură, PPE…)
-- ---------------------------------------------------------------------
create table if not exists public.restrictii_produs (
  id          bigserial primary key,
  produs_id   bigint not null references public.produse(id) on delete cascade,
  tip         text not null check (tip in ('albine','zona_tampon','temperatura','vant','ape','echipament','ppe','rezistenta','interval','altul')),
  severitate  text not null default 'atentie' check (severitate in ('info','atentie','pericol')),
  text        text not null,                -- "Nu aplica la temperaturi > 25 °C"
  valoare_num numeric(10,2),                -- 25
  unitate     text,                         -- "°C", "m", "m/s", "zile"
  conditie    text,                         -- "cu duze antiderivă 90 %: 5 m"
  sursa       text,
  created_at  timestamptz default now()
);
create index if not exists restrictii_produs_idx on public.restrictii_produs (produs_id);

-- ---------------------------------------------------------------------
-- 7. COMPATIBILITATE tank mix (perechi explicite; regulile generale pe formulare stau în aplicație)
-- ---------------------------------------------------------------------
create table if not exists public.compatibilitate_produse (
  produs_a_id bigint not null references public.produse(id) on delete cascade,
  produs_b_id bigint not null references public.produse(id) on delete cascade,
  status      text not null check (status in ('compatibil','incompatibil','conditionat','necunoscut')),
  observatii  text,
  sursa       text,
  verificat_la timestamptz,
  primary key (produs_a_id, produs_b_id),
  check (produs_a_id < produs_b_id)   -- o singură direcție
);

-- ---------------------------------------------------------------------
-- 8. SINONIME (limbajul fermierilor → entități) + căutări fără rezultat
-- ---------------------------------------------------------------------
create table if not exists public.sinonime (
  id           bigserial primary key,
  entitate_tip text not null check (entitate_tip in ('cultura','tinta','produs','substanta')),
  entitate_id  bigint not null,
  termen       text not null,               -- "păduchi"
  termen_norm  text generated always as (public.norm_text(termen)) stored,
  sursa        text not null default 'manual' check (sursa in ('manual','import','user','auto')),
  aprobat      boolean not null default true,
  created_at   timestamptz default now(),
  unique (entitate_tip, entitate_id, termen_norm)
);
create index if not exists sinonime_termen_trgm on public.sinonime using gin (termen_norm gin_trgm_ops);

create table if not exists public.cautari_fara_rezultat (
  id          bigserial primary key,
  termen      text not null,
  termen_norm text generated always as (public.norm_text(termen)) stored,
  judet       text,
  nr          int not null default 1,
  ultima_la   timestamptz default now(),
  rezolvat    boolean default false,        -- true după ce am adăugat sinonim / entitate
  unique (termen_norm)
);

-- ---------------------------------------------------------------------
-- 9. STAGING import (păstrăm sursa brută, reprocesabilă)
-- ---------------------------------------------------------------------
create table if not exists public.import_raw (
  id          bigserial primary key,
  sursa       text not null,                -- "ANF centralizator 2026-10", "eticheta Karate Zeon pdf"
  fisier      text,
  rand_nr     int,
  continut    jsonb not null,
  hash        text generated always as (md5(continut::text)) stored,
  procesat    boolean default false,
  importat_la timestamptz default now()
);
create unique index if not exists import_raw_hash_uq on public.import_raw (sursa, hash);

-- =====================================================================
-- STRAT C — FERMĂ, PARCELE, REGISTRU (date private, RLS)
-- =====================================================================
create table if not exists public.ferme (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  denumire      text not null,
  cui           text,
  cod_apia      text,
  judet         text,
  localitate    text,
  telefon       text,
  tara          char(2) not null default 'RO',
  plan          text not null default 'free' check (plan in ('free','pro','agronom')),
  plan_expira_la date,
  trial_pana_la  date,
  created_at    timestamptz default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists ferme_owner_idx on public.ferme (owner_id);

create table if not exists public.ferme_membri (
  ferma_id  uuid not null references public.ferme(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  rol       text not null default 'operator' check (rol in ('owner','agronom','operator','cititor')),
  created_at timestamptz default now(),
  primary key (ferma_id, user_id)
);
create index if not exists ferme_membri_user_idx on public.ferme_membri (user_id);

create table if not exists public.parcele (
  id              uuid primary key default gen_random_uuid(),
  ferma_id        uuid not null references public.ferme(id) on delete cascade,
  nume            text not null,              -- "P1 · Lângă canal"
  bloc_fizic_apia text,
  suprafata_ha    numeric(10,2) not null check (suprafata_ha > 0),
  cultura_id      bigint references public.culturi(id),
  soi             text,
  sezon           text,                       -- "2026-2027"
  activ           boolean not null default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists parcele_ferma_idx on public.parcele (ferma_id);

create table if not exists public.echipamente (
  id                    uuid primary key default gen_random_uuid(),
  ferma_id              uuid not null references public.ferme(id) on delete cascade,
  nume                  text not null,
  capacitate_rezervor_l numeric(8,0) not null check (capacitate_rezervor_l > 0),
  latime_rampa_m        numeric(5,1),
  duze                  text,
  antideriva_pct        int check (antideriva_pct between 0 and 99),
  implicit              boolean not null default false,
  created_at            timestamptz default now()
);
create index if not exists echipamente_ferma_idx on public.echipamente (ferma_id);

create table if not exists public.operatori (
  id                uuid primary key default gen_random_uuid(),
  ferma_id          uuid not null references public.ferme(id) on delete cascade,
  nume              text not null,
  certificat        text,
  certificat_expira date,
  created_at        timestamptz default now()
);

-- Registrul tratamentelor: un tratament = o trecere (poate avea 1..n produse = tank mix)
create table if not exists public.tratamente (
  id                   uuid primary key default gen_random_uuid(),
  ferma_id             uuid not null references public.ferme(id) on delete cascade,
  parcela_id           uuid references public.parcele(id) on delete set null,
  data_aplicare        date not null,
  status               text not null default 'planificat' check (status in ('planificat','aplicat','anulat')),
  cultura_id           bigint references public.culturi(id),
  suprafata_ha         numeric(10,2) not null check (suprafata_ha > 0),
  volum_apa_l_ha       numeric(8,1),
  echipament_id        uuid references public.echipamente(id) on delete set null,
  operator_id          uuid references public.operatori(id) on delete set null,
  sursa                text not null default 'manual' check (sursa in ('calcul','tank_mix','manual','import')),
  recoltare_permisa_de date,                 -- max(data_aplicare + pauza_zile) peste produse
  observatii           text,
  created_by           uuid references auth.users(id),
  created_at           timestamptz default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists tratamente_ferma_data_idx on public.tratamente (ferma_id, data_aplicare desc);
create index if not exists tratamente_parcela_idx on public.tratamente (parcela_id);

create table if not exists public.tratament_produse (
  id                      uuid primary key default gen_random_uuid(),
  tratament_id            uuid not null references public.tratamente(id) on delete cascade,
  produs_id               bigint references public.produse(id),
  produs_text             text,                -- când produsul nu e în catalog (manual)
  recomandare_id          bigint references public.recomandari(id),
  tinta_text              text,                -- "Afide"
  doza                    numeric(12,4) not null,
  unitate                 text not null,
  cantitate_totala        numeric(12,3),       -- doza × ha
  cantitate_per_rezervor  numeric(12,3),
  nr_umpleri              numeric(6,2),
  pauza_zile              int,
  nr_omologare_snapshot   text,                -- ce scria în registru la momentul aplicării
  ordine_umplere          smallint,
  created_at              timestamptz default now()
);
create index if not exists tratament_produse_tratament_idx on public.tratament_produse (tratament_id);

create table if not exists public.magazie (
  id             uuid primary key default gen_random_uuid(),
  ferma_id       uuid not null references public.ferme(id) on delete cascade,
  produs_id      bigint not null references public.produse(id),
  cantitate      numeric(12,3) not null default 0,
  unitate        text not null default 'L',
  lot            text,
  data_expirare  date,
  updated_at     timestamptz not null default now(),
  unique (ferma_id, produs_id, lot)
);

-- calcule recente pentru tier Free (fără cont): 7 zile, pe device
create table if not exists public.calcule_recente (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  device_id  text,
  payload    jsonb not null,
  created_at timestamptz default now(),
  check (user_id is not null or device_id is not null)
);
create index if not exists calcule_recente_user_idx on public.calcule_recente (user_id, created_at desc);
create index if not exists calcule_recente_device_idx on public.calcule_recente (device_id, created_at desc);

-- updated_at triggers
do $$ declare t text; begin
  foreach t in array array['ferme','parcele','tratamente','magazie'] loop
    execute format('drop trigger if exists %I_updated_at on public.%I', t, t);
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- RLS — catalogul e public (read), ferma e privată (membri)
-- ---------------------------------------------------------------------
create or replace function public.este_membru(f uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ferme_membri m where m.ferma_id = f and m.user_id = auth.uid())
      or exists (select 1 from public.ferme x where x.id = f and x.owner_id = auth.uid())
$$;
create or replace function public.poate_edita(f uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ferme_membri m where m.ferma_id = f and m.user_id = auth.uid() and m.rol in ('owner','agronom','operator'))
      or exists (select 1 from public.ferme x where x.id = f and x.owner_id = auth.uid())
$$;

-- catalog: read pentru toată lumea (anon + auth), write doar service_role
do $$ declare t text; begin
  foreach t in array array['tinte','daunator_tinta','tinta_cultura','restrictii_produs','compatibilitate_produse','sinonime'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select using (true)', t, t);
  end loop;
end $$;
alter table public.import_raw enable row level security;             -- doar service_role
alter table public.cautari_fara_rezultat enable row level security;
drop policy if exists cfr_insert on public.cautari_fara_rezultat;
create policy cfr_insert on public.cautari_fara_rezultat for insert with check (true);  -- oricine poate raporta

-- fermă: membri
alter table public.ferme enable row level security;
drop policy if exists ferme_select on public.ferme; create policy ferme_select on public.ferme for select using (public.este_membru(id));
drop policy if exists ferme_insert on public.ferme; create policy ferme_insert on public.ferme for insert with check (owner_id = auth.uid());
drop policy if exists ferme_update on public.ferme; create policy ferme_update on public.ferme for update using (owner_id = auth.uid());
drop policy if exists ferme_delete on public.ferme; create policy ferme_delete on public.ferme for delete using (owner_id = auth.uid());

alter table public.ferme_membri enable row level security;
drop policy if exists fm_select on public.ferme_membri; create policy fm_select on public.ferme_membri for select using (public.este_membru(ferma_id));
drop policy if exists fm_write  on public.ferme_membri; create policy fm_write  on public.ferme_membri for all using (exists (select 1 from public.ferme f where f.id = ferma_id and f.owner_id = auth.uid()));

do $$ declare t text; begin
  foreach t in array array['parcele','echipamente','operatori','tratamente','magazie'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select using (public.este_membru(ferma_id))', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format('create policy %I_write on public.%I for all using (public.poate_edita(ferma_id)) with check (public.poate_edita(ferma_id))', t, t);
  end loop;
end $$;

alter table public.tratament_produse enable row level security;
drop policy if exists tp_select on public.tratament_produse;
create policy tp_select on public.tratament_produse for select using (exists (select 1 from public.tratamente t where t.id = tratament_id and public.este_membru(t.ferma_id)));
drop policy if exists tp_write on public.tratament_produse;
create policy tp_write on public.tratament_produse for all using (exists (select 1 from public.tratamente t where t.id = tratament_id and public.poate_edita(t.ferma_id)))
  with check (exists (select 1 from public.tratamente t where t.id = tratament_id and public.poate_edita(t.ferma_id)));

alter table public.calcule_recente enable row level security;
drop policy if exists cr_own on public.calcule_recente;
create policy cr_own on public.calcule_recente for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- owner-ul devine automat membru 'owner'
create or replace function public.ferma_owner_membru()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.ferme_membri (ferma_id, user_id, rol) values (new.id, new.owner_id, 'owner') on conflict do nothing;
  return new;
end $$;
drop trigger if exists ferme_owner_membru on public.ferme;
create trigger ferme_owner_membru after insert on public.ferme for each row execute function public.ferma_owner_membru();

comment on table public.recomandari is 'Sursa de adevăr pentru doză: produs × cultură × țintă. Folosiți doza_min/doza_max/unitate (tipizate), nu doza/unitate_doza (text brut).';
comment on table public.tinte is 'Ținte canonice (dăunător/boală/buruiană). daunatori.* rămâne șirul brut din import; daunator_tinta face legătura.';
comment on table public.tratamente is 'Registrul tratamentelor fitosanitare — o trecere; produsele în tratament_produse (tank mix = mai multe rânduri).';
