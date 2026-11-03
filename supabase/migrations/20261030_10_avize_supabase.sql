-- =====================================================================
-- Pesticid — corecții cerute de Supabase Advisors (Security + Performance), 30.10.2026
--  1. extensiile unaccent și pg_trgm mutate din `public` în `extensions`
--  2. view-ul materializat search_index mutat în schema `private` (neexpusă prin API); cauta() îl citește de acolo
--  3. funcțiile apelate de client devin SECURITY INVOKER; scrierea e permisă prin politici RLS, nu prin privilegii de owner
--     - evenimente: doar INSERT, user_id = auth.uid() (sau null pentru vizitator)
--     - cautari_fara_rezultat: jurnal insert-only (fără ON CONFLICT), agregat în v_cautari_fara_rezultat (doar dashboard/service_role)
--  4. performanță: indexuri pe cheile străine, auth.uid() în subselect în politici, o singură politică permisivă per acțiune, indexuri duplicate eliminate
-- =====================================================================
set search_path = public, extensions;

-- ---------------------------------------------------------------- 1) extensii
alter extension unaccent set schema extensions;
alter extension pg_trgm set schema extensions;

create or replace function public.f_unaccent(t text)
returns text language sql immutable parallel safe strict
set search_path = public, extensions
as $$ select extensions.unaccent('extensions.unaccent', t) $$;

-- ---------------------------------------------------------------- 2) search_index -> private
create schema if not exists private;
revoke all on schema private from public;
alter materialized view public.search_index set schema private;
grant usage on schema private to anon, authenticated, service_role;
grant select on private.search_index to anon, authenticated, service_role;

create or replace function public.cauta(q text, lim integer default 12, luna integer default extract(month from current_date)::int)
returns table (entitate_tip text, entitate_id bigint, eticheta text, sub_eticheta text, slug text, scor numeric, in_sezon boolean, extra jsonb)
language sql stable
set search_path = public, extensions
as $$
  with qn as (select public.norm_text(q) as s),
  hit as (
    select si.entitate_tip, si.entitate_id,
           case when si.eticheta_norm = qn.s then 100
                when si.eticheta_norm like qn.s || '%' then 80
                when si.eticheta_norm like '% ' || qn.s || '%' then 65
                else 50 * similarity(si.eticheta_norm, qn.s) end as scor_brut
    from private.search_index si, qn
    where length(qn.s) >= 2
      and (si.eticheta_norm like '%' || qn.s || '%' or similarity(si.eticheta_norm, qn.s) > 0.25)
  ),
  rez as (select h.entitate_tip, h.entitate_id, max(h.scor_brut) as scor_brut from hit h group by 1, 2)
  select si.entitate_tip, si.entitate_id, si.eticheta, si.sub_eticheta, si.slug,
         round((r.scor_brut
                + case when si.extra ? 'luni_sezon' and (si.extra->'luni_sezon') @> to_jsonb(luna) then 8 else 0 end
                + case when si.extra->>'status' = 'omologat' then 3 when si.extra->>'status' in ('retras','expirat') then -10 else 0 end
                - si.prioritate / 100.0)::numeric, 2) as scor,
         (si.extra ? 'luni_sezon' and (si.extra->'luni_sezon') @> to_jsonb(luna)) as in_sezon,
         si.extra
  from rez r
  join private.search_index si on si.entitate_tip = r.entitate_tip and si.entitate_id = r.entitate_id and coalesce(si.sub_eticheta,'') <> 'sinonim'
  order by scor desc, si.eticheta
  limit lim
$$;

create or replace function public.refresh_search_index()
returns void language sql security definer
set search_path = public, extensions
as $$ refresh materialized view concurrently private.search_index $$;
revoke execute on function public.refresh_search_index() from public, anon, authenticated;

-- ---------------------------------------------------------------- 3) SECURITY INVOKER + RLS
-- evenimente: clientul poate doar să insereze, pe propriul user_id
revoke all on public.evenimente from anon, authenticated;
grant insert on public.evenimente to anon, authenticated;
grant usage on sequence public.evenimente_id_seq to anon, authenticated;
drop policy if exists evenimente_insert on public.evenimente;
create policy evenimente_insert on public.evenimente
  for insert to anon, authenticated
  with check (user_id is not distinct from (select auth.uid()) and length(tip) between 1 and 40);

create or replace function public.inregistreaza_eveniment(p_tip text, p_payload jsonb default '{}'::jsonb, p_device_id text default null, p_sesiune_id text default null, p_url text default null)
returns void language sql security invoker
set search_path = public
as $$
  insert into public.evenimente (user_id, device_id, sesiune_id, tip, payload, url)
  values (auth.uid(), left(p_device_id, 64), left(p_sesiune_id, 64), left(p_tip, 40), coalesce(p_payload, '{}'), left(p_url, 300))
$$;

-- cautari_fara_rezultat: jurnal insert-only; agregarea se face în view (doar pentru dashboard / service_role)
alter table public.cautari_fara_rezultat drop constraint if exists cautari_fara_rezultat_termen_norm_key;
create index if not exists cautari_fara_rezultat_termen_norm_idx on public.cautari_fara_rezultat (termen_norm);
revoke all on public.cautari_fara_rezultat from anon, authenticated;
grant insert on public.cautari_fara_rezultat to anon, authenticated;
grant usage on sequence public.cautari_fara_rezultat_id_seq to anon, authenticated;
drop policy if exists cfr_insert on public.cautari_fara_rezultat;
create policy cfr_insert on public.cautari_fara_rezultat
  for insert to anon, authenticated
  with check (length(termen) between 2 and 120);

