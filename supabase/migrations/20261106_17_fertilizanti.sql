-- Catalogul de îngrășăminte autorizate în România, importat din lista MADR / ICPA actualizată la 01.06.2024
-- (supabase/import/madr/parse_madr.py → out/fertilizanti.json). Doar citire publică, ca produsele de protecția plantelor.
-- n / p2o5 / k2o sunt în `unitate_npk` (% sau g/l, uneori mg/l); toate elementele, cu unitatea lor, sunt în `nutrienti`.
-- `de_verificat` + `motive_verificare` marchează rândurile unde extragerea automată e nesigură.
create table if not exists public.fertilizanti (
  id bigint generated always as identity primary key,
  nr_madr text unique,                -- nr. crt. din listă, ex. „4.50”
  categorie_nr smallint not null,     -- 1..13, ca în listă
  categorie text not null,
  denumire text not null,
  compozitie_text text not null,      -- textul original din listă
  n numeric,
  p2o5 numeric,
  k2o numeric,
  unitate_npk text check (unitate_npk in ('%', 'g/l', 'mg/l', 'ppm', 'g/kg', 'mg/kg', 'mixt')),
  nutrienti jsonb not null default '{}'::jsonb,  -- { "N": {"v": 46, "u": "%"}, "B": {"v": 0.2, "u": "g/l", "max": 0.4}, … }
  forma text,                         -- lichid, suspensie, pulbere, granule, gel…
  culturi text[],                     -- doar unde lista le menționează
  autorizatie text,
  beneficiar text,
  observatii text,
  tip_autorizare text check (tip_autorizare in ('definitiv', 'provizoriu', 'exceptat')),
  data_autorizare date,
  productie_oprita boolean not null default false,  -- „*” în listă: producerea este oprită temporar
  anulata boolean not null default false,           -- autorizația menționează „anulată” (de obicei înlocuită de una nouă)
  de_verificat boolean not null default false,
  motive_verificare text[] not null default '{}',
  pagina smallint,
  sursa text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fertilizanti_categorie_idx on public.fertilizanti (categorie_nr);
create index if not exists fertilizanti_denumire_trgm_idx on public.fertilizanti using gin (denumire extensions.gin_trgm_ops);

alter table public.fertilizanti enable row level security;
drop policy if exists fertilizanti_read on public.fertilizanti;
create policy fertilizanti_read on public.fertilizanti for select using (true);
revoke insert, update, delete, truncate on public.fertilizanti from anon, authenticated;