create or replace function public.raporteaza_cautare(q text, p_judet text default null)
returns void language sql security invoker
set search_path = public
as $$
  insert into public.cautari_fara_rezultat (termen, judet)
  select left(trim(q), 120), left(p_judet, 40)
  where length(trim(coalesce(q, ''))) >= 2
$$;

create or replace view public.v_cautari_fara_rezultat with (security_invoker = true) as
select termen_norm, min(termen) as termen, count(*)::int as nr, max(ultima_la) as ultima_la,
       bool_or(rezolvat) as rezolvat, array_remove(array_agg(distinct judet), null) as judete
from public.cautari_fara_rezultat
group by termen_norm
order by nr desc, ultima_la desc;
revoke all on public.v_cautari_fara_rezultat from anon, authenticated;

-- tabele doar pentru service_role (RLS pornit, fără politici — intenționat)
revoke all on public.import_raw from anon, authenticated;

-- ---------------------------------------------------------------- 4) performanță
-- 4a) auth.uid() evaluat o singură dată per interogare
drop policy if exists ferme_insert on public.ferme;
drop policy if exists ferme_update on public.ferme;
drop policy if exists ferme_delete on public.ferme;
create policy ferme_insert on public.ferme for insert to authenticated with check (owner_id = (select auth.uid()));
create policy ferme_update on public.ferme for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy ferme_delete on public.ferme for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists fm_write on public.ferme_membri;
create policy fm_insert on public.ferme_membri for insert to authenticated
  with check (exists (select 1 from public.ferme f where f.id = ferme_membri.ferma_id and f.owner_id = (select auth.uid())));
create policy fm_update on public.ferme_membri for update to authenticated
  using (exists (select 1 from public.ferme f where f.id = ferme_membri.ferma_id and f.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.ferme f where f.id = ferme_membri.ferma_id and f.owner_id = (select auth.uid())));
create policy fm_delete on public.ferme_membri for delete to authenticated
  using (exists (select 1 from public.ferme f where f.id = ferme_membri.ferma_id and f.owner_id = (select auth.uid())));

drop policy if exists cr_own on public.calcule_recente;
create policy cr_own on public.calcule_recente for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 4b) o singură politică permisivă per acțiune: _write (ALL) -> insert/update/delete separate
do $$
declare t text;
begin
  foreach t in array array['echipamente','magazie','operatori','parcele','tratamente'] loop
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.poate_edita(ferma_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.poate_edita(ferma_id)) with check (public.poate_edita(ferma_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.poate_edita(ferma_id))', t || '_delete', t);
  end loop;
end $$;

drop policy if exists tp_write on public.tratament_produse;
create policy tp_insert on public.tratament_produse for insert to authenticated
  with check (exists (select 1 from public.tratamente t where t.id = tratament_produse.tratament_id and public.poate_edita(t.ferma_id)));
create policy tp_update on public.tratament_produse for update to authenticated
  using (exists (select 1 from public.tratamente t where t.id = tratament_produse.tratament_id and public.poate_edita(t.ferma_id)))
  with check (exists (select 1 from public.tratamente t where t.id = tratament_produse.tratament_id and public.poate_edita(t.ferma_id)));
create policy tp_delete on public.tratament_produse for delete to authenticated
  using (exists (select 1 from public.tratamente t where t.id = tratament_produse.tratament_id and public.poate_edita(t.ferma_id)));

-- politici de citire duplicate (rămân culturi_read, daunatori_read, cultura_daunator_read, pesticide_read)
drop policy if exists "public read culturi" on public.culturi;
drop policy if exists "public read daunatori" on public.daunatori;
drop policy if exists "public read cultura_daunator" on public.cultura_daunator;
drop policy if exists "public read pesticide" on public.pesticide;

-- 4c) indexuri pe cheile străine fără index
create index if not exists compatibilitate_produse_produs_b_idx on public.compatibilitate_produse (produs_b_id);
create index if not exists cultura_daunator_daunator_idx on public.cultura_daunator (daunator_id);
create index if not exists daunator_pesticid_pesticid_idx on public.daunator_pesticid (pesticid_id);
create index if not exists daunator_tinta_tinta_idx on public.daunator_tinta (tinta_id);
create index if not exists magazie_produs_idx on public.magazie (produs_id);
create index if not exists operatori_ferma_idx on public.operatori (ferma_id);
create index if not exists parcele_cultura_idx on public.parcele (cultura_id);
create index if not exists produs_substanta_substanta_idx on public.produs_substanta (substanta_id);
create index if not exists tinta_cultura_cultura_idx on public.tinta_cultura (cultura_id);
create index if not exists tratament_produse_produs_idx on public.tratament_produse (produs_id);
create index if not exists tratament_produse_recomandare_idx on public.tratament_produse (recomandare_id);
create index if not exists tratamente_created_by_idx on public.tratamente (created_by);
create index if not exists tratamente_cultura_idx on public.tratamente (cultura_id);
create index if not exists tratamente_echipament_idx on public.tratamente (echipament_id);
create index if not exists tratamente_operator_idx on public.tratamente (operator_id);

-- 4d) indexuri duplicate
drop index if exists public.idx_produse_name;   -- identic cu idx_produse_nume
do $$
declare i int;
begin
  for i in 1..21 loop
    execute format('drop index if exists public.%I', 'kv_store_adfeb91c_key_idx' || i);  -- rămâne kv_store_adfeb91c_key_idx
  end loop;
end $$;
